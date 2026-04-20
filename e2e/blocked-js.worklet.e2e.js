const { expect: jestExpect } = require("@jest/globals");
const {
  launchApp,
  readMetricText,
  readMetricNumber,
  sleep,
  waitForMetricText,
  waitForMetricNumberGreaterThan,
} = require("./helpers/app");
const {
  rotateAndroidToPhysicalNoWait,
  rotateAndroidToPhysical,
  rotateIosToLandscapeNoWait,
  rotateIosToOrientation,
} = require("./helpers/rotation");
const {
  createTimingRunId,
  waitForIosNativeTimingDiagnosis,
} = require("./helpers/iosTiming");

let launchedAt = 0;
let iosTimingRunId = null;

async function runBlockedJsRotationScenario() {
  const initialPhysicalOrientation = await readMetricText(
    "metric.physicalOrientation"
  );
  const initialLogicalOrientation = await readMetricText(
    "metric.logicalOrientation"
  );

  if (device.getPlatform() === "android") {
    if (initialPhysicalOrientation !== "portrait-up") {
      await rotateAndroidToPhysical("portrait-up");
    }
  } else if (initialLogicalOrientation !== "portrait-up") {
    await rotateIosToOrientation("portrait-up");
  }

  const initialSharedRevision = await readMetricNumber("metric.sharedRevision");
  const initialLandscapeLeftRevision = await readMetricNumber(
    "metric.bankLandscapeLeftRevision"
  );
  const initialLandscapeRightRevision = await readMetricNumber(
    "metric.bankLandscapeRightRevision"
  );
  const rotateAfterLaunchMs = 7000;
  const rotateDelayMs = Math.max(0, launchedAt + rotateAfterLaunchMs - Date.now());
  await sleep(rotateDelayMs);

  if (device.getPlatform() === "android") {
    await rotateAndroidToPhysicalNoWait("landscape-left");
  } else {
    await rotateIosToLandscapeNoWait();
  }

  if (device.getPlatform() === "android") {
    await waitForMetricText(
      "metric.sharedSnapshotBeatJsDuringBlock",
      "true",
      10000
    );
  }
  const targetLogicalOrientation =
    device.getPlatform() === "android"
      ? "landscape-left"
      : await waitForLandscapeSharedOrientation();
  await waitForMetricNumberGreaterThan(
    "metric.sharedRevision",
    initialSharedRevision,
    10000
  );
  await waitForMetricNumberGreaterThan(
    targetLogicalOrientation === "landscape-left"
      ? "metric.bankLandscapeLeftRevision"
      : "metric.bankLandscapeRightRevision",
    targetLogicalOrientation === "landscape-left"
      ? initialLandscapeLeftRevision
      : initialLandscapeRightRevision,
    10000
  );
  await waitForMetricNumberGreaterThan("metric.jsBlockCount", 0, 12000);
  return targetLogicalOrientation;
}

async function waitForLandscapeSharedOrientation(timeout = 10000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const currentOrientation = await readMetricText(
      "metric.sharedLogicalOrientation"
    );

    if (
      currentOrientation === "landscape-left" ||
      currentOrientation === "landscape-right"
    ) {
      return currentOrientation;
    }

    await sleep(250);
  }

  throw new Error(
    "Timed out waiting for shared logical orientation to reach a landscape value"
  );
}

describe("blocked js worklet path", () => {
  beforeEach(async () => {
    iosTimingRunId =
      device.getPlatform() === "ios" ? createTimingRunId("blocked-js") : null;

    const launchArgs = {
      blockJsOnMountMs: 4500,
      blockJsOnMountDelayMs: 6500,
    };

    if (iosTimingRunId) {
      launchArgs.viewportMetricsNativeTiming = true;
      launchArgs.viewportMetricsTimingRunId = iosTimingRunId;
    }

    await launchApp(launchArgs);
    launchedAt = Date.now();
  });

  it("keeps worklet delivery alive during real rotation while JS is blocked", async () => {
    await runBlockedJsRotationScenario();
  });

  it("captures iOS native timing markers and classifies the delay", async () => {
    if (device.getPlatform() !== "ios") {
      return;
    }

    const targetLogicalOrientation = await runBlockedJsRotationScenario();
    const blockStartEpochMs = await readMetricNumber(
      "metric.jsBlockStartEpochMs"
    );
    const blockEndEpochMs = await readMetricNumber("metric.jsBlockEndEpochMs");
    const analysis = await waitForIosNativeTimingDiagnosis({
      runId: iosTimingRunId,
      targetLogicalOrientation,
      blockStartEpochMs,
      blockEndEpochMs,
    });

    console.log("[viewport-metrics-diagnostic]", JSON.stringify(analysis));
    jestExpect(analysis.classification).not.toBe("insufficient-data");
  });
});
