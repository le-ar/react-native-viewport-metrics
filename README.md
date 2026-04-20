# react-native-viewport-metrics

Coherent native viewport metrics snapshots for React Native and Expo.

This package exposes one native snapshot stream for viewport dimensions, safe-area
insets, stable system areas, and physical/logical orientation. It is designed for
apps where separate React Native dimensions, safe-area, and orientation events
produce transient inconsistent layouts during rotation or system bar changes.

## Installation

```sh
npm install react-native-viewport-metrics
```

This is an Expo module. In Expo prebuild/bare React Native projects, rebuild the
native app after installation so the Android and iOS module code is linked.

## Verified Target

This package stage is verified against the current consumer stack:

- Expo 54
- React Native 0.81.x
- Reanimated 4.2.x
- Worklets 0.7.x

The package does not import `react-native-worklets` directly. UI-thread delivery
depends on Reanimated `useEvent` support mounted through `ViewportMetricsProvider`.

## Platform Permissions

This package does not require app permissions.

You do not need to add anything to `android/app/src/main/AndroidManifest.xml` or
`ios/*/Info.plist` to use viewport snapshots.

- Android: the module reads `WindowInsetsCompat`, window metrics, display
  rotation, and `OrientationEventListener`. These APIs do not require a runtime
  permission or a `uses-permission` manifest entry.
- iOS: the module reads safe area/window metrics, status bar manager values, and
  `UIDevice.orientation` notifications. These APIs do not require an
  `Info.plist` usage description or a runtime permission prompt.

## API

```ts
import {
  ViewportMetricsProvider,
  addViewportSnapshotListener,
  addViewportSnapshotWorkletListener,
  getLastKnownViewportSnapshotForOrientation,
  getLastKnownViewportSnapshotsByOrientation,
  getViewportSnapshot,
  useLastKnownViewportSnapshotForOrientation,
  useViewportMetricsSharedValues,
  useViewportOrientationSnapshotsSharedValues,
  useViewportSnapshot,
  useViewportSnapshotSharedValue,
} from "react-native-viewport-metrics";
```

All numbers are returned in React Native layout units: Android dp and iOS points.

## Usage

Mount `ViewportMetricsProvider` once near the app root when using UI-thread
worklet APIs. JS APIs work without the provider, but the shared-value and
worklet-listener APIs require the provider plus Reanimated `useEvent` support.

Internally the provider mounts an `AnimatedViewportMetricsView`. That component
is only a host view for the native `onSnapshot` event bridge into Reanimated.
It does not add its own viewport model; it is the event surface that lets the
provider update shared values on the UI thread.

```tsx
export default function App() {
  return (
    <ViewportMetricsProvider>
      <RootNavigator />
    </ViewportMetricsProvider>
  );
}
```

Read the current coherent snapshot in React render code:

```tsx
import { Text, View } from "react-native";
import { useViewportSnapshot } from "react-native-viewport-metrics";

export function HeaderSpacer() {
  const viewport = useViewportSnapshot();
  const top = viewport.systemAreas.statusBar.stableInsets.top;

  return (
    <View style={{ paddingTop: top }}>
      <Text>{viewport.logicalOrientation}</Text>
    </View>
  );
}
```

Read the latest snapshot imperatively:

```ts
import { getViewportSnapshot } from "react-native-viewport-metrics";

const snapshot = getViewportSnapshot();
const isLandscape = snapshot.window.width > snapshot.window.height;
```

Subscribe on the JS thread:

```ts
import { addViewportSnapshotListener } from "react-native-viewport-metrics";

const subscription = addViewportSnapshotListener((snapshot) => {
  console.log(snapshot.revision, snapshot.safeAreaInsets);
});

subscription.remove();
```

Use a Reanimated shared value on the UI thread:

```tsx
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useViewportSnapshotSharedValue } from "react-native-viewport-metrics";

export function FloatingControls() {
  const viewport = useViewportSnapshotSharedValue();

  const style = useAnimatedStyle(() => {
    const bottom =
      viewport.value.systemAreas.bottomGestureArea.stableInsets.bottom;

    return {
      transform: [{ translateY: -bottom }],
    };
  });

  return <Animated.View style={style} />;
}
```

`useViewportSnapshotSharedValue()` intentionally has no JS-thread fallback. If
the provider or Reanimated worklet event path is unavailable, it throws instead
of returning a value that could be blocked by the JS thread. Use
`useViewportSnapshot()` for JS-thread snapshots.

