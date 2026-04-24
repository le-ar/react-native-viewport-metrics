# Changelog

## 0.1.2

- Render the native absolute-fill metrics view before provider children so the
  metrics layer stays behind consumer UI while continuing to receive snapshots.

## 0.1.1

- Publish from a temporary staging directory with a sanitized `package.json` so
  npm metadata no longer exposes repository `devDependencies`, test tooling, or
  release scripts.
- Block direct `npm publish` from the repository root and standardize release
  publishing on `npm run release:publish`.
- Add Conventional Commits tooling with `commitlint`, `husky` `commit-msg`
  validation, and a repository commit template for `type(scope): subject`.

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
