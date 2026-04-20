const { expect: jestExpect } = require("@jest/globals");
const {
  expectPortraitWindow,
  isIos,
  launchApp,
  readMetricNumber,
  readMetricText,
  waitForMetricNumberGreaterThan,
  waitForMetricText,
} = require("./helpers/app");
const { rotateIosToOrientation } = require("./helpers/rotation");

const describeIos = describe.skip;

describeIos("ios locked rotation", () => {
  beforeEach(async () => {
    await launchApp({
      initialOrientationLock: "portrait-up",
    });
    await rotateIosToOrientation("portrait-up");
    await waitForMetricText("metric.orientationLock", "portrait-up");
    await waitForMetricText("metric.logicalOrientation", "portrait-up");
  });

  it("keeps logical orientation locked while physical orientation reflects simulator rotation", async () => {
    const initialPortraitRevision = await readMetricNumber(
      "metric.bankPortraitUpRevision"
    );
    const initialLandscapeLeftRevision = await readMetricNumber(
      "metric.bankLandscapeLeftRevision"
    );

    await rotateIosToOrientation("landscape-left");
    jestExpect(await readMetricText("metric.physicalOrientation")).toBe(
      "landscape-left"
    );
    jestExpect(await readMetricText("metric.logicalOrientation")).toBe(
      "portrait-up"
    );
    await waitForMetricNumberGreaterThan(
      "metric.bankPortraitUpRevision",
      initialPortraitRevision
    );
    jestExpect(await readMetricNumber("metric.bankLandscapeLeftRevision")).toBe(
      initialLandscapeLeftRevision
    );
    await expectPortraitWindow();
  });
});
