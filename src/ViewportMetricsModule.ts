import { NativeModule, requireNativeModule } from "expo";

import type {
  ViewportMetricsModuleEvents,
  ViewportSnapshot,
} from "./ViewportMetrics.types";

declare class ViewportMetricsModule extends NativeModule<ViewportMetricsModuleEvents> {
  getSnapshot(): ViewportSnapshot;
}

export default requireNativeModule<ViewportMetricsModule>("ViewportMetrics");
