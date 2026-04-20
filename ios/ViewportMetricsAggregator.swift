import ExpoModulesCore
import UIKit

final class ViewportMetricsAggregatorRegistry {
  static let shared = ViewportMetricsAggregatorRegistry()

  private let lock = NSLock()
  private let aggregators = NSMapTable<AppContext, ViewportMetricsAggregator>(
    keyOptions: .weakMemory,
    valueOptions: .strongMemory
  )

  func get(appContext: AppContext) -> ViewportMetricsAggregator {
    lock.lock()
    defer {
      lock.unlock()
    }

    if let aggregator = aggregators.object(forKey: appContext) {
      return aggregator
    }

    let aggregator = ViewportMetricsAggregator(appContext: appContext)
    aggregators.setObject(aggregator, forKey: appContext)
    return aggregator
  }
}

final class ViewportMetricsAggregator {
  private weak var appContext: AppContext?
  private let providerViews = NSHashTable<ViewportMetricsView>.weakObjects()
  private let nativeTimingEnabled: Bool
  private let nativeTimingRunId: String?
  private var moduleEmitter: (([String: Any?]) -> Void)?
  private var jsObserving = false
  private var scheduled = false
  private var observingDeviceOrientation = false
  private var orientationObserver: NSObjectProtocol?
  private var revision = 0
  private var lastPayloadKey: String?
  private var lastSnapshot: [String: Any?]?
  private var physicalOrientation = "unknown"

  init(appContext: AppContext) {
    self.appContext = appContext
    self.nativeTimingEnabled = Self.readBooleanLaunchArg("viewportMetricsNativeTiming")
    self.nativeTimingRunId = Self.readStringLaunchArg("viewportMetricsTimingRunId")
  }

  deinit {
    let orientationObserver = orientationObserver
    let shouldEndDeviceOrientation = observingDeviceOrientation

    guard orientationObserver != nil || shouldEndDeviceOrientation else {
      return
    }

    if Thread.isMainThread {
      Self.stopDeviceOrientation(
        observer: orientationObserver,
        shouldEndDeviceOrientation: shouldEndDeviceOrientation
      )
    } else {
      DispatchQueue.main.async {
        Self.stopDeviceOrientation(
          observer: orientationObserver,
          shouldEndDeviceOrientation: shouldEndDeviceOrientation
        )
      }
    }
  }

  func setModuleEmitter(_ emitter: (([String: Any?]) -> Void)?) {
    runOnMain {
      self.moduleEmitter = emitter
    }
  }

  func setJsObserving(_ observing: Bool) {
    runOnMain {
      if self.jsObserving == observing {
        return
      }

      self.jsObserving = observing
      if observing {
        self.emitSnapshot(self.currentSnapshotOnMain(), forceModule: true)
      }
    }
  }

  func start() {
    runOnMain {
      if self.observingDeviceOrientation {
        self.markDirty("start")
        return
      }

      self.observingDeviceOrientation = true
      UIDevice.current.beginGeneratingDeviceOrientationNotifications()
      self.orientationObserver = NotificationCenter.default.addObserver(
        forName: UIDevice.orientationDidChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.deviceOrientationDidChange()
      }
      self.physicalOrientation = self.readPhysicalOrientation(stage: "start")
      self.markDirty("start")
    }
  }

  func stop() {
    runOnMain { [weak self] in
      self?.stopOnMain()
    }
  }

  func registerProviderView(_ view: ViewportMetricsView) {
    runOnMain {
      self.providerViews.add(view)
      self.markDirty("registerProvider")
    }
  }

  func unregisterProviderView(_ view: ViewportMetricsView) {
    runOnMain {
      self.providerViews.remove(view)
      self.markDirty("unregisterProvider")
    }
  }

  func markDirty(_ reason: String) {
    runOnMain {
      if self.scheduled {
        return
      }

      self.scheduled = true
      DispatchQueue.main.async {
        self.scheduled = false
        self.flushIfChanged()
      }
    }
  }

  func currentSnapshot() -> [String: Any?] {
    return syncOnMain {
      return self.currentSnapshotOnMain()
    }
  }

  private func currentSnapshotOnMain() -> [String: Any?] {
    let snapshot = buildSnapshot(revision: revision)
    lastSnapshot = snapshot
    lastPayloadKey = Self.payloadKey(snapshot)
    return snapshot
  }

