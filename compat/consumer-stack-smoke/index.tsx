import {
  ViewportMetricsProvider,
  getLastKnownViewportSnapshotForOrientation,
  getLastKnownViewportSnapshotsByOrientation,
  getViewportSnapshot,
  useLastKnownViewportSnapshotForOrientation,
  useViewportMetricsSharedValues,
  useViewportOrientationSnapshotsSharedValues,
  useViewportSnapshot,
  useViewportSnapshotSharedValue,
} from "react-native-viewport-metrics";

function CompatibilityConsumer() {
  const snapshot = useViewportSnapshot();
  const sharedSnapshot = useViewportSnapshotSharedValue();
  const sharedMetrics = useViewportMetricsSharedValues();
  const sharedOrientationSnapshots =
    useViewportOrientationSnapshotsSharedValues();
  const portraitSnapshot =
    useLastKnownViewportSnapshotForOrientation("portrait-up");
  const landscapeSnapshot =
    getLastKnownViewportSnapshotForOrientation("landscape-left");
  const snapshotsByOrientation = getLastKnownViewportSnapshotsByOrientation();
  const currentSnapshot = getViewportSnapshot();
  const width =
    sharedMetrics.window.value.width +
    sharedSnapshot.value.window.width +
    currentSnapshot.window.width +
    (portraitSnapshot?.rootView.width ?? 0) +
    (landscapeSnapshot?.systemAreas.navigationBar.insets.right ?? 0) +
    (snapshotsByOrientation.landscapeRight?.stableSystemInsets.left ?? 0);

  return (
    <>
      {snapshot.logicalOrientation}
      {String(width)}
      {sharedOrientationSnapshots.portraitDown.value?.physicalOrientation ?? ""}
    </>
  );
}

export function CompatibilityFixture() {
  return (
    <ViewportMetricsProvider>
      <CompatibilityConsumer />
    </ViewportMetricsProvider>
  );
}