Subscribe with a worklet listener. Mount `ViewportMetricsProvider` for this path:

```ts
import { addViewportSnapshotWorkletListener } from "react-native-viewport-metrics";

const subscription = addViewportSnapshotWorkletListener((snapshot) => {
  "worklet";

  // Intended to run through the provider native event path when Reanimated is installed.
  const bottom = snapshot.systemAreas.bottomGestureArea.stableInsets.bottom;
});

subscription.remove();
```

Prefer `useViewportSnapshotSharedValue()` when you need UI-thread delivery. The
shared-value provider path and custom `addViewportSnapshotWorkletListener()`
delivery are covered by the example Detox acceptance flow, including a real
rotation while the JS thread is intentionally blocked. Validate the exact devices
and system UI modes your app supports before widening your own support matrix.

Read the last known snapshot for a specific logical orientation on the JS thread:

```ts
import {
  getLastKnownViewportSnapshotForOrientation,
  useLastKnownViewportSnapshotForOrientation,
} from "react-native-viewport-metrics";

const portraitSnapshot =
  getLastKnownViewportSnapshotForOrientation("portrait-up");

function FullscreenOverlay() {
  const landscapeLeft =
    useLastKnownViewportSnapshotForOrientation("landscape-left");
  return landscapeLeft?.systemAreas.navigationBar.stableInsets.right ?? 0;
}
```

Use fine-grained UI-thread shared values when a consumer only needs one slice:

```tsx
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useViewportMetricsSharedValues } from "react-native-viewport-metrics";

export function BottomControls() {
  const viewport = useViewportMetricsSharedValues();

  const style = useAnimatedStyle(() => ({
    paddingBottom: viewport.safeAreaInsets.value.bottom,
  }));

  return <Animated.View style={style} />;
}
```

Use last known snapshots by logical orientation on the UI thread:

```tsx
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useViewportOrientationSnapshotsSharedValues } from "react-native-viewport-metrics";

export function LockedLandscapeOverlay() {
  const snapshots = useViewportOrientationSnapshotsSharedValues();

  const style = useAnimatedStyle(() => {
    const rightInset =
      snapshots.landscapeLeft.value?.systemAreas.navigationBar.stableInsets
        .right ?? 0;

    return {
      paddingRight: rightInset,
    };
  });

  return <Animated.View style={style} />;
}
```

## How Aggregation Works

The module does not forward raw native events one by one. It treats native
layout, inset, and orientation callbacks as invalidation signals, then emits one
coherent snapshot after the native side has had a chance to settle.

At a high level:

1. A native signal arrives: layout changed, insets changed, provider view
   attached, activity/window changed, or physical orientation changed.
2. The aggregator calls `markDirty(reason)`. This only records that something
   changed and schedules a single flush. It does not immediately read and emit
   partial values from that callback.
3. The flush runs on the platform UI/main thread on the next frame or next
   main-thread turn.
4. The aggregator reads all snapshot fields together from the same window/root
   context: dimensions, root view frame, insets, system areas, and orientations.
5. A candidate `ViewportSnapshot` is built.
6. The candidate payload is compared with the last emitted payload. `revision`
   and `timestampMs` are ignored for this comparison.
7. If the payload changed, `revision` is incremented and the snapshot is emitted
   to JS module listeners and mounted provider views. If nothing changed, no
   event is emitted.

This means consumers see a state that was assembled together natively instead
of manually combining several asynchronous JS events. The package optimizes for
coherent layout data over exposing every intermediate platform callback.

### Snapshot Coherence

A snapshot is considered coherent when it is collected during a scheduled flush,
not inside the first raw native callback that noticed a change.

The module currently emits only final snapshot payloads from that flush path.
There is no public `isStable=false` intermediate state. During rotations or
system bar changes, multiple native callbacks may arrive close together, but
they are coalesced into at most one scheduled flush while a flush is pending.

Coherence guarantee:

- all fields in a single `ViewportSnapshot` are read in one native aggregation
  pass;
- values are read on the UI/main thread;
- consumers never have to merge this package's orientation, size, and inset
  fields themselves.

Boundary of the guarantee:

- The snapshot is coherent before it crosses the React Native event pipeline.
- JS-thread listeners still run when the JS thread can process events.
- UI-thread shared values and worklet listeners require `ViewportMetricsProvider`
  and Reanimated worklet event support.
