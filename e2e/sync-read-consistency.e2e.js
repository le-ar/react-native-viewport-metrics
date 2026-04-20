const { expect: jestExpect } = require('@jest/globals');
const {
  isAndroid,
  isIos,
  launchApp,
  readMetricText,
  waitForMetricNumberGreaterThan,
  waitForMetricStability,
  waitForMetricText,
} = require('./helpers/app');
const { rotateAndroidToPhysical, rotateIosToOrientation } = require('./helpers/rotation');

async function expectSyncMetricsToMatchCurrent(metricNames) {
  for (const metricName of metricNames) {
    const currentValue = await readMetricText(`metric.${metricName}`);
    const syncMetricName = `sync${metricName[0].toUpperCase()}${metricName.slice(1)}`;
    const syncValue = await readMetricText(`metric.${syncMetricName}`);
    jestExpect(syncValue).toBe(currentValue);
  }
}

describe('sync snapshot consistency', () => {
  beforeEach(async () => {
    await launchApp({
      autoSyncReadOnSnapshot: true,
    });
  });

  it('matches getViewportSnapshot() against the visible snapshot after a real rotation', async () => {
    if (isAndroid()) {
      await rotateAndroidToPhysical('portrait-up');
      await waitForMetricText('metric.logicalOrientation', 'portrait-up');
      await rotateAndroidToPhysical('landscape-left');
      await waitForMetricText('metric.logicalOrientation', 'landscape-left');
    }

    if (isIos()) {
      await rotateIosToOrientation('portrait-up');
      await waitForMetricText('metric.logicalOrientation', 'portrait-up');
      await rotateIosToOrientation('landscape-left');
      await waitForMetricText('metric.logicalOrientation', 'landscape-left');
    }

    await waitForMetricStability('metric.revision', 1000);
    await waitForMetricNumberGreaterThan('metric.syncReadCount', 1);
    await expectSyncMetricsToMatchCurrent([
      'revision',
      'physicalOrientation',
      'logicalOrientation',
      'windowWidth',
      'windowHeight',
      'safeAreaTop',
      'safeAreaBottom',
      'statusBarVisibility',
      'statusBarHeight',
      'navigationBarVisibility',
      'navigationBarHeight',
    ]);
  });

  it('matches getViewportSnapshot() after an android system-bar change', async () => {
    if (!isAndroid()) {
      return;
    }

    await launchApp({
      autoSyncReadOnSnapshot: true,
      hideSystemBarsOnMount: true,
    });
    await waitForMetricText('metric.systemBarsHidden', 'true');
    await waitForMetricText('metric.navigationBarVisibility', 'hidden');
    await waitForMetricText('metric.safeAreaBottom', '0');
    await waitForMetricStability('metric.revision', 1000);
    await waitForMetricNumberGreaterThan('metric.syncReadCount', 1);
    await expectSyncMetricsToMatchCurrent([
      'revision',
      'safeAreaTop',
      'safeAreaBottom',
      'stableTop',
      'stableBottom',
      'statusBarVisibility',
      'statusBarHeight',
      'navigationBarVisibility',
      'navigationBarHeight',
    ]);
  });
});
