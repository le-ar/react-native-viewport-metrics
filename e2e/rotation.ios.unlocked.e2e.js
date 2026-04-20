const {
  expectLandscapeWindow,
  expectPortraitWindow,
  isIos,
  launchApp,
  readMetricNumber,
  waitForMetricNumberGreaterThan,
  waitForMetricText,
} = require("./helpers/app");
const { rotateIosToOrientation } = require("./helpers/rotation");

const describeIos = isIos() ? describe : describe.skip;

describeIos("ios unlocked rotation", () => {
  beforeEach(async () => {
    await launchApp();
    await rotateIosToOrientation("portrait-up");
    await waitForMetricText("metric.logicalOrientation", "portrait-up");
  });

  it("tracks real simulator rotation across exact orientations", async () => {
    const initialRevision = await readMetricNumber("metric.revision");
    const initialPortraitRevision = await readMetricNumber(
      "metric.bankPortraitUpRevision"
    );

    await rotateIosToOrientation("landscape-left");
    await waitForMetricText("metric.logicalOrientation", "landscape-left");
    const leftRevision = await waitForMetricNumberGreaterThan(
      "metric.revision",
      initialRevision
    );
    await waitForMetricNumberGreaterThan("metric.bankLandscapeLeftRevision", 0);
    await expectLandscapeWindow();

    await rotateIosToOrientation("landscape-right");
    await waitForMetricText("metric.logicalOrientation", "landscape-right");
    await waitForMetricNumberGreaterThan("metric.revision", leftRevision);
    await waitForMetricNumberGreaterThan(
      "metric.bankLandscapeRightRevision",
      0
    );
    await expectLandscapeWindow();

    await rotateIosToOrientation("portrait-up");
    await waitForMetricText("metric.logicalOrientation", "portrait-up");
    await waitForMetricNumberGreaterThan(
      "metric.bankPortraitUpRevision",
      initialPortraitRevision
    );
    await expectPortraitWindow();
  });
});
