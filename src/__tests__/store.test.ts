import { makeFallbackSnapshot } from "../snapshot";

type StoreModule = typeof import("../store");

describe("viewport snapshot store", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadStore() {
    const initialSnapshot = makeFallbackSnapshot();
    const nativeListeners = new Set<(snapshot: unknown) => void>();
    const removeMocks: jest.Mock[] = [];
    const viewportMetricsModule = {
      getSnapshot: jest.fn(() => initialSnapshot),
      addListener: jest.fn(
        (_eventName: string, listener: (snapshot: unknown) => void) => {
          nativeListeners.add(listener);
          const remove = jest.fn(() => {
            nativeListeners.delete(listener);
          });
          removeMocks.push(remove);
          return { remove };
        },
      ),
    };

    let store: StoreModule;

    jest.isolateModules(() => {
      jest.doMock("../ViewportMetricsModule", () => ({
        __esModule: true,
        default: viewportMetricsModule,
      }));
      store = require("../store") as StoreModule;
    });

    const emit = (snapshot: unknown) => {
      Array.from(nativeListeners).forEach((listener) => listener(snapshot));
    };

    return {
      store: store!,
      viewportMetricsModule,
      removeMocks,
      emit,
      initialSnapshot,
    };
  }

  it("subscribes once to the native module and releases when unused", () => {
    const { store, viewportMetricsModule, removeMocks, emit, initialSnapshot } =
      loadStore();
    const storeListener = jest.fn();
    const nextSnapshot = {
      ...initialSnapshot,
      revision: 1,
      logicalOrientation: "landscape-left" as const,
      window: { ...initialSnapshot.window, width: 640, height: 360 },
    };

    const unsubscribe = store.subscribeViewportSnapshotStore(storeListener);

    expect(viewportMetricsModule.addListener).toHaveBeenCalledTimes(1);

    emit(nextSnapshot);

    expect(storeListener).toHaveBeenCalledTimes(1);
    expect(store.getCurrentViewportSnapshot()).toEqual(nextSnapshot);

    unsubscribe();

    expect(removeMocks).toHaveLength(1);
    expect(removeMocks[0]).toHaveBeenCalledTimes(1);
  });

  it("updates the store before calling addViewportSnapshotListener listeners", () => {
    const { store, emit, initialSnapshot } = loadStore();
    const nextSnapshot = {
      ...initialSnapshot,
      revision: 3,
      physicalOrientation: "landscape-right" as const,
      rootView: { ...initialSnapshot.rootView, width: 320, height: 640 },
    };
    const listener = jest.fn((snapshot) => {
      expect(store.getCurrentViewportSnapshot()).toEqual(snapshot);
    });

    const subscription = store.addViewportSnapshotListener(listener);

    emit(nextSnapshot);

    expect(listener).toHaveBeenCalledWith(nextSnapshot);

    subscription.remove();
  });

  it("keeps a JS-side bank of the last known snapshots by logical orientation", () => {
    const { store, emit, initialSnapshot } = loadStore();
    const portraitSnapshot = {
      ...initialSnapshot,
      revision: 6,
      logicalOrientation: "portrait-up" as const,
    };
    const landscapeSnapshot = {
      ...initialSnapshot,
      revision: 7,
      logicalOrientation: "landscape-right" as const,
    };

    store.subscribeViewportSnapshotStore(jest.fn());

    emit(portraitSnapshot);
    emit(landscapeSnapshot);

    const snapshotsByOrientation =
      store.getCurrentViewportSnapshotsByOrientation();

    expect(snapshotsByOrientation.portraitUp).toEqual(portraitSnapshot);
    expect(snapshotsByOrientation.landscapeRight).toEqual(landscapeSnapshot);
    expect(
      store.getCurrentViewportSnapshotForOrientation("landscape-right"),
    ).toEqual(landscapeSnapshot);
  });

  it("does not overwrite JS-side buckets when the logical orientation is unknown", () => {
    const { store, emit, initialSnapshot } = loadStore();
    const portraitSnapshot = {
      ...initialSnapshot,
      revision: 8,
      logicalOrientation: "portrait-up" as const,
    };

    store.subscribeViewportSnapshotStore(jest.fn());

    emit(portraitSnapshot);
    emit({
      ...initialSnapshot,
      revision: 9,
      logicalOrientation: "unknown" as const,
    });

    expect(
      store.getCurrentViewportSnapshotForOrientation("portrait-up"),
    ).toEqual(portraitSnapshot);
  });
});
