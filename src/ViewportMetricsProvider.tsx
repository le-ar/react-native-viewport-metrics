import * as React from "react";
import { StyleSheet, View } from "react-native";

import type {
  MutableValue,
  NativeViewportSnapshotEvent,
  ViewportMetricsProviderProps,
  ViewportSharedState,
  ViewportSnapshot,
} from "./ViewportMetrics.types";
import ViewportMetricsView from "./ViewportMetricsView";
import {
  applySnapshotToViewportMetricsSharedValues,
  applySnapshotToViewportOrientationSnapshotsSharedValues,
} from "./sharedValues";
import { getCurrentViewportSnapshot } from "./store";
import {
  getViewportSnapshotWorkletListeners,
  subscribeWorkletRegistry,
} from "./workletRegistry";

type ReanimatedModule = {
  default?: {
    createAnimatedComponent?: <P extends object>(
      component: React.ComponentType<P>,
    ) => React.ComponentType<P>;
  };
  createAnimatedComponent?: <P extends object>(
    component: React.ComponentType<P>,
  ) => React.ComponentType<P>;
  useEvent?: <T extends (...args: any[]) => unknown>(
    handler: T,
    eventNames?: string[],
    rebuild?: boolean,
  ) => T;
  useSharedValue?: <T>(value: T) => MutableValue<T>;
};

declare const require: ((name: string) => unknown) | undefined;

function useFallbackSharedValue<T>(value: T) {
  const ref = React.useRef({ value });
  return ref.current;
}

function useFallbackEvent<T extends (...args: any[]) => unknown>():
  | T
  | undefined {
  return undefined;
}

function loadReanimated(): ReanimatedModule | null {
  try {
    if (typeof require !== "function") {
      return null;
    }
    return require("react-native-reanimated") as ReanimatedModule;
  } catch {
    return null;
  }
}

const reanimated = loadReanimated();
const createAnimatedComponent =
  reanimated?.default?.createAnimatedComponent ??
  reanimated?.createAnimatedComponent;
const hasReanimatedWorkletSupport = Boolean(
  createAnimatedComponent && reanimated?.useEvent && reanimated?.useSharedValue,
);
const useEventImpl = reanimated?.useEvent ?? useFallbackEvent;
const useSharedValueImpl = reanimated?.useSharedValue ?? useFallbackSharedValue;
const providerEventNames = ["onSnapshot", "snapshot", "topSnapshot"];

const AnimatedViewportMetricsView = createAnimatedComponent
  ? createAnimatedComponent(ViewportMetricsView)
  : ViewportMetricsView;

const ViewportSharedStateContext =
  React.createContext<ViewportSharedState | null>(null);

function useWorkletRegistryVersion() {
  const [version, setVersion] = React.useState(0);

  React.useEffect(
    () =>
      subscribeWorkletRegistry(() => {
        setVersion((current) => current + 1);
      }),
    [],
  );

  return version;
}

function useInitialSnapshot() {
  const initialSnapshotRef = React.useRef<ViewportSnapshot | null>(null);

  if (initialSnapshotRef.current == null) {
    initialSnapshotRef.current = getCurrentViewportSnapshot();
  }

  return initialSnapshotRef.current;
}

