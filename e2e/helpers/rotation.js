const { execFileSync } = require('node:child_process');
const path = require('node:path');

const {
  ROOT_DIR,
  readMetricText,
  sleep,
} = require('./app');

const androidRotateScript = path.join(ROOT_DIR, 'scripts/e2e/android-rotate.mjs');
const iosRotateScript = path.join(ROOT_DIR, 'scripts/e2e/ios-rotate.mjs');
const DEFAULT_ANDROID_SERIAL = process.env.DETOX_ANDROID_SERIAL || 'emulator-5554';

function runNodeScript(scriptPath, args) {
  execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
  });
}

function getAndroidOrientationSteps(current, target) {
  const cycle = [
    'portrait-up',
    'landscape-left',
    'portrait-down',
    'landscape-right',
  ];
  const currentIndex = cycle.indexOf(current);
  const targetIndex = cycle.indexOf(target);

  if (currentIndex === -1 || targetIndex === -1) {
    throw new Error(
      `Unsupported Android physical orientation transition: ${current} -> ${target}`
    );
  }

  return (targetIndex - currentIndex + cycle.length) % cycle.length;
}

async function waitForPhysicalOrientation(target, timeout = 20000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const current = await readMetricText('metric.physicalOrientation');
    if (current === target) {
      return current;
    }
    await sleep(300);
  }

  throw new Error(`Timed out waiting for physical orientation ${target}`);
}

async function rotateAndroidStep(serial = DEFAULT_ANDROID_SERIAL) {
  runNodeScript(androidRotateScript, ['step', '--serial', serial]);
  await sleep(1000);
}

async function rotateAndroidToPhysicalNoWait(
  target,
  serial = DEFAULT_ANDROID_SERIAL
) {
  const current = await readMetricText('metric.physicalOrientation');
  const steps = getAndroidOrientationSteps(current, target);

  if (steps === 0) {
    return current;
  }

  runNodeScript(androidRotateScript, ['steps', String(steps), '--serial', serial]);
  await sleep(1000);
  return target;
}

async function rotateAndroidToPhysical(
  target,
  serial = DEFAULT_ANDROID_SERIAL
) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await readMetricText('metric.physicalOrientation');
    if (current === target) {
      return current;
    }

    await rotateAndroidStep(serial);
  }

  return waitForPhysicalOrientation(target);
}

async function normalizeAndroidSystemRotation(serial = DEFAULT_ANDROID_SERIAL) {
  runAdb(serial, ['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '1']);
  runAdb(serial, ['shell', 'settings', 'put', 'system', 'user_rotation', '0']);
  await sleep(500);
}

async function resetAndroidDeviceToPortrait(serial = DEFAULT_ANDROID_SERIAL) {
  await normalizeAndroidSystemRotation(serial);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const currentRotation = getAndroidDisplayRotation(serial);
    if (currentRotation === 'ROTATION_0') {
      return;
    }

    await rotateAndroidStep(serial);
  }

  const finalRotation = getAndroidDisplayRotation(serial);
  if (finalRotation !== 'ROTATION_0') {
    throw new Error(
      `Failed to return Android device to portrait-up. Current display rotation: ${finalRotation}`
    );
  }
}

async function setIosSimulatorOrientation(target) {
  if (target === 'portrait-up') {
    await device.setOrientation('portrait');
    await sleep(1000);
    return;
  }

  runNodeScript(iosRotateScript, ['orientation', target]);
  await sleep(1000);
}

async function rotateIosToOrientationNoWait(target) {
  await setIosSimulatorOrientation(target);
  return target;
}

async function rotateIosToLandscapeNoWait() {
  await device.setOrientation('landscape');
  await sleep(1000);
  return 'landscape';
}

async function rotateIosToOrientation(target) {
  await rotateIosToOrientationNoWait(target);

  if (target === 'portrait-up') {
    const startedAt = Date.now();

    while (Date.now() - startedAt < 20000) {
      const physicalOrientation = await readMetricText('metric.physicalOrientation');
      const logicalOrientation = await readMetricText('metric.logicalOrientation');

      if (
        physicalOrientation === 'portrait-up' ||
        logicalOrientation === 'portrait-up'
      ) {
        return target;
      }

      await sleep(300);
    }

    throw new Error(
      'Timed out waiting for iOS simulator to settle into portrait-up'
    );
  }

  return waitForPhysicalOrientation(target);
}

function getAndroidDisplayRotation(serial) {
  const output = runAdb(serial, ['shell', 'dumpsys', 'window', 'displays']);
  const rotationMatch =
    output.match(/mCurrentRotation=ROTATION_(\d+)/) ??
    output.match(/mRotation=(\d)\b/);

  if (!rotationMatch) {
    throw new Error(`Unable to determine Android display rotation from dumpsys output:\n${output}`);
  }

  const suffix = rotationMatch[1];
  switch (suffix) {
    case '0':
      return 'ROTATION_0';
    case '1':
    case '90':
      return 'ROTATION_90';
    case '2':
    case '180':
      return 'ROTATION_180';
    case '3':
    case '270':
      return 'ROTATION_270';
    default:
      throw new Error(`Unsupported Android display rotation value: ${suffix}`);
  }
}

function runAdb(serial, args) {
  return execFileSync('adb', ['-s', serial, ...args], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

module.exports = {
  DEFAULT_ANDROID_SERIAL,
  normalizeAndroidSystemRotation,
  resetAndroidDeviceToPortrait,
  rotateAndroidStep,
  rotateAndroidToPhysicalNoWait,
  rotateAndroidToPhysical,
  setIosSimulatorOrientation,
  rotateIosToLandscapeNoWait,
  rotateIosToOrientationNoWait,
  rotateIosToOrientation,
  waitForPhysicalOrientation,
};
