import type {
  MutableValue,
  ViewportMetricsSharedValues,
  ViewportOrientationSnapshotsSharedValues,
  ViewportSnapshot,
} from "../ViewportMetrics.types";
import {
  applySnapshotToViewportMetricsSharedValues,
  applySnapshotToViewportOrientationSnapshotsSharedValues,
} from "../sharedValues";
import { makeFallbackSnapshot } from "../snapshot";

function makeMutableValue<T>(value: T): MutableValue<T> {
  return { value };
}

function makeSharedMetrics(
  snapshot: ViewportSnapshot,
): ViewportMetricsSharedValues {
  return {
    logicalOrientation: makeMutableValue(snapshot.logicalOrientation),
    physicalOrientation: makeMutableValue(snapshot.physicalOrientation),
    window: makeMutableValue(snapshot.window),
    screen: makeMutableValue(snapshot.screen),
    rootView: makeMutableValue(snapshot.rootView),
    safeAreaInsets: makeMutableValue(snapshot.safeAreaInsets),
    stableSystemInsets: makeMutableValue(snapshot.stableSystemInsets),
    statusBar: makeMutableValue(snapshot.systemAreas.statusBar),
    navigationBar: makeMutableValue(snapshot.systemAreas.navigationBar),
    homeIndicator: makeMutableValue(snapshot.systemAreas.homeIndicator),
    bottomGestureArea: makeMutableValue(snapshot.systemAreas.bottomGestureArea),
  };
}

function makeOrientationSharedValues(
  snapshot: ViewportSnapshot,
): ViewportOrientationSnapshotsSharedValues {
  return {
    portraitUp: makeMutableValue<ViewportSnapshot | null>(null),
    portraitDown: makeMutableValue<ViewportSnapshot | null>(null),
    landscapeLeft: makeMutableValue<ViewportSnapshot | null>(null),
    landscapeRight: makeMutableValue<ViewportSnapshot | null>(null),
  };
}

describe("shared value helpers", () => {
  it("updates only the changed current metric atoms", () => {
    const snapshot = makeFallbackSnapshot();
    const sharedMetrics = makeSharedMetrics(snapshot);
    const nextSnapshot = {
      ...snapshot,
      revision: 10,
      logicalOrientation: "landscape-left" as const,
      window: { ...snapshot.window, width: 640, height: 360 },
    };

    const previousSafeAreaInsets = sharedMetrics.safeAreaInsets.value;
    const previousNavigationBar = sharedMetrics.navigationBar.value;

    applySnapshotToViewportMetricsSharedValues(sharedMetrics, nextSnapshot);

    expect(sharedMetrics.logicalOrientation.value).toBe("landscape-left");
    expect(sharedMetrics.window.value).toEqual(nextSnapshot.window);
    expect(sharedMetrics.safeAreaInsets.value).toBe(previousSafeAreaInsets);
    expect(sharedMetrics.navigationBar.value).toBe(previousNavigationBar);
  });

  it("writes orientation buckets using logical orientation", () => {
    const snapshot = {
      ...makeFallbackSnapshot(),
      revision: 12,
      logicalOrientation: "portrait-down" as const,
      physicalOrientation: "landscape-left" as const,
    };
    const sharedValues = makeOrientationSharedValues(snapshot);

    applySnapshotToViewportOrientationSnapshotsSharedValues(
      sharedValues,
      snapshot,
    );

    expect(sharedValues.portraitDown.value).toBe(snapshot);
    expect(sharedValues.landscapeLeft.value).toBeNull();
  });

  it("does not overwrite orientation buckets for unknown logical orientation", () => {
    const initialSnapshot = {
      ...makeFallbackSnapshot(),
      revision: 3,
      logicalOrientation: "portrait-up" as const,
    };
    const sharedValues = makeOrientationSharedValues(initialSnapshot);
    sharedValues.portraitUp.value = initialSnapshot;

    applySnapshotToViewportOrientationSnapshotsSharedValues(sharedValues, {
      ...initialSnapshot,
      revision: 4,
      logicalOrientation: "unknown",
    });

    expect(sharedValues.portraitUp.value).toBe(initialSnapshot);
  });
});
