import { NativeModule, registerWebModule } from "expo";
import { Dimensions, PixelRatio } from "react-native";

import type {
  EdgeInsets,
  SystemAreaSnapshot,
  ViewportMetricsModuleEvents,
  ViewportSnapshot,
} from "./ViewportMetrics.types";

const zeroInsets: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function noneArea(): SystemAreaSnapshot {
  return {
    kind: "none",
    present: false,
    visibility: "unknown",
    height: 0,
    insets: zeroInsets,
    stableInsets: zeroInsets,
    source: "unavailable",
  };
}

class ViewportMetricsModule extends NativeModule<ViewportMetricsModuleEvents> {
  getSnapshot(): ViewportSnapshot {
    const window = Dimensions.get("window");
    const screen = Dimensions.get("screen");
    const scale = PixelRatio.get();

    return {
      revision: 0,
      timestampMs: Date.now(),
      physicalOrientation: "unknown",
      logicalOrientation:
        window.height >= window.width ? "portrait-up" : "landscape-left",
      window: { width: window.width, height: window.height, scale },
      screen: { width: screen.width, height: screen.height, scale },
      rootView: { x: 0, y: 0, width: window.width, height: window.height },
      safeAreaInsets: zeroInsets,
      stableSystemInsets: zeroInsets,
      systemAreas: {
        statusBar: noneArea(),
        navigationBar: noneArea(),
        homeIndicator: noneArea(),
        bottomGestureArea: noneArea(),
      },
    };
  }
}

export default registerWebModule(ViewportMetricsModule, "ViewportMetrics");
