import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const command = args[0] ?? 'orientation';
const value = args[1] ?? 'portrait-up';

if (command === 'rotate') {
  runAppleScript(buildRotateScript(value));
  process.stdout.write(JSON.stringify({ command, value }, null, 2) + '\n');
  process.exit(0);
}

if (command === 'orientation') {
  runAppleScript(buildOrientationScript(value));
  process.stdout.write(JSON.stringify({ command, value }, null, 2) + '\n');
  process.exit(0);
}

throw new Error(`Unsupported iOS rotation command: ${command}`);

function runAppleScript(lines) {
  const args = [];
  for (const line of lines) {
    args.push('-e', line);
  }

  execFileSync('osascript', args, { stdio: 'pipe' });
}

function buildRotateScript(direction) {
  const menuItem =
    direction === 'left'
      ? 'Rotate Left'
      : direction === 'right'
        ? 'Rotate Right'
        : null;

  if (!menuItem) {
    throw new Error(`Unsupported rotate direction: ${direction}`);
  }

  return [
    'tell application "Simulator" to activate',
    'tell application "System Events"',
    'tell application process "Simulator"',
    'set frontmost to true',
    'delay 0.1',
    'click menu bar item "Device" of menu bar 1',
    'delay 0.1',
    `click menu item "${menuItem}" of menu 1 of menu bar item "Device" of menu bar 1`,
    'end tell',
    'end tell',
  ];
}

function buildOrientationScript(orientation) {
  const menuItem = orientationToMenuItem(orientation);

  return [
    'tell application "Simulator" to activate',
    'tell application "System Events"',
    'tell application process "Simulator"',
    'set frontmost to true',
    'delay 0.1',
    'tell menu bar item "Device" of menu bar 1',
    'click',
    'delay 0.1',
    'click menu item "Orientation" of menu 1',
    'delay 0.1',
    `click menu item "${menuItem}" of menu 1 of menu item "Orientation" of menu 1`,
    'end tell',
    'end tell',
    'end tell',
  ];
}

function orientationToMenuItem(orientation) {
  switch (orientation) {
    case 'portrait-up':
      return 'Portrait';
    case 'portrait-down':
      return 'Portrait Upside Down';
    case 'landscape-left':
      // Simulator menu labels are UI-oriented, while the package snapshot uses
      // physical device-side naming. These are inverted relative to each other.
      return 'Landscape Right';
    case 'landscape-right':
      return 'Landscape Left';
    default:
      throw new Error(`Unsupported iOS orientation: ${orientation}`);
  }
}
