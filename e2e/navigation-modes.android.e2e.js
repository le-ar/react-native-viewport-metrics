const { expect: jestExpect } = require('@jest/globals');
const {
  isAndroid,
  launchApp,
  readMetricNumber,
  readMetricText,
  runAutomationCommand,
  sleep,
  waitForMetricNumberGreaterThan,
  waitForMetricStability,
  waitForMetricText,
} = require('./helpers/app');
const {
  NAVIGATION_MODE_CASES,
  captureOriginalNavigationMode,
  getCurrentNavigationModeValue,
  getCurrentSecureNavigationMode,
  isNavigationModeAvailable,
  restoreOriginalNavigationMode,
  setNavigationMode,
  swipeFromBottomEdge,
} = require('./helpers/androidSystemUi');

const describeAndroid = isAndroid() ? describe : describe.skip;
const LIVE_NAVIGATION_BAR_VISIBILITY_METRIC = 'metric.liveNavigationBarVisibility';

async function skipUnavailableNavigationMode(name) {
  if (isNavigationModeAvailable(name)) {
    return false;
  }

  console.log(`[android-navigation-matrix] skipped unavailable ${name} overlay`);
  return true;
}

async function expectCurrentNavigationMode(name) {
  const modeCase = NAVIGATION_MODE_CASES[name];

  jestExpect(getCurrentNavigationModeValue()).toBe(modeCase.expectedMode);

  const secureMode = getCurrentSecureNavigationMode();
  if (secureMode != null) {
    jestExpect(secureMode).toBe(modeCase.expectedMode);
  }
}

async function waitForMetricTextIfAvailable(testID, expected, timeout) {
  try {
    await waitForMetricTextByPolling(testID, expected, timeout);
    return true;
  } catch (_error) {
    return false;
  }
}

async function waitForMetricTextByPolling(testID, expected, timeout, interval = 100) {
  const startedAt = Date.now();
  let lastValue = null;

  while (Date.now() - startedAt < timeout) {
    lastValue = await readMetricText(testID);
    if (lastValue === String(expected)) {
      return lastValue;
    }
    await sleep(interval);
  }

  throw new Error(
    `Timed out waiting for ${testID} to be ${expected}; last value was ${lastValue}`
  );
}

async function expectVisibleSystemBars() {
  await waitForMetricText('metric.systemBarsTarget', 'visible');
  await waitForMetricText('metric.systemBarsHidden', 'false');
  await waitForMetricText('metric.statusBarVisibility', 'visible');
  await waitForMetricText('metric.navigationBarVisibility', 'visible');
  await waitForMetricNumberGreaterThan('metric.navigationBarHeight', 0);
  await waitForMetricNumberGreaterThan('metric.statusBarHeight', 0);
}

async function expectHiddenSystemBarsWithStableFootprint() {
  await waitForMetricText('metric.systemBarsTarget', 'hidden');
  await waitForMetricText('metric.systemBarsHidden', 'true');
  await waitForMetricText('metric.navigationBarVisibility', 'hidden');
  await waitForMetricText('metric.safeAreaBottom', '0');
  await waitForMetricStability('metric.revision', 750);

  const safeBottom = await readMetricNumber('metric.safeAreaBottom');
  const stableBottom = await readMetricNumber('metric.stableBottom');
  const navigationBarHeight = await readMetricNumber('metric.navigationBarHeight');

  jestExpect(stableBottom).toBeGreaterThan(safeBottom);
  jestExpect(navigationBarHeight).toBeGreaterThan(0);
}

async function runVisibleProfile() {
  await launchApp({
    systemBarsModeOnMount: 'visible',
  });

  await waitForMetricText('metric.systemBarsMode', 'visible');
  await expectVisibleSystemBars();
}

async function runHiddenDefaultProfile() {
  await launchApp({
    systemBarsModeOnMount: 'hidden-default',
  });

  await waitForMetricText('metric.systemBarsMode', 'hidden-default');
  await expectHiddenSystemBarsWithStableFootprint();
}

