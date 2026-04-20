const os = require("node:os");
const path = require("node:path");
const { expect: jestExpect } = require("@jest/globals");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_LAUNCH_ARGS = {
  e2eMode: true,
};
const ACTION_COMMAND_TEST_IDS = {
  syncRead: "action.syncRead",
  blockJs: "action.blockJs",
  clearOrientationLock: "action.clearOrientationLock",
  lockPortraitUp: "action.lockPortraitUp",
  lockLandscapeLeft: "action.lockLandscapeLeft",
  lockLandscapeRight: "action.lockLandscapeRight",
  hideStatusBar: "action.hideStatusBar",
  showStatusBar: "action.showStatusBar",
  requestHomeIndicatorAutoHide: "action.requestHomeIndicatorAutoHide",
  hideSystemBars: "action.hideSystemBars",
  showSystemBars: "action.showSystemBars",
  setSystemBarsHiddenDefault: "action.setSystemBarsHiddenDefault",
  setSystemBarsHiddenTransient: "action.setSystemBarsHiddenTransient",
  setSystemBarsLockedHidden: "action.setSystemBarsLockedHidden",
  refreshNavigationBarVisibility: "action.refreshNavigationBarVisibility",
};
const DEV_SERVER_HOST =
  process.env.DETOX_DEV_SERVER_HOST ||
  process.env.REACT_NATIVE_PACKAGER_HOSTNAME ||
  getFirstExternalIpv4() ||
  "127.0.0.1";
const DEV_SERVER_PORT = process.env.DETOX_DEV_SERVER_PORT || "8081";
const DEV_CLIENT_SCHEME =
  process.env.DETOX_DEV_CLIENT_SCHEME || "exp+viewport-metrics-example";

function isAndroid() {
  return device.getPlatform() === "android";
}

function isIos() {
  return device.getPlatform() === "ios";
}

async function launchApp(launchArgs = {}) {
  const normalizedLaunchArgs = {
    ...DEFAULT_LAUNCH_ARGS,
    ...launchArgs,
  };

  await applyPrelaunchBaseline();

  if (isAndroid()) {
    normalizedLaunchArgs.EXDevMenuDisableAutoLaunch = true;
  }

  if (isIos()) {
    normalizedLaunchArgs["-initialUrl"] = getPreferredDevServerUrl();
  }

  const config = {
    newInstance: true,
    launchArgs: normalizedLaunchArgs,
    url: isAndroid() ? getPreferredDevClientUrl() : undefined,
    languageAndLocale: isIos()
      ? {
          language: "en-US",
          locale: "en-US",
        }
      : undefined,
  };

  await device.launchApp(config);
  if (isIos()) {
    await device.disableSynchronization();
  }
  await waitForReady();
  await applyPostLaunchBaseline(normalizedLaunchArgs);
}

function getPreferredDevServerUrl() {
  return `http://${DEV_SERVER_HOST}:${DEV_SERVER_PORT}`;
}

function getPreferredDevClientUrl() {
  const params = new URLSearchParams({
    url: getPreferredDevServerUrl(),
    disableOnboarding: "1",
  });

  return `${DEV_CLIENT_SCHEME}://expo-development-client/?${params.toString()}`;
}

function getFirstExternalIpv4() {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const details of interfaces || []) {
      if (
        details &&
        details.family === "IPv4" &&
        !details.internal &&
        details.address
      ) {
        return details.address;
      }
    }
  }
  return null;
}

async function waitForReady(timeout = DEFAULT_TIMEOUT) {
  await waitFor(element(by.id("e2e.ready")))
    .toHaveText("true")
    .withTimeout(timeout);
}

async function tapAction(testID) {
  const target = await ensureVisible(testID);
  await target.tap();
}

async function runAutomationCommand(command) {
  const directActionTestID = ACTION_COMMAND_TEST_IDS[command];

  if (directActionTestID) {
    try {
      await tapAction(directActionTestID);
      await sleep(300);
      return;
    } catch (_error) {
      // Fall through to the command input path when the action row becomes
      // difficult to interact with after rotation on smaller visible bounds.
    }
  }

  const nonce = Date.now();
  const target = await ensureVisible("action.commandInput");
  await target.replaceText(`${command}:${nonce}`);
  await sleep(300);
}

async function applyPrelaunchBaseline() {
  const { resetAndroidDeviceToPortrait } = require("./rotation");

  try {
    await device.terminateApp();
  } catch (_error) {
    // The app may already be stopped before the first launch in a suite.
  }

  if (isAndroid()) {
    await resetAndroidDeviceToPortrait();
  }
}

