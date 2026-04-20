# Changelog

## 0.1.0

- Initial implementation of native coherent viewport snapshot aggregation.
- Added Android/iOS example automation and Detox coverage for rotation,
  system-bar visibility, Android navigation modes, Reanimated strict-mode logs,
  and blocked-JS worklet delivery.
- Added Android consumer ProGuard rules so downstream release builds keep the
  native Expo module classes under R8/minify.
- Added minimal npm distribution entries for CommonJS, ESM, React Native, and
  browser consumers while excluding repository-only sources, E2E tests, scripts,
  local artifacts, source maps, and planning/worklog files from the tarball.
- Added release build scripts for native Gradle/Xcode, Expo Dev, EAS Local, npm
  packing, npm publish dry-run, and Android release APK shrinker verification.
