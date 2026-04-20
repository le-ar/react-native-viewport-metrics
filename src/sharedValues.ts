import type {
  EdgeInsets,
  MutableValue,
  SystemAreaSnapshot,
  ViewportOrientation,
  ViewportMetricsSharedValues,
  ViewportOrientationSnapshotsSharedValues,
  ViewportSnapshotByOrientationKey,
  ViewportRect,
  ViewportSize,
  ViewportSnapshot,
} from "./ViewportMetrics.types";

function edgeInsetsEqual(left: EdgeInsets, right: EdgeInsets) {
  "worklet";
  return (
    left.top === right.top &&
    left.right === right.right &&
    left.bottom === right.bottom &&
    left.left === right.left
  );
}

function viewportRectEqual(left: ViewportRect, right: ViewportRect) {
  "worklet";
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function viewportSizeEqual(left: ViewportSize, right: ViewportSize) {
  "worklet";
  return (
    left.width === right.width &&
    left.height === right.height &&
    left.scale === right.scale
  );
}

function systemAreaEqual(left: SystemAreaSnapshot, right: SystemAreaSnapshot) {
  "worklet";
  return (
    left.kind === right.kind &&
    left.present === right.present &&
    left.visibility === right.visibility &&
    left.height === right.height &&
    left.source === right.source &&
    edgeInsetsEqual(left.insets, right.insets) &&
    edgeInsetsEqual(left.stableInsets, right.stableInsets)
  );
}

function setValueIfChanged<T>(
  mutable: MutableValue<T>,
  nextValue: T,
  areEqual: (left: T, right: T) => boolean,
) {
  "worklet";
  if (!areEqual(mutable.value, nextValue)) {
    mutable.value = nextValue;
  }
}

function setScalarIfChanged<T>(mutable: MutableValue<T>, nextValue: T) {
  "worklet";
  if (mutable.value !== nextValue) {
    mutable.value = nextValue;
  }
}

function isConcreteViewportOrientationWorklet(
  orientation: ViewportOrientation,
): orientation is Exclude<ViewportOrientation, "unknown"> {
  "worklet";
  return orientation !== "unknown";
}

function orientationToSnapshotByOrientationKeyWorklet(
  orientation: Exclude<ViewportOrientation, "unknown">,
): ViewportSnapshotByOrientationKey {
  "worklet";
  switch (orientation) {
    case "portrait-up":
      return "portraitUp";
    case "portrait-down":
      return "portraitDown";
    case "landscape-left":
      return "landscapeLeft";
    case "landscape-right":
      return "landscapeRight";
  }
}

function applySnapshotToViewportMetricsSharedValuesImpl(
  sharedValues: ViewportMetricsSharedValues,
  snapshot: ViewportSnapshot,
) {
  "worklet";
  setScalarIfChanged(
    sharedValues.logicalOrientation,
    snapshot.logicalOrientation,
  );
  setScalarIfChanged(
    sharedValues.physicalOrientation,
    snapshot.physicalOrientation,
  );
  setValueIfChanged(sharedValues.window, snapshot.window, viewportSizeEqual);
  setValueIfChanged(sharedValues.screen, snapshot.screen, viewportSizeEqual);
  setValueIfChanged(
    sharedValues.rootView,
    snapshot.rootView,
    viewportRectEqual,
  );
  setValueIfChanged(
    sharedValues.safeAreaInsets,
    snapshot.safeAreaInsets,
    edgeInsetsEqual,
  );
  setValueIfChanged(
    sharedValues.stableSystemInsets,
    snapshot.stableSystemInsets,
    edgeInsetsEqual,
  );
  setValueIfChanged(
    sharedValues.statusBar,
    snapshot.systemAreas.statusBar,
    systemAreaEqual,
  );
  setValueIfChanged(
    sharedValues.navigationBar,
    snapshot.systemAreas.navigationBar,
    systemAreaEqual,
  );
  setValueIfChanged(
    sharedValues.homeIndicator,
    snapshot.systemAreas.homeIndicator,
    systemAreaEqual,
  );
  setValueIfChanged(
    sharedValues.bottomGestureArea,
    snapshot.systemAreas.bottomGestureArea,
    systemAreaEqual,
  );
}

function applySnapshotToViewportOrientationSnapshotsSharedValuesImpl(
  sharedValues: ViewportOrientationSnapshotsSharedValues,
  snapshot: ViewportSnapshot,
) {
  "worklet";
  if (!isConcreteViewportOrientationWorklet(snapshot.logicalOrientation)) {
    return;
  }

  const key = orientationToSnapshotByOrientationKeyWorklet(
    snapshot.logicalOrientation,
  );
  const mutableSnapshot = sharedValues[key];

  if (mutableSnapshot.value?.revision !== snapshot.revision) {
    mutableSnapshot.value = snapshot;
  }
}

export const applySnapshotToViewportMetricsSharedValues =
  applySnapshotToViewportMetricsSharedValuesImpl;

export const applySnapshotToViewportOrientationSnapshotsSharedValues =
  applySnapshotToViewportOrientationSnapshotsSharedValuesImpl;