- Native Android/iOS runtime behavior should still be validated on the devices
  and system UI modes your app supports.

Verified Android runtime note on the API 35 emulator:

- Hiding system bars flips `statusBar`/`navigationBar` visibility to `hidden`.
- Visible insets drop to `0` while `stableSystemInsets` still preserves the
  hidden bar footprint.

### Android Aggregation

Android uses `ViewportMetricsAggregator` behind the Expo module and provider
view.

Signals that mark the snapshot dirty:

- `OrientationEventListener` reports a physical device orientation change;
- `ViewportMetricsView` is attached or detached;
- `ViewportMetricsView` changes layout or size;
- `ViewCompat.setOnApplyWindowInsetsListener` receives new window insets;
- the host activity enters foreground;
- JS starts observing the module event.

Flush scheduling:

- Work is marshalled to the Android main thread.
- If a mounted provider view is attached, flush is scheduled with
  `ViewCompat.postOnAnimation(view, ...)`, so it runs on the next frame.
- If no provider view is available, flush falls back to posting on the main
  handler.

Values read during flush:

- `window`: `WindowMetricsCalculator.computeCurrentWindowMetrics(activity)`,
  falling back to root view or display metrics when needed.
- `screen`: Android display metrics from resources.
- `rootView`: provider view frame, or the activity decor root view if the
  provider is not mounted yet.
- `safeAreaInsets`: current `WindowInsetsCompat` system bars plus display cutout.
- `stableSystemInsets`: `getInsetsIgnoringVisibility(...)` where Android can
  provide stable insets while bars are hidden.
- `statusBar`: `WindowInsetsCompat.Type.statusBars()`.
- `navigationBar`: `WindowInsetsCompat.Type.navigationBars()`.
- `bottomGestureArea`: aliases `navigationBar` when Android reports a bottom
  navigation or gesture area.
- `physicalOrientation`: `OrientationEventListener` sensor degrees mapped to
  normalized orientation strings.
- `logicalOrientation`: display rotation plus configuration orientation, with
  handling for natural-portrait and natural-landscape devices.

Android speed/consistency notes:

- Current, stable, and visibility values for status/navigation bars are read
  from the same `WindowInsetsCompat` object.
- Hidden system bars should still produce stable values when Android exposes
  them through `getInsetsIgnoringVisibility(...)`.
- Physical orientation changes wait one frame plus a short native debounce
  before flushing, so the matching layout/inset callbacks from a rotation are
  emitted as one final revision instead of separate intermediate revisions.
- Android physical and logical landscape normalization is aligned to the same
  public `landscape-left` / `landscape-right` semantics used on iOS.
- The physical orientation listener is independent from the app's logical
  orientation lock.

### iOS Aggregation

iOS uses `ViewportMetricsAggregator` behind the Expo module and provider view.

Signals that mark the snapshot dirty:

- `UIDevice.orientationDidChangeNotification` reports a physical device
  orientation change;
- `ViewportMetricsView` moves into or out of a window;
- `ViewportMetricsView.layoutSubviews()` runs;
- `ViewportMetricsView.safeAreaInsetsDidChange()` runs;
- JS starts observing the module event.

Flush scheduling:

- Work is marshalled to the iOS main thread.
- Dirty signals are coalesced with `DispatchQueue.main.async`.
- Sync `getSnapshot` also reads on the main thread.

Values read during flush:

- `window`: provider window bounds, falling back to the active key window or
  screen bounds.
- `screen`: `UIScreen` bounds and scale.
- `rootView`: provider view frame converted to window coordinates, falling back
  to the window frame.
- `safeAreaInsets`: provider view safe area, falling back to window safe area.
- `stableSystemInsets`: currently the same safe-area value, because iOS does not
  expose Android-style stable insets that ignore visibility.
- `statusBar`: `UIWindowScene.statusBarManager.statusBarFrame` plus safe-area
  top fallback.
- `navigationBar`: always `present=false`; UIKit navigation bars and React
  Navigation headers are app chrome, not OS navigation bars.
- `homeIndicator`: bottom safe-area/home-indicator gesture region.
- `bottomGestureArea`: aliases `homeIndicator` when bottom safe area is present.
- `physicalOrientation`: `UIDevice.current.orientation`, mapped to normalized
  orientation strings. iOS physical landscape naming is inverted so the public
  values match Android semantics.
- `logicalOrientation`: `UIWindowScene.interfaceOrientation`.

