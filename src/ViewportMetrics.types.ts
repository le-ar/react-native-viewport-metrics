import type * as React from "react";
import type { ViewProps } from "react-native";

export type ViewportOrientation =
  | "portrait-up"
  | "portrait-down"
  | "landscape-left"
  | "landscape-right"
  | "unknown";

export type ConcreteViewportOrientation = Exclude<
  ViewportOrientation,
  "unknown"
>;

export type EdgeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type ViewportRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ViewportSize = {
  width: number;
  height: number;
  scale: number;
};

export type SystemAreaVisibility = "visible" | "hidden" | "unknown";

export type SystemAreaKind =
  | "status-bar"
  | "navigation-bar"
  | "home-indicator"
  | "none";

export type SystemAreaSource = "measured" | "approximated" | "unavailable";

export type SystemAreaSnapshot = {
  kind: SystemAreaKind;
  present: boolean;
  visibility: SystemAreaVisibility;
  height: number;
  insets: EdgeInsets;
  stableInsets: EdgeInsets;
  source: SystemAreaSource;
};

export type ViewportSnapshot = {
  revision: number;
  timestampMs: number;
  physicalOrientation: ViewportOrientation;
  logicalOrientation: ViewportOrientation;
  window: ViewportSize;
  screen: ViewportSize;
  rootView: ViewportRect;
  safeAreaInsets: EdgeInsets;
  stableSystemInsets: EdgeInsets;
  systemAreas: {
    statusBar: SystemAreaSnapshot;
    navigationBar: SystemAreaSnapshot;
    homeIndicator: SystemAreaSnapshot;
    bottomGestureArea: SystemAreaSnapshot;
  };
};

export type ViewportSnapshotListener = (snapshot: ViewportSnapshot) => void;

export type ViewportSnapshotSubscription = {
  remove(): void;
};

export type ViewportMetricsModuleEvents = {
  onSnapshot(snapshot: ViewportSnapshot): void;
};

export type NativeViewportSnapshotEvent =
  | ViewportSnapshot
  | {
      nativeEvent: ViewportSnapshot;
    };

export type ViewportMetricsProviderProps = {
  children?: React.ReactNode;
  style?: ViewProps["style"];
};

export type ViewportMetricsViewProps = ViewProps & {
  onSnapshot?: (event: NativeViewportSnapshotEvent) => void;
};

export type MutableValue<T> = {
  value: T;
};

export type MutableSnapshotValue = MutableValue<ViewportSnapshot>;

export type ViewportSnapshotByOrientation = {
  portraitUp: ViewportSnapshot | null;
  portraitDown: ViewportSnapshot | null;
  landscapeLeft: ViewportSnapshot | null;
  landscapeRight: ViewportSnapshot | null;
};

export type ViewportOrientationSnapshotsSharedValues = {
  portraitUp: MutableValue<ViewportSnapshot | null>;
  portraitDown: MutableValue<ViewportSnapshot | null>;
  landscapeLeft: MutableValue<ViewportSnapshot | null>;
  landscapeRight: MutableValue<ViewportSnapshot | null>;
};

export type ViewportMetricsSharedValues = {
  logicalOrientation: MutableValue<ViewportOrientation>;
  physicalOrientation: MutableValue<ViewportOrientation>;
  window: MutableValue<ViewportSize>;
  screen: MutableValue<ViewportSize>;
  rootView: MutableValue<ViewportRect>;
  safeAreaInsets: MutableValue<EdgeInsets>;
  stableSystemInsets: MutableValue<EdgeInsets>;
  statusBar: MutableValue<SystemAreaSnapshot>;
  navigationBar: MutableValue<SystemAreaSnapshot>;
  homeIndicator: MutableValue<SystemAreaSnapshot>;
  bottomGestureArea: MutableValue<SystemAreaSnapshot>;
};

export type ViewportSharedState = {
  snapshot: MutableSnapshotValue;
  metrics: ViewportMetricsSharedValues;
  orientationSnapshots: ViewportOrientationSnapshotsSharedValues;
};

export type ViewportSnapshotByOrientationKey =
  keyof ViewportSnapshotByOrientation;
