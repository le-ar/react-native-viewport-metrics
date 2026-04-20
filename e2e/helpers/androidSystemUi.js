const { execFileSync } = require('node:child_process');

const NAVIGATION_MODE_CASES = {
  gestural: {
    expectedMode: 2,
    overlay: 'com.android.internal.systemui.navbar.gestural',
  },
  threebutton: {
    expectedMode: 0,
    overlay: 'com.android.internal.systemui.navbar.threebutton',
  },
  twobutton: {
    expectedMode: 1,
    overlay: 'com.android.internal.systemui.navbar.twobutton',
  },
};

let originalNavigationModeName = null;
let originalSecureNavigationMode = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAndroidSerial() {
  return process.env.DETOX_ANDROID_SERIAL || 'emulator-5554';
}

function runAdb(args, options = {}) {
  const { allowFailure = false } = options;

  try {
    return execFileSync('adb', ['-s', getAndroidSerial(), ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return String(error.stdout || error.stderr || '').trim();
    }

    throw new Error(
      `adb ${args.join(' ')} failed:\n${String(error.stderr || error.message)}`
    );
  }
}

function runAdbShell(args, options) {
  return runAdb(['shell', ...args], options);
}

function getNavigationModeCase(name) {
  const modeCase = NAVIGATION_MODE_CASES[name];
  if (!modeCase) {
    throw new Error(`Unknown Android navigation mode: ${name}`);
  }
  return modeCase;
}

function listNavigationModeOverlays() {
  const output = runAdbShell(['cmd', 'overlay', 'list', 'android']);

  return Object.fromEntries(
    Object.entries(NAVIGATION_MODE_CASES).map(([name, modeCase]) => [
      name,
      output.includes(modeCase.overlay),
    ])
  );
}

function isNavigationModeAvailable(name) {
  return Boolean(listNavigationModeOverlays()[name]);
}

function getAvailableNavigationModeNames() {
  const overlays = listNavigationModeOverlays();
  return Object.keys(NAVIGATION_MODE_CASES).filter((name) => overlays[name]);
}

function getCurrentNavigationModeValue() {
  const raw = runAdbShell([
    'cmd',
    'overlay',
    'lookup',
    'android',
    'android:integer/config_navBarInteractionMode',
  ]);
  const value = Number(raw.split(/\s+/)[0]);

  if (!Number.isFinite(value)) {
    throw new Error(`Unable to parse Android navigation mode from: ${raw}`);
  }

  return value;
}

function getCurrentSecureNavigationMode() {
  const raw = runAdbShell(['settings', 'get', 'secure', 'navigation_mode'], {
    allowFailure: true,
  });
  const value = Number(raw);

  return Number.isFinite(value) ? value : null;
}

function getCurrentNavigationModeName() {
  const currentMode = getCurrentNavigationModeValue();
  const match = Object.entries(NAVIGATION_MODE_CASES).find(
    ([, modeCase]) => modeCase.expectedMode === currentMode
  );

  return match?.[0] ?? null;
}

async function captureOriginalNavigationMode() {
  originalNavigationModeName = getCurrentNavigationModeName();
  originalSecureNavigationMode = getCurrentSecureNavigationMode();
  return originalNavigationModeName;
}

async function restoreOriginalNavigationMode() {
  if (!originalNavigationModeName) {
    return;
  }

  await setNavigationMode(originalNavigationModeName);

  if (originalSecureNavigationMode != null) {
    runAdbShell([
      'settings',
      'put',
      'secure',
      'navigation_mode',
      String(originalSecureNavigationMode),
    ]);
  }
}

async function setNavigationMode(name) {
  const modeCase = getNavigationModeCase(name);

  if (!isNavigationModeAvailable(name)) {
    console.log(`[android-system-ui] navigation mode ${name} overlay unavailable`);
    return false;
  }

  runAdbShell(
    [
      'cmd',
      'overlay',
      'enable-exclusive',
      '--category',
      modeCase.overlay,
    ],
    { allowFailure: true }
  );

  runAdbShell([
    'settings',
    'put',
    'secure',
    'navigation_mode',
    String(modeCase.expectedMode),
  ]);

  const currentMode = await waitForNavigationMode(name);
  return currentMode === modeCase.expectedMode;
}

async function waitForNavigationMode(name, timeout = 8000) {
  const modeCase = getNavigationModeCase(name);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const currentMode = getCurrentNavigationModeValue();
    if (currentMode === modeCase.expectedMode) {
      return currentMode;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for Android navigation mode ${name}`);
}

function getDisplaySize() {
  const output = runAdbShell(['wm', 'size']);
  const match = output.match(/Physical size:\s*(\d+)x(\d+)/);

  if (!match) {
    throw new Error(`Unable to parse Android display size from: ${output}`);
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

async function swipeFromBottomEdge() {
  const { width, height } = getDisplaySize();
  const x = Math.round(width / 2);
  const startY = Math.max(height - 4, 1);
  const endY = Math.round(height * 0.72);

  runAdbShell(['input', 'swipe', String(x), String(startY), String(x), String(endY), '180']);
  await sleep(750);
}

module.exports = {
  NAVIGATION_MODE_CASES,
  captureOriginalNavigationMode,
  getAndroidSerial,
  getAvailableNavigationModeNames,
  getCurrentNavigationModeName,
  getCurrentNavigationModeValue,
  getCurrentSecureNavigationMode,
  isNavigationModeAvailable,
  restoreOriginalNavigationMode,
  runAdb,
  runAdbShell,
  setNavigationMode,
  swipeFromBottomEdge,
  waitForNavigationMode,
};
