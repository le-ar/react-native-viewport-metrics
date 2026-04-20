import type {
  ViewportSnapshot,
  ViewportSnapshotListener,
  ViewportSnapshotSubscription,
} from "./ViewportMetrics.types";

const workletListeners = new Set<ViewportSnapshotListener>();
const registryListeners = new Set<() => void>();

function notifyRegistryListeners() {
  registryListeners.forEach((listener) => listener());
}

export function addViewportSnapshotWorkletListener(
  listener: ViewportSnapshotListener,
): ViewportSnapshotSubscription {
  workletListeners.add(listener);
  notifyRegistryListeners();

  return {
    remove() {
      workletListeners.delete(listener);
      notifyRegistryListeners();
    },
  };
}

export function getViewportSnapshotWorkletListeners() {
  return Array.from(workletListeners);
}

export function subscribeWorkletRegistry(listener: () => void) {
  registryListeners.add(listener);

  return () => {
    registryListeners.delete(listener);
  };
}

export function emitToRegisteredWorklets(snapshot: ViewportSnapshot) {
  workletListeners.forEach((listener) => listener(snapshot));
}