function useViewportSharedState(initialSnapshot: ViewportSnapshot) {
  const sharedSnapshot = useSharedValueImpl(initialSnapshot);
  const logicalOrientation = useSharedValueImpl(
    initialSnapshot.logicalOrientation,
  );
  const physicalOrientation = useSharedValueImpl(
    initialSnapshot.physicalOrientation,
  );
  const window = useSharedValueImpl(initialSnapshot.window);
  const screen = useSharedValueImpl(initialSnapshot.screen);
  const rootView = useSharedValueImpl(initialSnapshot.rootView);
  const safeAreaInsets = useSharedValueImpl(initialSnapshot.safeAreaInsets);
  const stableSystemInsets = useSharedValueImpl(
    initialSnapshot.stableSystemInsets,
  );
  const statusBar = useSharedValueImpl(initialSnapshot.systemAreas.statusBar);
  const navigationBar = useSharedValueImpl(
    initialSnapshot.systemAreas.navigationBar,
  );
  const homeIndicator = useSharedValueImpl(
    initialSnapshot.systemAreas.homeIndicator,
  );
  const bottomGestureArea = useSharedValueImpl(
    initialSnapshot.systemAreas.bottomGestureArea,
  );
  const portraitUp = useSharedValueImpl<ViewportSnapshot | null>(
    initialSnapshot.logicalOrientation === "portrait-up"
      ? initialSnapshot
      : null,
  );
  const portraitDown = useSharedValueImpl<ViewportSnapshot | null>(
    initialSnapshot.logicalOrientation === "portrait-down"
      ? initialSnapshot
      : null,
  );
  const landscapeLeft = useSharedValueImpl<ViewportSnapshot | null>(
    initialSnapshot.logicalOrientation === "landscape-left"
      ? initialSnapshot
      : null,
  );
  const landscapeRight = useSharedValueImpl<ViewportSnapshot | null>(
    initialSnapshot.logicalOrientation === "landscape-right"
      ? initialSnapshot
      : null,
  );

  return React.useMemo<ViewportSharedState>(
    () => ({
      snapshot: sharedSnapshot,
      metrics: {
        logicalOrientation,
        physicalOrientation,
        window,
        screen,
        rootView,
        safeAreaInsets,
        stableSystemInsets,
        statusBar,
        navigationBar,
        homeIndicator,
        bottomGestureArea,
      },
      orientationSnapshots: {
        portraitUp,
        portraitDown,
        landscapeLeft,
        landscapeRight,
      },
    }),
    [
      bottomGestureArea,
      homeIndicator,
      landscapeLeft,
      landscapeRight,
      logicalOrientation,
      navigationBar,
      physicalOrientation,
      portraitDown,
      portraitUp,
      rootView,
      safeAreaInsets,
      screen,
      sharedSnapshot,
      stableSystemInsets,
      statusBar,
      window,
    ],
  );
}

function useProviderEventHandler(
  version: number,
  sharedState: ViewportSharedState,
) {
  const listeners = React.useMemo(
    () => getViewportSnapshotWorkletListeners(),
    [version],
  );

  const handler = React.useCallback(
    (event: NativeViewportSnapshotEvent) => {
      "worklet";
      const snapshot = "nativeEvent" in event ? event.nativeEvent : event;
      if (sharedState.snapshot.value.revision === snapshot.revision) {
        return;
      }
      sharedState.snapshot.value = snapshot;
      applySnapshotToViewportMetricsSharedValues(sharedState.metrics, snapshot);
      applySnapshotToViewportOrientationSnapshotsSharedValues(
        sharedState.orientationSnapshots,
        snapshot,
      );
      for (const listener of listeners) {
        listener(snapshot);
      }
    },
    [listeners, sharedState],
  );

  return useEventImpl(handler, providerEventNames, true);
}

export function ViewportMetricsProvider({
  children,
  style,
}: ViewportMetricsProviderProps) {
  const initialSnapshot = useInitialSnapshot();
  const sharedState = useViewportSharedState(initialSnapshot);
  const version = useWorkletRegistryVersion();
  const workletEventHandler = useProviderEventHandler(version, sharedState);
  const isUiThreadDriven =
    hasReanimatedWorkletSupport && workletEventHandler != null;

  return (
    <ViewportSharedStateContext.Provider
      value={isUiThreadDriven ? sharedState : null}
    >
      <View style={[styles.root, style]}>
        {children}
        <AnimatedViewportMetricsView
          key={workletEventHandler ? `worklet-${version}` : "provider"}
          collapsable={false}
          pointerEvents="none"
          style={styles.nativeProvider}
          onSnapshot={workletEventHandler}
        />
      </View>
    </ViewportSharedStateContext.Provider>
  );
}

export function useViewportMetricsSharedState() {
  return React.useContext(ViewportSharedStateContext);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  nativeProvider: {
    ...StyleSheet.absoluteFillObject,
  },
});