  private func stopOnMain() {
    let orientationObserver = orientationObserver
    let shouldEndDeviceOrientation = observingDeviceOrientation

    self.orientationObserver = nil
    observingDeviceOrientation = false
    providerViews.removeAllObjects()
    scheduled = false
    Self.stopDeviceOrientation(
      observer: orientationObserver,
      shouldEndDeviceOrientation: shouldEndDeviceOrientation
    )
  }

  private func flushIfChanged() {
    let candidate = buildSnapshot(revision: revision)
    let payloadKey = Self.payloadKey(candidate)

    if payloadKey != lastPayloadKey {
      revision += 1
      let snapshot = buildSnapshot(revision: revision)
      lastSnapshot = snapshot
      lastPayloadKey = Self.payloadKey(snapshot)
      emitSnapshot(snapshot)
    }
  }

  private func emitSnapshot(_ snapshot: [String: Any?], forceModule: Bool = false) {
    logNativeTiming(
      marker: "emit-snapshot-start",
      extra: [
        "forceModule": forceModule,
        "revision": snapshot["revision"] ?? NSNull(),
        "physicalOrientation": snapshot["physicalOrientation"] ?? NSNull(),
        "logicalOrientation": snapshot["logicalOrientation"] ?? NSNull()
      ]
    )
    if jsObserving || forceModule {
      moduleEmitter?(snapshot)
    }

    for view in providerViews.allObjects {
      view.emitSnapshot(snapshot)
    }
    logNativeTiming(
      marker: "emit-snapshot-end",
      extra: [
        "forceModule": forceModule,
        "revision": snapshot["revision"] ?? NSNull(),
        "physicalOrientation": snapshot["physicalOrientation"] ?? NSNull(),
        "logicalOrientation": snapshot["logicalOrientation"] ?? NSNull()
      ]
    )
  }

  private func deviceOrientationDidChange() {
    let nextOrientation = readPhysicalOrientation(stage: "deviceOrientationDidChange")
    if nextOrientation != physicalOrientation {
      physicalOrientation = nextOrientation
      markDirty("physicalOrientation")
    }
  }

  private func buildSnapshot(revision: Int) -> [String: Any?] {
    let providerView = primaryView()
    let window = providerView?.window ?? Self.activeWindow()
    let screen = window?.screen ?? UIScreen.main
    let rootView = providerView ?? window
    let windowBounds = window?.bounds ?? screen.bounds
    let rootRect = rootView.map { view in
      view.convert(view.bounds, to: window)
    } ?? .zero
    let safeArea = rootView?.safeAreaInsets ?? window?.safeAreaInsets ?? .zero
    let logicalOrientation = readLogicalOrientation(window: window, stage: "buildSnapshot")
    let statusArea = statusBarArea(window: window, safeArea: safeArea)
    let homeIndicatorArea = homeIndicatorArea(safeArea: safeArea)
    let bottomGestureArea = safeArea.bottom > 0 ? homeIndicatorArea : Self.noneArea()

    return [
      "revision": revision,
      "timestampMs": Date().timeIntervalSince1970 * 1000.0,
      "physicalOrientation": physicalOrientation,
      "logicalOrientation": logicalOrientation,
      "window": Self.size(width: windowBounds.width, height: windowBounds.height, scale: screen.scale),
      "screen": Self.size(width: screen.bounds.width, height: screen.bounds.height, scale: screen.scale),
      "rootView": Self.rect(rootRect),
      "safeAreaInsets": Self.insets(safeArea),
      "stableSystemInsets": Self.insets(safeArea),
      "systemAreas": [
        "statusBar": statusArea,
        "navigationBar": Self.systemArea(
          kind: "navigation-bar",
          present: false,
          visibility: "unknown",
          height: 0,
          insets: .zero,
          stableInsets: .zero,
          source: "unavailable"
        ),
        "homeIndicator": homeIndicatorArea,
        "bottomGestureArea": bottomGestureArea
      ]
    ]
  }

  private func statusBarArea(window: UIWindow?, safeArea: UIEdgeInsets) -> [String: Any?] {
    let manager = window?.windowScene?.statusBarManager
    let frame = manager?.statusBarFrame ?? .zero
    let frameHeight = min(frame.width, frame.height)
    let stableTop = max(safeArea.top, frameHeight)
    let present = stableTop > 0 || manager != nil
    let source = frameHeight > 0 ? "measured" : (present ? "approximated" : "unavailable")
    let visibility: String

    if let hidden = manager?.isStatusBarHidden {
      visibility = hidden ? (present ? "hidden" : "unknown") : "visible"
    } else {
      visibility = frameHeight > 0 ? "visible" : (present ? "hidden" : "unknown")
    }

    return Self.systemArea(
      kind: "status-bar",
      present: present,
      visibility: visibility,
      height: stableTop,
      insets: UIEdgeInsets(top: frameHeight, left: 0, bottom: 0, right: 0),
      stableInsets: UIEdgeInsets(top: stableTop, left: 0, bottom: 0, right: 0),
      source: source
    )
  }