iOS speed/consistency notes:

- Safe area, root frame, and window bounds are read from the same provider
  view/window context.
- Home indicator visibility is reported as `unknown`; UIKit does not expose a
  reliable general-purpose visibility value for it.
- Hidden status bar values may be approximated from safe area when the status
  bar frame is zero.

### React Native Architecture and Event Delivery

The consistency model is native-side, so it does not depend on JS combining
events correctly in either the old or new React Native architecture.

JS-thread delivery:

- The Expo module exposes `getSnapshot` and an `onSnapshot` module event.
- `getViewportSnapshot()` reads the native snapshot synchronously through the
  module when available.
- `useViewportSnapshot()` uses `useSyncExternalStore` over the JS store.
- `addViewportSnapshotListener()` subscribes to module events and runs on the JS
  thread.

UI-thread delivery:

- `ViewportMetricsProvider` renders a native `ViewportMetricsView`.
- With Reanimated installed, that view is wrapped with
  `createAnimatedComponent`.
- The provider attaches a Reanimated `useEvent` handler for the native
  `onSnapshot` view event.
- That handler writes the snapshot into the provider shared value and calls
  registered worklet listeners.
- The provider does not fall back to writing the shared value from JS; without
  the Reanimated event handler, `useViewportSnapshotSharedValue()` is
  unavailable.

Old and new architecture notes:

- The package is written as an Expo module, so native registration and event
  plumbing are handled by Expo Modules rather than by handwritten bridge or
  TurboModule code.
- In the old architecture, JS listeners still depend on the classic async event
  path once the native snapshot has been assembled.
- In the new architecture, the module should use Expo Modules' compatible
  native module/view infrastructure. Snapshot assembly still happens before
  delivery, so the API-level coherence model is the same.
- UI-thread Reanimated delivery is separate from JS listener delivery and is the
  path intended for layout/animation code that should not wait for JS work.

### Performance Model

The aggregator is designed to be cheap:

- callbacks only schedule work;
- repeated callbacks while a flush is pending are coalesced;
- one flush reads all native values together;
- unchanged payloads are not emitted;
- JS listeners do not run when native values did not actually change.

Expected latency is usually one UI frame or one main-thread turn after the
native platform reports a relevant change. This is intentionally slightly later
than the first raw callback, because reading immediately inside the first
callback is more likely to produce mixed old/new layout data.

## Snapshot Reference

`ViewportSnapshot` is emitted as one native-built object. The fields are measured
together after native viewport/inset/orientation callbacks have been coalesced,
so consumers do not need to merge separate `Dimensions`, safe-area, and
orientation events.

```ts
type ViewportSnapshot = {
  revision: number;
  timestampMs: number;
  physicalOrientation: ViewportOrientation;
  logicalOrientation: ViewportOrientation;
  window: { width: number; height: number; scale: number };
  screen: { width: number; height: number; scale: number };
  rootView: { x: number; y: number; width: number; height: number };
  safeAreaInsets: EdgeInsets;
  stableSystemInsets: EdgeInsets;
  systemAreas: {
    statusBar: SystemAreaSnapshot;
    navigationBar: SystemAreaSnapshot;
    homeIndicator: SystemAreaSnapshot;
    bottomGestureArea: SystemAreaSnapshot;
  };
};
```

### Top-level fields

- `revision`: Monotonic snapshot version. It increases only when the payload
  changes, not just because time passed.
- `timestampMs`: Native snapshot timestamp in milliseconds since Unix epoch.
- `physicalOrientation`: Real device orientation from the physical sensor. It
  may change even when app orientation is locked.
- `logicalOrientation`: Current app window/interface orientation.
- `window`: Current app window size and scale.
- `screen`: Full screen/display size and scale.
- `rootView`: Provider/root view frame in window coordinates.
- `safeAreaInsets`: Current safe area currently affecting layout. These values
  may change when system bars are shown or hidden.
- `stableSystemInsets`: Stable system inset values where the platform exposes
  them. Use these when the layout should account for hidden system UI without
  being redrawn every time bars appear or disappear.
- `systemAreas`: Structured system UI areas. Use these when you need to know
  which system region produced an inset.

### Orientation values

```ts
type ViewportOrientation =
  | "portrait-up"
  | "portrait-down"
  | "landscape-left"
  | "landscape-right"
  | "unknown";
```

