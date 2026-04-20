import * as React from "react";

import type {
  MutableSnapshotValue,
  ViewportMetricsSharedValues,
  ViewportOrientation,
  ViewportOrientationSnapshotsSharedValues,
  ViewportSnapshot,
  ViewportSnapshotByOrientation,
} from "./ViewportMetrics.types";
import {
  ViewportMetricsProvider,
  useViewportMetricsSharedState,
} from "./ViewportMetricsProvider";
import {
  addViewportSnapshotListener,
  getCurrentViewportSnapshot,
  getCurrentViewportSnapshotForOrientation,
  getLastKnownViewportSnapshotForOrientationFromStore,
  getLastKnownViewportSnapshotsByOrientationFromStore,
  getViewportSnapshotFromStore,
  subscribeViewportSnapshotStore,
} from "./store";
import { addViewportSnapshotWorkletListener } from "./workletRegistry";

export { default as ViewportMetricsModule } from "./ViewportMetricsModule";
export { default as ViewportMetricsView } from "./ViewportMetricsView";
export { ViewportMetricsProvider };
export { addViewportSnapshotListener, addViewportSnapshotWorkletListener };
export * from "./ViewportMetrics.types";

export function getViewportSnapshot(): ViewportSnapshot {
  return getViewportSnapshotFromStore();
}

export function getLastKnownViewportSnapshotsByOrientation(): ViewportSnapshotByOrientation {
  return getLastKnownViewportSnapshotsByOrientationFromStore();
}

export function getLastKnownViewportSnapshotForOrientation(
  orientation: ViewportOrientation,
) {
  return getLastKnownViewportSnapshotForOrientationFromStore(orientation);
}

export function useViewportSnapshot(): ViewportSnapshot {
  return React.useSyncExternalStore(
    subscribeViewportSnapshotStore,
    getCurrentViewportSnapshot,
    getCurrentViewportSnapshot,
  );
}

export function useLastKnownViewportSnapshotForOrientation(
  orientation: ViewportOrientation,
) {
  return React.useSyncExternalStore(
    subscribeViewportSnapshotStore,
    () => getCurrentViewportSnapshotForOrientation(orientation),
    () => getCurrentViewportSnapshotForOrientation(orientation),
  );
}

export function useViewportSnapshotSharedValue(): MutableSnapshotValue {
  const providerValue = useViewportMetricsSharedState();

  if (!providerValue) {
    throw new Error(
      "useViewportSnapshotSharedValue requires ViewportMetricsProvider with Reanimated worklet event support. Mount ViewportMetricsProvider and install react-native-reanimated, or use useViewportSnapshot() for JS-thread snapshots.",
    );
  }

  return providerValue.snapshot;
}

export function useViewportMetricsSharedValues(): ViewportMetricsSharedValues {
  const providerValue = useViewportMetricsSharedState();

  if (!providerValue) {
    throw new Error(
      "useViewportMetricsSharedValues requires ViewportMetricsProvider with Reanimated worklet event support. Mount ViewportMetricsProvider and install react-native-reanimated, or use useViewportSnapshot() for JS-thread snapshots.",
    );
  }

  return providerValue.metrics;
}

export function useViewportOrientationSnapshotsSharedValues(): ViewportOrientationSnapshotsSharedValues {
  const providerValue = useViewportMetricsSharedState();

  if (!providerValue) {
    throw new Error(
      "useViewportOrientationSnapshotsSharedValues requires ViewportMetricsProvider with Reanimated worklet event support. Mount ViewportMetricsProvider and install react-native-reanimated, or use useViewportSnapshot() for JS-thread snapshots.",
    );
  }

  return providerValue.orientationSnapshots;
}
