const { expect: jestExpect } = require('@jest/globals');
const {
  isIos,
  launchApp,
  readMetricText,
  waitForMetricText,
} = require('./helpers/app');
const { rotateIosToOrientation } = require('./helpers/rotation');

const describeIos = isIos() ? describe : describe.skip;

describeIos('ios status bar', () => {
  async function launchPortrait(launchArgs = {}) {
    await launchApp(launchArgs);
    await rotateIosToOrientation('portrait-up');
    await waitForMetricText('metric.logicalOrientation', 'portrait-up');
  }

  it('keeps ios invariants intact with the status bar visible', async () => {
    await launchPortrait();

    jestExpect(await readMetricText('metric.statusBarPresent')).toBe('true');
    jestExpect(await readMetricText('metric.navigationBarPresent')).toBe('false');
    jestExpect(await readMetricText('metric.homeIndicatorPresent')).toBe('true');
    jestExpect(await readMetricText('metric.bottomGestureAreaPresent')).toBe('true');
  });

  it('keeps ios invariants intact with the status bar hidden on launch', async () => {
    await launchPortrait({
      hideStatusBarOnMount: true,
    });

    jestExpect(await readMetricText('metric.statusBarPresent')).toBe('true');
    jestExpect(await readMetricText('metric.navigationBarPresent')).toBe('false');
    jestExpect(await readMetricText('metric.homeIndicatorPresent')).toBe('true');
    jestExpect(await readMetricText('metric.bottomGestureAreaPresent')).toBe('true');
  });

  it('restores the visible status bar invariants after a hidden launch', async () => {
    await launchPortrait({
      hideStatusBarOnMount: true,
    });
    await launchPortrait();

    jestExpect(await readMetricText('metric.statusBarPresent')).toBe('true');
    jestExpect(await readMetricText('metric.navigationBarPresent')).toBe('false');
    jestExpect(await readMetricText('metric.homeIndicatorPresent')).toBe('true');
    jestExpect(await readMetricText('metric.bottomGestureAreaPresent')).toBe('true');
  });
});
