import ExpoModulesCore
import UIKit

class ViewportMetricsView: ExpoView {
  private let onSnapshot = EventDispatcher()
  private var aggregator: ViewportMetricsAggregator? {
    guard let appContext else {
      return nil
    }
    return ViewportMetricsAggregatorRegistry.shared.get(appContext: appContext)
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    backgroundColor = .clear
  }

  private var reactBridge: AnyObject? {
    appContext?.value(forKey: "reactBridge") as AnyObject?
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()

    if window == nil {
      aggregator?.unregisterProviderView(self)
    } else {
      aggregator?.registerProviderView(self)
      aggregator?.markDirty("providerWindow")
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    aggregator?.markDirty("providerLayout")
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    aggregator?.markDirty("providerSafeArea")
  }

  func emitSnapshot(_ snapshot: [String: Any?]) {
    let eventPayload = sanitizeLegacyEventBody(snapshot)

    if let reactBridge {
      ViewportMetricsDispatchLegacySnapshotEvent(
        self,
        reactBridge,
        eventPayload
      )
    }
    onSnapshot(eventPayload)
  }
}

private func sanitizeLegacyEventBody(_ value: [String: Any?]) -> [String: Any] {
  var sanitized: [String: Any] = [:]
  sanitized.reserveCapacity(value.count)

  for (key, nestedValue) in value {
    sanitized[key] = sanitizeLegacyEventValue(nestedValue)
  }

  return sanitized
}

private func sanitizeLegacyEventValue(_ value: Any?) -> Any {
  switch value {
  case nil:
    return NSNull()
  case let dictionary as [String: Any?]:
    return sanitizeLegacyEventBody(dictionary)
  case let dictionary as [String: Any]:
    return dictionary.reduce(into: [String: Any]()) { partialResult, entry in
      partialResult[entry.key] = sanitizeLegacyEventValue(entry.value)
    }
  case let array as [Any?]:
    return array.map(sanitizeLegacyEventValue)
  case let array as [Any]:
    return array.map(sanitizeLegacyEventValue)
  default:
    return value as Any
  }
}
