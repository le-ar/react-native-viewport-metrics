import { requireNativeView } from "expo";
import * as React from "react";

import type { ViewportMetricsViewProps } from "./ViewportMetrics.types";

const NativeView: React.ComponentType<ViewportMetricsViewProps> =
  requireNativeView("ViewportMetrics");

export default function ViewportMetricsView(props: ViewportMetricsViewProps) {
  return <NativeView {...props} />;
}
