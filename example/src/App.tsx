import { View } from "react-native";
import { ViewportMetricsProvider } from "react-native-viewport-metrics";

import { SnapshotScreen } from "./SnapshotScreen";

export default function App() {
  return (
    <ViewportMetricsProvider>
      <View style={{ flex: 1, width: "100%" }}>
        <SnapshotScreen />
      </View>
    </ViewportMetricsProvider>
  );
}