  private func homeIndicatorArea(safeArea: UIEdgeInsets) -> [String: Any?] {
    let present = safeArea.bottom > 0

    return Self.systemArea(
      kind: "home-indicator",
      present: present,
      visibility: present ? "unknown" : "unknown",
      height: safeArea.bottom,
      insets: UIEdgeInsets(top: 0, left: 0, bottom: safeArea.bottom, right: 0),
      stableInsets: UIEdgeInsets(top: 0, left: 0, bottom: safeArea.bottom, right: 0),
      source: present ? "measured" : "unavailable"
    )
  }

  private func primaryView() -> ViewportMetricsView? {
    providerViews.allObjects.first
  }

  private func readPhysicalOrientation(stage: String) -> String {
    logNativeTiming(
      marker: "physical-orientation-read-start",
      extra: ["stage": stage]
    )
    let rawOrientation = UIDevice.current.orientation
    let normalizedOrientation = Self.mapPhysicalOrientation(rawOrientation)
    logNativeTiming(
      marker: "physical-orientation-read-end",
      extra: [
        "stage": stage,
        "rawOrientation": Self.describeDeviceOrientation(rawOrientation),
        "normalizedOrientation": normalizedOrientation
      ]
    )
    return normalizedOrientation
  }

  private func readLogicalOrientation(window: UIWindow?, stage: String) -> String {
    logNativeTiming(
      marker: "logical-orientation-read-start",
      extra: ["stage": stage]
    )
    let rawOrientation = window?.windowScene?.interfaceOrientation
    let normalizedOrientation = Self.mapLogicalOrientation(rawOrientation)
    logNativeTiming(
      marker: "logical-orientation-read-end",
      extra: [
        "stage": stage,
        "rawOrientation": Self.describeInterfaceOrientation(rawOrientation),
        "normalizedOrientation": normalizedOrientation
      ]
    )
    return normalizedOrientation
  }

  private func logNativeTiming(marker: String, extra: [String: Any] = [:]) {
    guard nativeTimingEnabled else {
      return
    }

    var event = extra
    event["marker"] = marker
    event["epochMs"] = Date().timeIntervalSince1970 * 1000.0
    event["uptimeMs"] = ProcessInfo.processInfo.systemUptime * 1000.0
    event["runId"] = nativeTimingRunId ?? ""

    guard JSONSerialization.isValidJSONObject(event),
          let data = try? JSONSerialization.data(withJSONObject: event, options: [.sortedKeys]),
          let payload = String(data: data, encoding: .utf8) else {
      NSLog("[viewport-metrics-native] %@", String(describing: event))
      return
    }

    NSLog("[viewport-metrics-native] %@", payload)
  }

  private static func mapPhysicalOrientation(_ orientation: UIDeviceOrientation) -> String {
    switch orientation {
    case .portrait:
      return "portrait-up"
    case .portraitUpsideDown:
      return "portrait-down"
    case .landscapeLeft:
      return "landscape-right"
    case .landscapeRight:
      return "landscape-left"
    default:
      return "unknown"
    }
  }

  private static func mapLogicalOrientation(_ orientation: UIInterfaceOrientation?) -> String {
    switch orientation {
    case .portrait:
      return "portrait-up"
    case .portraitUpsideDown:
      return "portrait-down"
    case .landscapeLeft:
      return "landscape-left"
    case .landscapeRight:
      return "landscape-right"
    default:
      return "unknown"
    }
  }

  private static func systemArea(
    kind: String,
    present: Bool,
    visibility: String,
    height: CGFloat,
    insets: UIEdgeInsets,
    stableInsets: UIEdgeInsets,
    source: String
  ) -> [String: Any?] {
    return [
      "kind": present ? kind : "none",
      "present": present,
      "visibility": visibility,
      "height": Double(height),
      "insets": Self.insets(insets),
      "stableInsets": Self.insets(stableInsets),
      "source": source
    ]
  }

