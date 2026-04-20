const { expect: jestExpect } = require("@jest/globals");
const {
  expectLandscapeWindow,
  isAndroid,
  launchApp,
  readMetricNumber,
  readMetricText,
  waitForMetricStability,
  waitForMetricNumberGreaterThan,
  waitForMetricText,
} = require("./helpers/app");
const { rotateAndroidToPhysical } = require("./helpers/rotation");
const {
  captureOriginalNavigationMode,
  restoreOriginalNavigationMode,
} = require("./helpers/androidSystemUi");

const describeAndroid = isAndroid() ? describe : describe.skip;

describeAndroid("android system bars", () => {
  beforeAll(async () => {
    await captureOriginalNavigationMode();
  });

  afterAll(async () => {
    await restoreOriginalNavigationMode();
  });

  it("captures hidden system bars on launch while keeping stable insets", async () => {
    await launchApp({
      systemBarsModeOnMount: "hidden-transient",
    });

    await waitForMetricText("metric.systemBarsMode", "hidden-transient");
    await waitForMetricText("metric.systemBarsTarget", "hidden");
    await waitForMetricText("metric.systemBarsHidden", "true");
    await waitForMetricText("metric.navigationBarVisibility", "hidden");
    await waitForMetricText("metric.safeAreaBottom", "0");
    await waitForMetricStability("metric.revision", 1000);

    const safeTop = await readMetricNumber("metric.safeAreaTop");
    const safeBottom = await readMetricNumber("metric.safeAreaBottom");
    const stableTop = await readMetricNumber("metric.stableTop");
    const stableBottom = await readMetricNumber("metric.stableBottom");
    const statusBarHeight = await readMetricNumber("metric.statusBarHeight");
    const navigationBarHeight = await readMetricNumber(
      "metric.navigationBarHeight"
    );

    jestExpect(await readMetricText("metric.navigationBarPresent")).toBe(
      "true"
    );
    jestExpect(safeBottom).toBe(0);
    jestExpect(stableBottom).toBeGreaterThan(safeBottom);
    jestExpect(stableTop).toBeGreaterThanOrEqual(safeTop);
    jestExpect(statusBarHeight).toBeGreaterThan(0);
    jestExpect(navigationBarHeight).toBeGreaterThan(0);
    jestExpect(
      await readMetricText("metric.navigationBarApiVisibility")
    ).not.toBe("error");
  });

  it("captures visible system bars on a default launch", async () => {
    await launchApp({
      systemBarsModeOnMount: "visible",
    });

    await waitForMetricText("metric.systemBarsMode", "visible");
    await waitForMetricText("metric.systemBarsTarget", "visible");
    await waitForMetricText("metric.systemBarsHidden", "false");
    await waitForMetricText("metric.statusBarVisibility", "visible");
    await waitForMetricNumberGreaterThan("metric.statusBarHeight", 0);
    await waitForMetricNumberGreaterThan("metric.navigationBarHeight", 0);
    jestExpect(
      await readMetricNumber("metric.statusBarHeight")
    ).toBeGreaterThan(0);
    jestExpect(
      await readMetricNumber("metric.navigationBarHeight")
    ).toBeGreaterThan(0);
    jestExpect(
      await readMetricText("metric.navigationBarApiVisibility")
    ).not.toBe("error");
  });

  it("stores landscape navigation side insets in the orientation bank", async () => {
    await launchApp({
      systemBarsModeOnMount: "visible",
    });

    await rotateAndroidToPhysical("landscape-left");
    await waitForMetricText("metric.logicalOrientation", "landscape-left");
    await expectLandscapeWindow();
    jestExpect(
      await readMetricNumber("metric.bankLandscapeLeftNavigationInsetRight")
    ).toBe(await readMetricNumber("metric.navigationBarInsetRight"));
    jestExpect(
      await readMetricNumber("metric.bankLandscapeLeftNavigationStableRight")
    ).toBe(await readMetricNumber("metric.navigationBarStableRight"));

    await rotateAndroidToPhysical("landscape-right");
    await waitForMetricText("metric.logicalOrientation", "landscape-right");
    await expectLandscapeWindow();
    jestExpect(
      await readMetricNumber("metric.bankLandscapeRightNavigationInsetLeft")
    ).toBe(await readMetricNumber("metric.navigationBarInsetLeft"));
    jestExpect(
      await readMetricNumber("metric.bankLandscapeRightNavigationStableLeft")
    ).toBe(await readMetricNumber("metric.navigationBarStableLeft"));
  });
});
