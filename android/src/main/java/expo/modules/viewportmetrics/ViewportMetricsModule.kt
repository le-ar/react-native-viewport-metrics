package expo.modules.viewportmetrics

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ViewportMetricsModule : Module() {
  private val aggregator: ViewportMetricsAggregator
    get() = ViewportMetricsAggregatorRegistry.get(appContext)

  override fun definition() = ModuleDefinition {
    Name("ViewportMetrics")

    Events("onSnapshot")

    OnCreate {
      aggregator.setModuleEmitter { snapshot ->
        sendEvent("onSnapshot", snapshot)
      }
      aggregator.start()
    }

    OnDestroy {
      aggregator.setModuleEmitter(null)
      aggregator.stop()
    }

    OnStartObserving("onSnapshot") {
      aggregator.setJsObserving(true)
    }

    OnStopObserving("onSnapshot") {
      aggregator.setJsObserving(false)
    }

    OnActivityEntersForeground {
      aggregator.start()
      aggregator.markDirty("activityForeground")
    }

    OnActivityEntersBackground {
      aggregator.pauseSensors()
    }

    Function("getSnapshot") {
      aggregator.currentSnapshot()
    }

    View(ViewportMetricsView::class) {
      Events("onSnapshot")
    }
  }
}
