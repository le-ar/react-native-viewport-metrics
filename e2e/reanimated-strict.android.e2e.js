const {
  isAndroid,
  launchApp,
  runAutomationCommand,
  waitForMetricNumberGreaterThan,
  waitForMetricText,
} = require('./helpers/app');
const {
  clearAndroidLogcat,
  expectNoReanimatedStrictWarnings,
  readAndroidLogcat,
} = require('./helpers/androidLogcat');

const describeAndroid = isAndroid() ? describe : describe.skip;

describeAndroid('android reanimated strict mode', () => {
  it('does not write or read shared values during render-adjacent flows', async () => {
    clearAndroidLogcat();

    await launchApp({
      systemBarsModeOnMount: 'visible',
    });

    await waitForMetricText('metric.systemBarsMode', 'visible');
    await waitForMetricNumberGreaterThan('metric.jsListenerCount', 0);

    await runAutomationCommand('syncRead');
    await runAutomationCommand('setSystemBarsHiddenDefault');
    await waitForMetricText('metric.systemBarsMode', 'hidden-default');
    await waitForMetricText('metric.navigationBarVisibility', 'hidden');
    await runAutomationCommand('setSystemBarsVisible');
    await waitForMetricText('metric.systemBarsMode', 'visible');
    await runAutomationCommand('setSystemBarsHiddenTransient');
    await waitForMetricText('metric.systemBarsMode', 'hidden-transient');
    await waitForMetricText('metric.navigationBarVisibility', 'hidden');
    await runAutomationCommand('setSystemBarsVisible');
    await waitForMetricText('metric.systemBarsMode', 'visible');

    expectNoReanimatedStrictWarnings(readAndroidLogcat());
  });
});
