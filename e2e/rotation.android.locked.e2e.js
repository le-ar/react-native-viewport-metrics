const { expect: jestExpect } = require("@jest/globals");
const {
  expectPortraitWindow,
  isAndroid,
  launchApp,
  readMetricNumber,
  readMetricText,
  waitForMetricNumberGreaterThan,
  waitForMetricText,
} = require("./helpers/app");
const { rotateAndroidToPhysical } = require("./helpers/rotation");

const describeAndroid = isAndroid() ? describe : describe.skip;

describeAndroid("android locked rotation", () => {
  beforeEach(async () => {
    await launchApp({
      initialOrientationLock: "portrait-up",
    });
    await rotateAndroidToPhysical("portrait-up");
    await waitForMetricText("metric.orientationLock", "portrait-up");
    await waitForMetricText("metric.logicalOrientation", "portrait-up");
  });

  it("keeps logical orientation locked while physical orientation still changes", async () => {
    const initialPortraitRevision = await readMetricNumber(
      "metric.bankPortraitUpRevision"
    );
    const initialLandscapeLeftRevision = await readMetricNumber(
      "metric.bankLandscapeLeftRevision"
    );
    const initialLandscapeRightRevision = await readMetricNumber(
      "metric.bankLandscapeRightRevision"
    );

    await rotateAndroidToPhysical("landscape-left");
    jestExpect(await readMetricText("metric.physicalOrientation")).toBe(
      "landscape-left"
    );
    jestExpect(await readMetricText("metric.logicalOrientation")).toBe(
      "portrait-up"
    );
    const firstPortraitRevision = await waitForMetricNumberGreaterThan(
      "metric.bankPortraitUpRevision",
      initialPortraitRevision
    );
    jestExpect(await readMetricNumber("metric.bankLandscapeLeftRevision")).toBe(
      initialLandscapeLeftRevision
    );
    await expectPortraitWindow();

    await rotateAndroidToPhysical("landscape-right");
    jestExpect(await readMetricText("metric.physicalOrientation")).toBe(
      "landscape-right"
    );
    jestExpect(await readMetricText("metric.logicalOrientation")).toBe(
      "portrait-up"
    );
    await waitForMetricNumberGreaterThan(
      "metric.bankPortraitUpRevision",
      firstPortraitRevision
    );
    jestExpect(
      await readMetricNumber("metric.bankLandscapeRightRevision")
    ).toBe(initialLandscapeRightRevision);
    await expectPortraitWindow();
  });
});