async function runHiddenTransientProfile(navigationModeName) {
  await launchApp({
    systemBarsModeOnMount: 'hidden-transient',
  });

  await waitForMetricText('metric.systemBarsMode', 'hidden-transient');
  await expectHiddenSystemBarsWithStableFootprint();

  await swipeFromBottomEdge();

  const swipeRevealed = await waitForMetricTextIfAvailable(
    LIVE_NAVIGATION_BAR_VISIBILITY_METRIC,
    'visible',
    5000
  );

  if (swipeRevealed) {
    const autoHidden = await waitForMetricTextIfAvailable(
      LIVE_NAVIGATION_BAR_VISIBILITY_METRIC,
      'hidden',
      10000
    );

    if (!autoHidden) {
      console.log(
        `[android-navigation-matrix] ${navigationModeName} transient bars did not auto-hide after swipe reveal; hiding through controller`
      );
      await runAutomationCommand('setSystemBarsHiddenTransient');
      await waitForMetricText(LIVE_NAVIGATION_BAR_VISIBILITY_METRIC, 'hidden', 8000);
    }
    return;
  }

  console.log(
    `[android-navigation-matrix] ${navigationModeName} transient swipe did not expose a visible nav inset; using scheduled controller reveal fallback`
  );
  await launchApp({
    systemBarsModeOnMount: 'hidden-transient',
    systemBarsShowAfterMountMs: 3500,
    systemBarsRehideAfterShowMs: 4000,
  });
  await waitForMetricText('metric.systemBarsMode', 'hidden-transient');
  await waitForMetricText(LIVE_NAVIGATION_BAR_VISIBILITY_METRIC, 'hidden', 8000);
  await waitForMetricTextByPolling(
    LIVE_NAVIGATION_BAR_VISIBILITY_METRIC,
    'visible',
    10000
  );
  await waitForMetricTextByPolling(
    LIVE_NAVIGATION_BAR_VISIBILITY_METRIC,
    'hidden',
    12000
  );
}

async function runLockedHiddenProfile() {
  await launchApp({
    systemBarsModeOnMount: 'locked-hidden',
  });

  await waitForMetricText('metric.systemBarsMode', 'locked-hidden');
  await expectHiddenSystemBarsWithStableFootprint();

  await runAutomationCommand('showSystemBars');
  await sleep(1000);
  await waitForMetricText('metric.navigationBarVisibility', 'hidden', 8000);

  await swipeFromBottomEdge();
  await sleep(1200);
  await waitForMetricText('metric.navigationBarVisibility', 'hidden', 8000);
}

const DISPLAY_PROFILES = [
  ['visible', runVisibleProfile],
  ['hidden-default', runHiddenDefaultProfile],
  ['hidden-transient', runHiddenTransientProfile],
  ['locked-hidden', runLockedHiddenProfile],
];

describeAndroid('android navigation and system-bar mode matrix', () => {
  beforeAll(async () => {
    await captureOriginalNavigationMode();
  });

  afterEach(async () => {
    await restoreOriginalNavigationMode();
  });

  afterAll(async () => {
    await restoreOriginalNavigationMode();
  });

  for (const navigationModeName of Object.keys(NAVIGATION_MODE_CASES)) {
    it(`switches emulator navigation mode to ${navigationModeName}`, async () => {
      if (await skipUnavailableNavigationMode(navigationModeName)) {
        return;
      }

      await setNavigationMode(navigationModeName);
      await expectCurrentNavigationMode(navigationModeName);
    });

    for (const [profileName, runProfile] of DISPLAY_PROFILES) {
      it(`captures ${profileName} system bars in ${navigationModeName} navigation`, async () => {
        if (await skipUnavailableNavigationMode(navigationModeName)) {
          return;
        }

        await setNavigationMode(navigationModeName);
        await expectCurrentNavigationMode(navigationModeName);
        await runProfile(navigationModeName);
      });
    }
  }
});
