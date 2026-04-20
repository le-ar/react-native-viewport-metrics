import type {
  NativeViewportSnapshotEvent,
  ViewportOrientation,
  ViewportSnapshot,
  ViewportSnapshotByOrientation,
  ViewportSnapshotListener,
  ViewportSnapshotSubscription,
} from "./ViewportMetrics.types";
import ViewportMetricsModule from "./ViewportMetricsModule";
import {
  getViewportSnapshotByOrientation,
  makeFallbackSnapshot,
  makeEmptyViewportSnapshotByOrientation,
  snapshotPayloadKey,
  updateViewportSnapshotByOrientation,
} from "./snapshot";

type StoreListener = () => void;

let currentSnapshot = readNativeSnapshot();
let currentSnapshotKey = snapshotPayloadKey(currentSnapshot);
let currentSnapshotsByOrientation = updateViewportSnapshotByOrientation(
  makeEmptyViewportSnapshotByOrientation(),
  currentSnapshot,
);
let nativeSubscription: ViewportSnapshotSubscription | null = null;
const storeListeners = new Set<StoreListener>();

function readNativeSnapshot(): ViewportSnapshot {
  try {
    return ViewportMetricsModule.getSnapshot();
  } catch {
    return makeFallbackSnapshot();
  }
}

function setCurrentSnapshot(snapshot: ViewportSnapshot) {
  const nextSnapshotKey = snapshotPayloadKey(snapshot);

  if (
    snapshot.revision === currentSnapshot.revision &&
    nextSnapshotKey === currentSnapshotKey
  ) {
    return;
  }

  currentSnapshot = snapshot;
  currentSnapshotKey = nextSnapshotKey;
  currentSnapshotsByOrientation = updateViewportSnapshotByOrientation(
    currentSnapshotsByOrientation,
    snapshot,
  );
  storeListeners.forEach((listener) => listener());
}

function ensureNativeSubscription() {
  if (nativeSubscription) {
    return;
  }

  nativeSubscription = ViewportMetricsModule.addListener(
    "onSnapshot",
    (snapshot: ViewportSnapshot) => {
      setCurrentSnapshot(snapshot);
    },
  );
}

function releaseNativeSubscriptionIfUnused() {
  if (storeListeners.size > 0 || !nativeSubscription) {
    return;
  }

  nativeSubscription.remove();
  nativeSubscription = null;
}

export function getViewportSnapshotFromStore(): ViewportSnapshot {
  const snapshot = readNativeSnapshot();
  setCurrentSnapshot(snapshot);
  return currentSnapshot;
}

export function getCurrentViewportSnapshot(): ViewportSnapshot {
  return currentSnapshot;
}

export function getLastKnownViewportSnapshotsByOrientationFromStore(): ViewportSnapshotByOrientation {
  const snapshot = readNativeSnapshot();
  setCurrentSnapshot(snapshot);
  return currentSnapshotsByOrientation;
}

export function getCurrentViewportSnapshotsByOrientation() {
  return currentSnapshotsByOrientation;
}

export function getLastKnownViewportSnapshotForOrientationFromStore(
  orientation: ViewportOrientation,
) {
  return getViewportSnapshotByOrientation(
    getLastKnownViewportSnapshotsByOrientationFromStore(),
    orientation,
  );
}

export function getCurrentViewportSnapshotForOrientation(
  orientation: ViewportOrientation,
) {
  return getViewportSnapshotByOrientation(
    currentSnapshotsByOrientation,
    orientation,
  );
}

export function subscribeViewportSnapshotStore(listener: StoreListener) {
  storeListeners.add(listener);
  ensureNativeSubscription();

  return () => {
    storeListeners.delete(listener);
    releaseNativeSubscriptionIfUnused();
  };
}

export function addViewportSnapshotListener(
  listener: ViewportSnapshotListener,
): ViewportSnapshotSubscription {
  ensureNativeSubscription();

  const subscription = ViewportMetricsModule.addListener(
    "onSnapshot",
    (snapshot: ViewportSnapshot) => {
      setCurrentSnapshot(snapshot);
      listener(snapshot);
    },
  );

  return {
    remove() {
      subscription.remove();
      releaseNativeSubscriptionIfUnused();
    },
  };
}

export function acceptViewportSnapshotEvent(
  event: NativeViewportSnapshotEvent,
) {
  setCurrentSnapshot("nativeEvent" in event ? event.nativeEvent : event);
}
