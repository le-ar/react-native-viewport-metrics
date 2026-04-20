import { makeFallbackSnapshot } from "../snapshot";
import {
  addViewportSnapshotWorkletListener,
  emitToRegisteredWorklets,
  getViewportSnapshotWorkletListeners,
  subscribeWorkletRegistry,
} from "../workletRegistry";

describe("worklet registry", () => {
  it("registers and unregisters worklet listeners", () => {
    const listener = jest.fn();

    const subscription = addViewportSnapshotWorkletListener(listener);

    expect(getViewportSnapshotWorkletListeners()).toContain(listener);

    subscription.remove();

    expect(getViewportSnapshotWorkletListeners()).not.toContain(listener);
  });

  it("notifies registry subscribers on add and remove", () => {
    const registryListener = jest.fn();
    const unsubscribe = subscribeWorkletRegistry(registryListener);

    const subscription = addViewportSnapshotWorkletListener(jest.fn());
    subscription.remove();
    unsubscribe();

    expect(registryListener).toHaveBeenCalledTimes(2);
  });

  it("emits snapshots to registered worklet listeners", () => {
    const snapshot = {
      ...makeFallbackSnapshot(),
      revision: 7,
    };
    const first = jest.fn();
    const second = jest.fn();

    const firstSubscription = addViewportSnapshotWorkletListener(first);
    const secondSubscription = addViewportSnapshotWorkletListener(second);

    emitToRegisteredWorklets(snapshot);

    expect(first).toHaveBeenCalledWith(snapshot);
    expect(second).toHaveBeenCalledWith(snapshot);

    firstSubscription.remove();
    secondSubscription.remove();
  });
});