  private static func noneArea() -> [String: Any?] {
    return systemArea(
      kind: "none",
      present: false,
      visibility: "unknown",
      height: 0,
      insets: .zero,
      stableInsets: .zero,
      source: "unavailable"
    )
  }

  private static func size(width: CGFloat, height: CGFloat, scale: CGFloat) -> [String: Double] {
    return [
      "width": Double(width),
      "height": Double(height),
      "scale": Double(scale)
    ]
  }

  private static func rect(_ rect: CGRect) -> [String: Double] {
    return [
      "x": Double(rect.origin.x),
      "y": Double(rect.origin.y),
      "width": Double(rect.size.width),
      "height": Double(rect.size.height)
    ]
  }

  private static func insets(_ insets: UIEdgeInsets) -> [String: Double] {
    return [
      "top": Double(insets.top),
      "right": Double(insets.right),
      "bottom": Double(insets.bottom),
      "left": Double(insets.left)
    ]
  }

  private static func payloadKey(_ snapshot: [String: Any?]) -> String {
    var payload = snapshot
    payload.removeValue(forKey: "revision")
    payload.removeValue(forKey: "timestampMs")

    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
          let string = String(data: data, encoding: .utf8) else {
      return String(describing: payload)
    }

    return string
  }

  private static func activeWindow() -> UIWindow? {
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
  }

  private static func stopDeviceOrientation(
    observer: NSObjectProtocol?,
    shouldEndDeviceOrientation: Bool
  ) {
    if let observer {
      NotificationCenter.default.removeObserver(observer)
    }

    if shouldEndDeviceOrientation {
      UIDevice.current.endGeneratingDeviceOrientationNotifications()
    }
  }

  static func fallbackSnapshot() -> [String: Any?] {
    return [
      "revision": 0,
      "timestampMs": Date().timeIntervalSince1970 * 1000.0,
      "physicalOrientation": "unknown",
      "logicalOrientation": "unknown",
      "window": size(width: 0, height: 0, scale: 1),
      "screen": size(width: 0, height: 0, scale: 1),
      "rootView": rect(.zero),
      "safeAreaInsets": insets(.zero),
      "stableSystemInsets": insets(.zero),
      "systemAreas": [
        "statusBar": noneArea(),
        "navigationBar": noneArea(),
        "homeIndicator": noneArea(),
        "bottomGestureArea": noneArea()
      ]
    ]
  }

  private func runOnMain(_ block: @escaping () -> Void) {
    if Thread.isMainThread {
      block()
    } else {
      DispatchQueue.main.async(execute: block)
    }
  }

  private func syncOnMain<T>(_ block: () -> T) -> T {
    if Thread.isMainThread {
      return block()
    }

    return DispatchQueue.main.sync(execute: block)
  }

  private static func describeDeviceOrientation(_ orientation: UIDeviceOrientation) -> String {
    switch orientation {
    case .portrait:
      return "portrait"
    case .portraitUpsideDown:
      return "portraitUpsideDown"
    case .landscapeLeft:
      return "landscapeLeft"
    case .landscapeRight:
      return "landscapeRight"
    case .faceUp:
      return "faceUp"
    case .faceDown:
      return "faceDown"
    case .unknown:
      fallthrough
    @unknown default:
      return "unknown"
    }
  }

  private static func describeInterfaceOrientation(_ orientation: UIInterfaceOrientation?) -> String {
    switch orientation {
    case .portrait:
      return "portrait"
    case .portraitUpsideDown:
      return "portraitUpsideDown"
    case .landscapeLeft:
      return "landscapeLeft"
    case .landscapeRight:
      return "landscapeRight"
    case .none:
      return "nil"
    @unknown default:
      return "unknown"
    }
  }

  private static func readBooleanLaunchArg(_ name: String) -> Bool {
    guard let rawValue = readStringLaunchArg(name)?.lowercased() else {
      return false
    }

    return rawValue == "1" || rawValue == "true" || rawValue == "yes"
  }

  private static func readStringLaunchArg(_ name: String) -> String? {
    let args = ProcessInfo.processInfo.arguments
    for candidate in ["-\(name)", name] {
      guard let index = args.firstIndex(of: candidate) else {
        continue
      }

      let valueIndex = args.index(after: index)
      guard valueIndex < args.endIndex else {
        continue
      }

      let value = args[valueIndex]
      if value.isEmpty {
        continue
      }

      return value
    }

    return nil
  }
}
