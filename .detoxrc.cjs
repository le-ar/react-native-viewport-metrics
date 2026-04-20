const os = require('node:os');
const path = require('node:path');

const androidSerial = process.env.DETOX_ANDROID_SERIAL || 'emulator-5554';
const androidArchitectures =
  process.env.DETOX_ANDROID_ARCHITECTURES ||
  process.env.REACT_NATIVE_ARCHITECTURES ||
  'arm64-v8a';
const artifactsRoot =
  process.env.DETOX_ARTIFACTS_DIR ||
  path.join(os.tmpdir(), 'react-native-viewport-metrics-detox-artifacts');
const iosSimulator = process.env.DETOX_IOS_DEVICE || 'iPhone 16 Pro';
const iosSimulatorOS = process.env.DETOX_IOS_OS || '18.1';
const iosDestination = `platform=iOS Simulator,name=${iosSimulator},OS=${iosSimulatorOS}`;
const iosBuildCommand = [
  'xcodebuild',
  '-workspace example/ios/ViewportMetricsExample.xcworkspace',
  '-scheme ViewportMetricsExample',
  '-configuration Debug',
  '-sdk iphonesimulator',
  `-destination "${iosDestination}"`,
  '-derivedDataPath example/ios/build',
  'ONLY_ACTIVE_ARCH=YES',
  'CODE_SIGNING_ALLOWED=NO',
].join(' ');
const androidBuildCommand = [
  'cd example/android',
  '&& ./gradlew app:assembleDebug app:assembleAndroidTest',
  '-DtestBuildType=debug',
  `-PreactNativeArchitectures=${androidArchitectures}`,
].join(' ');

/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 180000,
    },
  },
  artifacts: {
    rootDir: artifactsRoot,
    plugins: {
      log: {
        enabled: true,
      },
      screenshot: {
        shouldTakeAutomaticSnapshots: false,
      },
      video: {
        enabled: false,
      },
      instruments: {
        enabled: false,
      },
      uiHierarchy: {
        enabled: false,
      },
    },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath:
        'example/ios/build/Build/Products/Debug-iphonesimulator/ViewportMetricsExample.app',
      build: iosBuildCommand,
      start: 'npm run e2e:metro',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'example/android/app/build/outputs/apk/debug/app-debug.apk',
      testBinaryPath:
        'example/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build: androidBuildCommand,
      reversePorts: [8081],
      start: 'npm run e2e:metro',
    },
  },
  devices: {
    iosSimulator: {
      type: 'ios.simulator',
      device: {
        type: iosSimulator,
      },
    },
    androidEmulator: {
      type: 'android.attached',
      device: {
        adbName: androidSerial,
      },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'iosSimulator',
      app: 'ios.debug',
    },
    'android.emu.debug': {
      device: 'androidEmulator',
      app: 'android.debug',
    },
  },
};
