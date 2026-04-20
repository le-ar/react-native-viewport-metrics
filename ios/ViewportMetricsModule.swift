import ExpoModulesCore

public class ViewportMetricsModule: Module {
  private var aggregator: ViewportMetricsAggregator? {
    guard let appContext else {
      return nil
    }
    return ViewportMetricsAggregatorRegistry.shared.get(appContext: appContext)
  }

  public func definition() -> ModuleDefinition {
    Name("ViewportMetrics")

    Events("onSnapshot")

    OnCreate {
      self.aggregator?.setModuleEmitter { [weak self] snapshot in
        self?.sendEvent("onSnapshot", snapshot)
      }
      self.aggregator?.start()
    }

    OnDestroy {
      self.aggregator?.setModuleEmitter(nil)
      self.aggregator?.stop()
    }

    OnStartObserving("onSnapshot") {
      self.aggregator?.setJsObserving(true)
    }

    OnStopObserving("onSnapshot") {
      self.aggregator?.setJsObserving(false)
    }

    Function("getSnapshot") {
      return self.aggregator?.currentSnapshot() ?? ViewportMetricsAggregator.fallbackSnapshot()
    }

    View(ViewportMetricsView.self) {
      Events("onSnapshot")
    }
  }
}
