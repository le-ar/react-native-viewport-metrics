const { expect: jestExpect } = require('@jest/globals');

const { runAdb } = require('./androidSystemUi');

const REANIMATED_STRICT_WARNING_PATTERNS = [
  'Writing to `value` during component render',
  'Reading from `value` during component render',
];

function clearAndroidLogcat() {
  runAdb(['logcat', '-c']);
}

function readAndroidLogcat() {
  return runAdb(['logcat', '-d', '-v', 'time']);
}

function expectNoReanimatedStrictWarnings(logcat = readAndroidLogcat()) {
  const matches = REANIMATED_STRICT_WARNING_PATTERNS.filter((pattern) =>
    logcat.includes(pattern)
  );

  jestExpect(matches).toEqual([]);
}

module.exports = {
  REANIMATED_STRICT_WARNING_PATTERNS,
  clearAndroidLogcat,
  expectNoReanimatedStrictWarnings,
  readAndroidLogcat,
};