The string values are normalized across Android and iOS. Platform-native
`landscapeLeft`/`landscapeRight` naming is not passed through directly.

### Insets and sizes

```ts
type EdgeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};
```

Insets use the same layout units as React Native styles. A zero inset can mean
that the system area is absent, hidden with no stable size reported, or outside
the current edge. Check the matching `SystemAreaSnapshot.present` and `source`
when that distinction matters.

### System areas

```ts
type SystemAreaSnapshot = {
  kind: "status-bar" | "navigation-bar" | "home-indicator" | "none";
  present: boolean;
  visibility: "visible" | "hidden" | "unknown";
  height: number;
  insets: EdgeInsets;
  stableInsets: EdgeInsets;
  source: "measured" | "approximated" | "unavailable";
};
```

- `kind`: Normalized system area type. `none` means this area is not available
  for the current platform/device/snapshot.
- `present`: Whether the system area exists on this device/window.
- `visibility`: Whether the area is currently visible. Some platform regions,
  especially the iOS home indicator area, cannot reliably expose visibility, so
  `unknown` is valid.
- `height`: Convenience maximum edge size for this system area.
- `insets`: Current visible inset contribution.
- `stableInsets`: Stable size for the area, even when the platform reports the
  area as hidden. This is the preferred value for layouts that should not jump
  when system bars are toggled.
- `source`: Data quality marker. `measured` comes from platform APIs,
  `approximated` is derived from related native values, and `unavailable` means
  the platform did not provide a trustworthy value.

`systemAreas.statusBar` describes the OS status bar or equivalent top system
region.

`systemAreas.navigationBar` describes the Android OS navigation/gesture bar
region. On iOS it is always `present=false`; UIKit navigation bars, React
Navigation headers, and tab bars are app chrome, not OS navigation bars.

`systemAreas.homeIndicator` describes the iOS bottom home-indicator/safe gesture
region. On Android it is absent.

`systemAreas.bottomGestureArea` is the cross-platform bottom system gesture
region:

- Android: aliases `navigationBar` when Android reports a bottom
  navigation/gesture area.
- iOS: aliases `homeIndicator` when the bottom home-indicator region is present.
- Other cases: `present=false`.

Use `bottomGestureArea` when app controls should avoid the bottom system gesture
region without caring which platform produced it.

## Notes

- `physicalOrientation` follows the device sensor and may change while UI
  orientation is locked.
- `logicalOrientation` follows the app window/interface orientation.
- On iOS, `navigationBar.present` is always `false`; use `homeIndicator` or
  the cross-platform `bottomGestureArea` for the bottom system gesture region.
- Runtime aggregation is native. Diagnostic comparisons with `Dimensions`,
  `react-native-safe-area-context`, or Expo status/navigation/orientation
  packages should stay in example/test code only.

## Example Development

Use the normal Expo dev server while editing the example:

```sh
npm --prefix example run start
```

`start:detox` is reserved for Detox and runs Metro with `CI=1` on port `8081`.
Fast Refresh for files under `example/src` should work without rebuilding the
native app. The example consumes the package through the built package entry, so
changes under the package `src/` directory still require `npm run build` before
the running example can load them.

Debug native builds use single-architecture simulator/emulator defaults to keep
local iteration fast:

```sh
npm run example:build:debug:ios
npm run example:build:debug:android
```

Override `IOS_SIMULATOR_DEVICE`, `IOS_SIMULATOR_OS`,
`ANDROID_DEV_ARCHITECTURES`, or `DETOX_ANDROID_ARCHITECTURES` when testing
another simulator/emulator ABI. The release verification scripts still build the
full release configuration.

The iOS example root view controller requests home-indicator auto-hide for
manual safe-area inspection while still delegating orientation support to
`expo-screen-orientation`.

## Distribution

The npm package publishes only the files needed by consumers:

- compiled JS and TypeScript declarations under `build/`;
- CommonJS entrypoints under `build/cjs/`;
- ESM entrypoints under `build/esm/`;
- Android and iOS native module sources;
- `expo-module.config.json`, `README.md`, `CHANGELOG.md`, and `LICENSE`.

Repository-only sources, examples, E2E tests, release scripts, local artifacts,
and planning/worklog files are intentionally excluded from the npm tarball.

Before publishing, run:

```sh
npm run release:pack
npm run release:publish:dry-run
```

`release:pack` verifies the exact npm file list and fails if source, E2E,
scripts, artifacts, source maps, or planning files enter the package.
