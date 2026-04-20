import type {
  ConcreteViewportOrientation,
  EdgeInsets,
  NativeViewportSnapshotEvent,
  SystemAreaKind,
  SystemAreaSnapshot,
  ViewportSnapshotByOrientation,
  ViewportSnapshotByOrientationKey,
  ViewportOrientation,
  ViewportSnapshot,
} from "./ViewportMetrics.types";

const zeroInsets: EdgeInsets = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

export function makeEmptySystemArea(
  kind: SystemAreaKind = "none",
): SystemAreaSnapshot {
  return {
    kind,
    present: false,
    visibility: "unknown",
    height: 0,
    insets: zeroInsets,
    stableInsets: zeroInsets,
    source: "unavailable",
  };
}

export function makeFallbackSnapshot(): ViewportSnapshot {
  return {
    revision: 0,
    timestampMs: Date.now(),
    physicalOrientation: "unknown",
    logicalOrientation: "unknown",
    window: { width: 0, height: 0, scale: 1 },
    screen: { width: 0, height: 0, scale: 1 },
    rootView: { x: 0, y: 0, width: 0, height: 0 },
    safeAreaInsets: zeroInsets,
    stableSystemInsets: zeroInsets,
    systemAreas: {
      statusBar: makeEmptySystemArea("status-bar"),
      navigationBar: makeEmptySystemArea("navigation-bar"),
      homeIndicator: makeEmptySystemArea("home-indicator"),
      bottomGestureArea: makeEmptySystemArea("none"),
    },
  };
}

const orientationToSnapshotKeyMap: Record<
  ConcreteViewportOrientation,
  ViewportSnapshotByOrientationKey
> = {
  "portrait-up": "portraitUp",
  "portrait-down": "portraitDown",
  "landscape-left": "landscapeLeft",
  "landscape-right": "landscapeRight",
};

export function isConcreteViewportOrientation(
  orientation: ViewportOrientation,
): orientation is ConcreteViewportOrientation {
  return orientation !== "unknown";
}

export function makeEmptyViewportSnapshotByOrientation(): ViewportSnapshotByOrientation {
  return {
    portraitUp: null,
    portraitDown: null,
    landscapeLeft: null,
    landscapeRight: null,
  };
}

export function orientationToSnapshotByOrientationKey(
  orientation: ConcreteViewportOrientation,
): ViewportSnapshotByOrientationKey {
  return orientationToSnapshotKeyMap[orientation];
}

export function updateViewportSnapshotByOrientation(
  currentSnapshots: ViewportSnapshotByOrientation,
  snapshot: ViewportSnapshot,
): ViewportSnapshotByOrientation {
  if (!isConcreteViewportOrientation(snapshot.logicalOrientation)) {
    return currentSnapshots;
  }

  const nextKey = orientationToSnapshotByOrientationKey(
    snapshot.logicalOrientation,
  );

  if (currentSnapshots[nextKey]?.revision === snapshot.revision) {
    return currentSnapshots;
  }

  return {
    ...currentSnapshots,
    [nextKey]: snapshot,
  };
}

export function getViewportSnapshotByOrientation(
  snapshotsByOrientation: ViewportSnapshotByOrientation,
  orientation: ViewportOrientation,
): ViewportSnapshot | null {
  if (!isConcreteViewportOrientation(orientation)) {
    return null;
  }

  return snapshotsByOrientation[
    orientationToSnapshotByOrientationKey(orientation)
  ];
}

export function snapshotFromNativeEvent(
  event: NativeViewportSnapshotEvent,
): ViewportSnapshot {
  return "nativeEvent" in event ? event.nativeEvent : event;
}

export function snapshotPayloadKey(snapshot: ViewportSnapshot): string {
  return JSON.stringify(
    sortSnapshotValue({
      physicalOrientation: snapshot.physicalOrientation,
      logicalOrientation: snapshot.logicalOrientation,
      window: snapshot.window,
      screen: snapshot.screen,
      rootView: snapshot.rootView,
      safeAreaInsets: snapshot.safeAreaInsets,
      stableSystemInsets: snapshot.stableSystemInsets,
      systemAreas: snapshot.systemAreas,
    }),
  );
}

function sortSnapshotValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortSnapshotValue);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );

    return Object.fromEntries(
      entries.map(([key, nestedValue]) => [
        key,
        sortSnapshotValue(nestedValue),
      ]),
    );
  }

  return value;
}