async function applyPostLaunchBaseline(launchArgs) {
  const {
    rotateAndroidToPhysical,
    rotateIosToOrientation,
  } = require("./rotation");
  const requestedOrientationLock = readRequestedOrientationLock(
    launchArgs.initialOrientationLock
  );
  const requestedSystemBarsMode = readRequestedSystemBarsMode(launchArgs);

  if (requestedOrientationLock === "default") {
    if (isAndroid()) {
      await rotateAndroidToPhysical("portrait-up");
    }

    if (isIos()) {
      await rotateIosToOrientation("portrait-up");
    }

    const currentOrientationLock = await readMetricText("metric.orientationLock");
    if (currentOrientationLock !== "default") {
      await runAutomationCommand("clearOrientationLock");
    }
    await waitForMetricText("metric.orientationLock", "default");
    await waitForMetricText("metric.logicalOrientation", "portrait-up");
  }

  if (readBoolean(launchArgs.hideStatusBarOnMount) !== true) {
    if (isIos()) {
      await waitForMetricText("metric.statusBarVisibility", "visible", 5000);
    } else {
      const currentStatusBarVisibility = await readMetricText(
        "metric.statusBarVisibility"
      );
      if (currentStatusBarVisibility !== "visible") {
        await runAutomationCommand("showStatusBar");
      }
      await waitForMetricText("metric.statusBarVisibility", "visible");
    }
  }

  if (isAndroid() && requestedSystemBarsMode === "visible") {
    await runAutomationCommand("setSystemBarsVisible");
    await waitForMetricText("metric.systemBarsMode", "visible");
    await waitForMetricText("metric.systemBarsHidden", "false");
  }
}

async function ensureVisible(testID) {
  const target = element(by.id(testID));

  try {
    await waitFor(target).toBeVisible().withTimeout(1000);
    return target;
  } catch (_error) {
    try {
      await element(by.id("screen.viewportMetrics")).scrollTo("top");
      await waitFor(target).toBeVisible().withTimeout(1000);
      return target;
    } catch {
      // Continue with directional scrolling below.
    }

    try {
      await element(by.id("screen.viewportMetrics")).scrollTo("bottom");
      await waitFor(target).toBeVisible().withTimeout(1000);
      return target;
    } catch {
      // Continue with directional scrolling below.
    }

    for (const direction of ["up", "down", "up", "down"]) {
      try {
        await waitFor(target)
          .toBeVisible()
          .whileElement(by.id("screen.viewportMetrics"))
          .scroll(240, direction);
        return target;
      } catch {
        continue;
      }
    }
  }

  return target;
}

async function readMetricText(testID) {
  const attributes = await element(by.id(testID)).getAttributes();

  if (typeof attributes.text === "string") {
    return attributes.text;
  }

  if (typeof attributes.label === "string") {
    return attributes.label;
  }

  if (typeof attributes.value === "string") {
    return attributes.value;
  }

  throw new Error(`Unable to read a textual value from ${testID}`);
}

async function readMetricNumber(testID) {
  const raw = await readMetricText(testID);
  const numeric = Number(raw);

  if (!Number.isFinite(numeric)) {
    throw new Error(`Metric ${testID} is not numeric: ${raw}`);
  }

  return numeric;
}

async function waitForMetricText(testID, expected, timeout = DEFAULT_TIMEOUT) {
  await waitFor(element(by.id(testID)))
    .toHaveText(String(expected))
    .withTimeout(timeout);
  return readMetricText(testID);
}

async function waitForMetricNumberGreaterThan(
  testID,
  minimum,
  timeout = DEFAULT_TIMEOUT
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const current = await readMetricNumber(testID);
    if (current > minimum) {
      return current;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${testID} to exceed ${minimum}`);
}

async function waitForMetricChange(
  testID,
  previousValue,
  timeout = DEFAULT_TIMEOUT
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const currentValue = await readMetricText(testID);
    if (currentValue !== String(previousValue)) {
      return currentValue;
    }
    await sleep(250);
  }

  throw new Error(
    `Timed out waiting for ${testID} to change from ${previousValue}`
  );
}

async function waitForMetricStability(
  testID,
  stableForMs = 1000,
  timeout = DEFAULT_TIMEOUT
) {
  const startedAt = Date.now();
  let lastValue = await readMetricText(testID);
  let lastChangedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    await sleep(250);
    const currentValue = await readMetricText(testID);

    if (currentValue !== lastValue) {
      lastValue = currentValue;
      lastChangedAt = Date.now();
      continue;
    }

    if (Date.now() - lastChangedAt >= stableForMs) {
      return currentValue;
    }
  }

  throw new Error(`Timed out waiting for ${testID} to stabilize`);
}

async function expectPortraitWindow() {
  const width = await readMetricNumber("metric.windowWidth");
  const height = await readMetricNumber("metric.windowHeight");
  jestExpect(height).toBeGreaterThan(width);
}

async function expectLandscapeWindow() {
  const width = await readMetricNumber("metric.windowWidth");
  const height = await readMetricNumber("metric.windowHeight");
  jestExpect(width).toBeGreaterThan(height);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readBoolean(value) {
  return value === true || value === "true";
}

function readRequestedOrientationLock(value) {
  switch (value) {
    case "portrait-up":
    case "landscape-left":
    case "landscape-right":
      return value;
    default:
      return "default";
  }
}

function readRequestedSystemBarsMode(launchArgs) {
  if (readBoolean(launchArgs.hideSystemBarsOnMount)) {
    return "hidden-transient";
  }

  switch (launchArgs.systemBarsModeOnMount) {
    case "hidden-default":
    case "hidden-transient":
    case "locked-hidden":
      return launchArgs.systemBarsModeOnMount;
    default:
      return "visible";
  }
}

module.exports = {
  DEFAULT_TIMEOUT,
  ROOT_DIR,
  expectLandscapeWindow,
  expectPortraitWindow,
  isAndroid,
  isIos,
  launchApp,
  readMetricNumber,
  readMetricText,
  runAutomationCommand,
  sleep,
  tapAction,
  waitForMetricChange,
  waitForMetricStability,
  waitForMetricNumberGreaterThan,
  waitForMetricText,
  waitForReady,
};
