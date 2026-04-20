const { expect: jestExpect } = require("@jest/globals");
const {
  expectLandscapeWindow,
  expectPortraitWindow,
  isAndroid,
  launchApp,
  readMetricNumber,
  waitForMetricStability,
  waitForMetricNumberGreaterThan,
  waitForMetricText,
} = require("./helpers/app");
const { rotateAndroidToPhysical } = require("./helpers/rotation");

const describeAndroid = isAndroid() ? describe : describe.skip;

describeAndroid("android unlocked rotation", () => {
  beforeEach(async () => {
    await launchApp();
    await rotateAndroidToPhysical("portrait-up");
    await waitForMetricText("metric.logicalOrientation", "portrait-up");
  });

  it("tracks real device rotation across both landscape directions", async () => {
    const initialRevision = Number(
      await waitForMetricStability("metric.revision")
    );
    const initialPortraitRevision = await readMetricNumber(
      "metric.bankPortraitUpRevision"
    );

    await rotateAndroidToPhysical("landscape-left");
    await waitForMetricText("metric.logicalOrientation", "landscape-left");
    await expectLandscapeWindow();
    const leftRevision = Number(
      await waitForMetricStability("metric.revision")
    );
    jestExpect(leftRevision).toBeGreaterThan(initialRevision);
    await waitForMetricNumberGreaterThan("metric.bankLandscapeLeftRevision", 0);

    await rotateAndroidToPhysical("landscape-right");
    await waitForMetricText("metric.logicalOrientation", "landscape-right");
    await expectLandscapeWindow();
    const rightRevision = Number(
      await waitForMetricStability("metric.revision")
    );
    jestExpect(rightRevision).toBeGreaterThan(leftRevision);
    await waitForMetricNumberGreaterThan(
      "metric.bankLandscapeRightRevision",
      0
    );

    await rotateAndroidToPhysical("portrait-up");
    await waitForMetricText("metric.logicalOrientation", "portrait-up");
    await expectPortraitWindow();
    const portraitRevision = Number(
      await waitForMetricStability("metric.revision")
    );
    jestExpect(portraitRevision).toBeGreaterThan(rightRevision);
    await waitForMetricNumberGreaterThan(
      "metric.bankPortraitUpRevision",
      initialPortraitRevision
    );
  });
});
