# Keep the Expo module classes visible to Expo Modules Core and React Native
# when downstream Android release builds run R8/ProGuard. The package is tiny,
# and keeping it whole avoids native module/view stripping or obfuscation.
-keep class expo.modules.viewportmetrics.** { *; }
