const { expect: jestExpect } = require("@jest/globals");
const {
  expectPortraitWindow,
  isAndroid,
  isIos,
  launchApp,
  readMetricNumber,
  readMetricText,
  sleep,
  waitForMetricStability,
  waitForMetricText,
  waitForReady,
} = require("./helpers/app");
const {
  rotateAndroidToPhysical,
  rotateIosToOrientation,
} = require("./helpers/rotation");

describe("background foreground lifecycle", () => {
  beforeEach(async () => {
    await launchApp();

    if (isAndroid()) {
      await rotateAndroidToPhysical("portrait-up");
    }

    if (isIos()) {
      await rotateIosToOrientation("portrait-up");
    }

    await waitForMetricText("metric.logicalOrientation", "portrait-up");
  });

  it("keeps a coherent snapshot after going to background and returning", async () => {
    const initialRevision = await readMetricNumber("metric.revision");
    const initialWorkletCount = await readMetricNumber(
      "metric.workletListenerCount"
    );

    await device.sendToHome();
    await sleep(1000);
    await device.launchApp({ newInstance: false });
    await waitForReady();
    await waitForMetricStability("metric.revision", 750, 15000);

    jestExpect(
      await readMetricNumber("metric.revision")
    ).toBeGreaterThanOrEqual(initialRevision);
    jestExpect(
      await readMetricNumber("metric.workletListenerCount")
    ).toBeGreaterThanOrEqual(initialWorkletCount);
    jestExpect(await readMetricNumber("metric.windowWidth")).toBeGreaterThan(0);
    jestExpect(await readMetricNumber("metric.windowHeight")).toBeGreaterThan(
      0
    );
    jestExpect(await readMetricNumber("metric.rootViewWidth")).toBeGreaterThan(
      0
    );
    jestExpect(await readMetricNumber("metric.rootViewHeight")).toBeGreaterThan(
      0
    );
    jestExpect(await readMetricText("metric.logicalOrientation")).toBe(
      "portrait-up"
    );
    jestExpect(await readMetricText("metric.physicalOrientation")).not.toBe(
      "unknown"
    );
    await expectPortraitWindow();
  });
});
