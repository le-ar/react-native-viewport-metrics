const { expect: jestExpect } = require("@jest/globals");
const {
  isIos,
  launchApp,
  readMetricText,
  waitForMetricText,
} = require("./helpers/app");
const { rotateIosToOrientation } = require("./helpers/rotation");

const describeIos = isIos() ? describe : describe.skip;

describeIos("ios home indicator", () => {
  beforeEach(async () => {
    await launchApp({
      hideHomeIndicatorOnMount: true,
    });
    await rotateIosToOrientation("portrait-up");
    await waitForMetricText("metric.logicalOrientation", "portrait-up");
  });

  it("supports launching with home indicator auto-hidden preference", async () => {
    jestExpect(await readMetricText("metric.homeIndicatorPresent")).toBe(
      "true"
    );
    jestExpect(await readMetricText("metric.bottomGestureAreaPresent")).toBe(
      "true"
    );
    jestExpect(await readMetricText("metric.homeIndicatorAutoHidden")).toBe(
      "true"
    );
  });
});
