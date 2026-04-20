const { expect: jestExpect } = require('@jest/globals');
const {
  expectPortraitWindow,
  isAndroid,
  isIos,
  launchApp,
  readMetricNumber,
  readMetricText,
  runAutomationCommand,
  waitForMetricText,
} = require('./helpers/app');
const { rotateAndroidToPhysical, rotateIosToOrientation } = require('./helpers/rotation');

describe('baseline launch', () => {
  beforeEach(async () => {
    await launchApp();
  });

  it('renders a non-zero coherent snapshot', async () => {
    jestExpect(await readMetricNumber('metric.revision')).toBeGreaterThan(0);
    jestExpect(await readMetricNumber('metric.windowWidth')).toBeGreaterThan(0);
    jestExpect(await readMetricNumber('metric.windowHeight')).toBeGreaterThan(0);
    jestExpect(await readMetricNumber('metric.rootViewWidth')).toBeGreaterThan(0);
    jestExpect(await readMetricNumber('metric.rootViewHeight')).toBeGreaterThan(0);
    jestExpect(await readMetricText('metric.physicalOrientation')).not.toBe('unknown');
    jestExpect(await readMetricText('metric.logicalOrientation')).not.toBe('unknown');
    await expectPortraitWindow();
  });

  it('keeps platform invariants intact on launch', async () => {
    if (isIos()) {
      jestExpect(await readMetricText('metric.navigationBarPresent')).toBe('false');
      jestExpect(await readMetricText('metric.homeIndicatorPresent')).toBe('true');
    }

    if (isAndroid()) {
      jestExpect(await readMetricText('metric.navigationBarPresent')).toBe('true');
      jestExpect(await readMetricText('metric.homeIndicatorPresent')).toBe('false');
      jestExpect(await readMetricText('metric.statusBarPresent')).toBe('true');
    }
  });

  it('can intentionally leave a dirty device state', async () => {
    if (isAndroid()) {
      await rotateAndroidToPhysical('landscape-left');
      await waitForMetricText('metric.logicalOrientation', 'landscape-left');
      await runAutomationCommand('lockLandscapeLeft');
      await runAutomationCommand('hideSystemBars');
      return;
    }

    if (isIos()) {
      await rotateIosToOrientation('landscape-left');
      await waitForMetricText('metric.logicalOrientation', 'landscape-left');
      await runAutomationCommand('lockLandscapeLeft');
      await runAutomationCommand('hideStatusBar');
    }
  });

  it('restores the hard baseline before the next test starts', async () => {
    await waitForMetricText('metric.logicalOrientation', 'portrait-up');
    await waitForMetricText('metric.orientationLock', 'default');
    await expectPortraitWindow();

    if (isAndroid()) {
      await waitForMetricText('metric.systemBarsMode', 'visible');
      await waitForMetricText('metric.systemBarsHidden', 'false');
    }

    if (isIos()) {
      await waitForMetricText('metric.statusBarVisibility', 'visible');
    }
  });
});
