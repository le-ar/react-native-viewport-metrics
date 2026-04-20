package expo.modules.viewportmetrics

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.OrientationEventListener
import android.view.Surface
import android.view.View
import android.view.WindowManager
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsCompat.Type.displayCutout
import androidx.core.view.WindowInsetsCompat.Type.navigationBars
import androidx.core.view.WindowInsetsCompat.Type.statusBars
import androidx.core.view.WindowInsetsCompat.Type.systemBars
import androidx.window.layout.WindowMetricsCalculator
import expo.modules.kotlin.AppContext
import java.lang.ref.WeakReference
import java.util.concurrent.FutureTask
import java.util.WeakHashMap
import kotlin.math.max

object ViewportMetricsAggregatorRegistry {
  private val aggregators = WeakHashMap<AppContext, ViewportMetricsAggregator>()

  @Synchronized
  fun get(appContext: AppContext): ViewportMetricsAggregator {
    return aggregators.getOrPut(appContext) {
      ViewportMetricsAggregator(appContext)
    }
  }
}

class ViewportMetricsAggregator(private val appContext: AppContext) {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val providerViews = LinkedHashSet<WeakReference<ViewportMetricsView>>()
  private var orientationListener: OrientationEventListener? = null
  private var moduleEmitter: ((Map<String, Any>) -> Unit)? = null
  private var jsObserving = false
  private var scheduled = false
  private var scheduleToken = 0
  private var needsOrientationCoalescence = false
  private var revision = 0
  private var lastPayloadKey: String? = null
  private var lastSnapshot: Map<String, Any>? = null
  private var physicalOrientation = "unknown"

  fun setModuleEmitter(emitter: ((Map<String, Any>) -> Unit)?) {
    moduleEmitter = emitter
  }

  fun setJsObserving(observing: Boolean) {
    runOnMain {
      jsObserving = observing
      if (observing) {
        emitSnapshot(currentSnapshotOnMain(), forceModule = true)
      }
    }
  }

  fun start() {
    runOnMain {
      if (orientationListener == null) {
        orientationListener = object : OrientationEventListener(context()) {
          override fun onOrientationChanged(orientation: Int) {
            val nextOrientation = mapPhysicalOrientation(orientation)
            if (nextOrientation != physicalOrientation) {
              physicalOrientation = nextOrientation
              markDirty("physicalOrientation")
            }
          }
        }
      }

      orientationListener?.let {
        if (it.canDetectOrientation()) {
          it.enable()
        }
      }
      markDirty("start")
    }
  }

  fun pauseSensors() {
    runOnMain {
      orientationListener?.disable()
    }
  }

  fun stop() {
    runOnMain {
      orientationListener?.disable()
      orientationListener = null
      providerViews.clear()
      scheduled = false
      scheduleToken += 1
      needsOrientationCoalescence = false
    }
  }

  fun registerProviderView(view: ViewportMetricsView) {
    runOnMain {
      cleanupProviderViews()
      providerViews.add(WeakReference(view))
      markDirty("registerProvider")
    }
  }

  fun unregisterProviderView(view: ViewportMetricsView) {
    runOnMain {
      providerViews.removeAll { it.get() == null || it.get() === view }
      markDirty("unregisterProvider")
    }
  }

  fun markDirty(reason: String) {
    runOnMain {
      if (reason == "physicalOrientation") {
        needsOrientationCoalescence = true
      }

      if (scheduled) {
        return@runOnMain
      }

      scheduled = true
      scheduleToken += 1
      scheduleFlushAfterAnimation(scheduleToken)
    }
  }

  private fun scheduleFlushAfterAnimation(token: Int) {
    val view = primaryView()
    val flush = Runnable {
      finishScheduledFlush(token)
    }

    if (view != null && ViewCompat.isAttachedToWindow(view)) {
      ViewCompat.postOnAnimation(view, flush)
    } else {
      mainHandler.post(flush)
    }
  }

  private fun finishScheduledFlush(token: Int) {
    if (token != scheduleToken) {
      return
    }

    if (needsOrientationCoalescence) {
      needsOrientationCoalescence = false
      mainHandler.postDelayed(
        {
          finishScheduledFlush(token)
        },
        ORIENTATION_COALESCENCE_DELAY_MS
      )
      return
    }

    scheduled = false
    flushIfChanged()
  }

  fun currentSnapshot(): Map<String, Any> {
    return runOnMainSync {
      currentSnapshotOnMain()
    }
  }

  private fun currentSnapshotOnMain(): Map<String, Any> {
    val snapshot = buildSnapshot(revision)
    lastSnapshot = snapshot
    lastPayloadKey = snapshot.payloadKey()
    return snapshot
  }

  private fun flushIfChanged() {
    val candidate = buildSnapshot(revision)
    val payloadKey = candidate.payloadKey()

    if (payloadKey != lastPayloadKey) {
      revision += 1
      val snapshot = buildSnapshot(revision)
      lastPayloadKey = snapshot.payloadKey()
      lastSnapshot = snapshot
      emitSnapshot(snapshot)
    }
  }

  private fun emitSnapshot(snapshot: Map<String, Any>, forceModule: Boolean = false) {
    if (jsObserving || forceModule) {
      moduleEmitter?.invoke(snapshot)
    }
    providerViews.forEach { reference ->
      reference.get()?.emitSnapshot(snapshot)
    }
  }

  private fun buildSnapshot(snapshotRevision: Int): Map<String, Any> {
    val context = context()
    val activity = appContext.currentActivity
    val rootView = primaryView() ?: activity?.window?.decorView?.rootView
    val density = context.resources.displayMetrics.density.takeIf { it > 0f } ?: 1f
    val rootRect = rootRect(rootView, density)
    val windowSize = windowSize(activity, rootView, density)
    val screenSize = screenSize(context, density)
    val insets = rootView?.let { readInsets(it, density) } ?: InsetsSnapshot.empty()
    val statusBar = systemArea(
      kind = "status-bar",
      current = insets.status,
      stable = insets.stableStatus,
      visible = insets.statusVisible,
      source = insets.source
    )
    val navigationBar = systemArea(
      kind = "navigation-bar",
      current = insets.navigation,
      stable = insets.stableNavigation,
      visible = insets.navigationVisible,
      source = insets.source
    )
    val bottomGestureArea = if (insets.stableNavigation.bottom > 0 || insets.navigation.bottom > 0) {
      navigationBar
    } else {
      noneArea()
    }

    return linkedMapOf(
      "revision" to snapshotRevision,
      "timestampMs" to System.currentTimeMillis().toDouble(),
      "physicalOrientation" to physicalOrientation,
      "logicalOrientation" to logicalOrientation(activity, context),
      "window" to windowSize,
      "screen" to screenSize,
      "rootView" to rootRect,
      "safeAreaInsets" to insets.safeArea.toMap(),
      "stableSystemInsets" to insets.stableSystem.toMap(),
      "systemAreas" to linkedMapOf(
        "statusBar" to statusBar,
        "navigationBar" to navigationBar,
        "homeIndicator" to systemArea(
          kind = "home-indicator",
          current = EdgeInsetsSnapshot.empty(),
          stable = EdgeInsetsSnapshot.empty(),
          visible = null,
          source = "unavailable",
          presentOverride = false
        ),
        "bottomGestureArea" to bottomGestureArea
      )
    )
  }

  private fun context(): Context {
    return appContext.reactContext ?: appContext.currentActivity ?: throw IllegalStateException("React context is not available")
  }

  private fun runOnMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      block()
    } else {
      mainHandler.post { block() }
    }
  }

  private fun <T> runOnMainSync(block: () -> T): T {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      return block()
    }

    val task = FutureTask<T> { block() }
    mainHandler.post(task)
    return task.get()
  }

  private fun primaryView(): ViewportMetricsView? {
    cleanupProviderViews()
    return providerViews.firstOrNull()?.get()
  }

  private fun cleanupProviderViews() {
    providerViews.removeAll { it.get() == null }
  }

  private fun rootRect(rootView: View?, density: Float): Map<String, Double> {
    if (rootView == null) {
      return rect(0f, 0f, 0f, 0f)
    }

    val location = IntArray(2)
    rootView.getLocationInWindow(location)
    return rect(
      location[0] / density,
      location[1] / density,
      rootView.width / density,
      rootView.height / density
    )
  }

  private fun windowSize(activity: Activity?, rootView: View?, density: Float): Map<String, Double> {
    if (activity != null) {
      val bounds = WindowMetricsCalculator
        .getOrCreate()
        .computeCurrentWindowMetrics(activity)
        .bounds
      return size(bounds.width() / density, bounds.height() / density, density)
    }

    if (rootView != null) {
      return size(rootView.width / density, rootView.height / density, density)
    }

    val metrics = context().resources.displayMetrics
    return size(metrics.widthPixels / density, metrics.heightPixels / density, density)
  }

  private fun screenSize(context: Context, density: Float): Map<String, Double> {
    val metrics = context.resources.displayMetrics
    return size(metrics.widthPixels / density, metrics.heightPixels / density, density)
  }

  private fun readInsets(rootView: View, density: Float): InsetsSnapshot {
    val rootInsets = rootView.rootWindowInsets
    val compat = if (rootInsets != null) {
      WindowInsetsCompat.toWindowInsetsCompat(rootInsets, rootView)
    } else {
      return InsetsSnapshot.empty()
    }

    val safeTypes = systemBars() or displayCutout()
    val system = compat.getInsets(safeTypes).toEdgeInsets(density)
    val stableSystem = compat.stableInsets(safeTypes, density)
    val status = compat.getInsets(statusBars()).toEdgeInsets(density)
    val stableStatus = compat.stableInsets(statusBars(), density)
    val navigation = compat.getInsets(navigationBars()).toEdgeInsets(density)
    val stableNavigation = compat.stableInsets(navigationBars(), density)

    return InsetsSnapshot(
      safeArea = system,
      stableSystem = stableSystem,
      status = status,
      stableStatus = stableStatus,
      navigation = navigation,
      stableNavigation = stableNavigation,
      statusVisible = compat.isVisible(statusBars()),
      navigationVisible = compat.isVisible(navigationBars()),
      source = "measured"
    )
  }

  private fun WindowInsetsCompat.stableInsets(types: Int, density: Float): EdgeInsetsSnapshot {
    return try {
      getInsetsIgnoringVisibility(types).toEdgeInsets(density)
    } catch (_: IllegalArgumentException) {
      getInsets(types).toEdgeInsets(density)
    }
  }

  private fun systemArea(
    kind: String,
    current: EdgeInsetsSnapshot,
    stable: EdgeInsetsSnapshot,
    visible: Boolean?,
    source: String,
    presentOverride: Boolean? = null
  ): Map<String, Any> {
    val present = presentOverride ?: (current.maxEdge() > 0.0 || stable.maxEdge() > 0.0)
    val visibility = when {
      visible == true -> "visible"
      visible == false && present -> "hidden"
      else -> "unknown"
    }

    return linkedMapOf(
      "kind" to if (present) kind else "none",
      "present" to present,
      "visibility" to visibility,
      "height" to max(current.maxEdge(), stable.maxEdge()),
      "insets" to current.toMap(),
      "stableInsets" to stable.toMap(),
      "source" to if (present || source != "measured") source else "unavailable"
    )
  }

  private fun noneArea(): Map<String, Any> {
    return systemArea(
      kind = "none",
      current = EdgeInsetsSnapshot.empty(),
      stable = EdgeInsetsSnapshot.empty(),
      visible = null,
      source = "unavailable",
      presentOverride = false
    )
  }

  private fun mapPhysicalOrientation(orientation: Int): String {
    if (orientation == ORIENTATION_UNKNOWN) {
      return "unknown"
    }

    return when {
      orientation >= 315 || orientation < 45 -> "portrait-up"
      // Match Android public landscape semantics to the iOS-facing names.
      orientation < 135 -> "landscape-left"
      orientation < 225 -> "portrait-down"
      orientation < 315 -> "landscape-right"
      else -> "unknown"
    }
  }

  private fun logicalOrientation(activity: Activity?, context: Context): String {
    val rotation = displayRotation(activity)
    val configuration = context.resources.configuration.orientation
    val naturalPortrait = when (rotation) {
      Surface.ROTATION_0, Surface.ROTATION_180 -> configuration == Configuration.ORIENTATION_PORTRAIT
      Surface.ROTATION_90, Surface.ROTATION_270 -> configuration == Configuration.ORIENTATION_LANDSCAPE
      else -> true
    }

    return if (naturalPortrait) {
      when (rotation) {
        Surface.ROTATION_0 -> "portrait-up"
        Surface.ROTATION_90 -> "landscape-right"
        Surface.ROTATION_180 -> "portrait-down"
        Surface.ROTATION_270 -> "landscape-left"
        else -> "unknown"
      }
    } else {
      when (rotation) {
        Surface.ROTATION_0 -> "landscape-right"
        Surface.ROTATION_90 -> "portrait-down"
        Surface.ROTATION_180 -> "landscape-left"
        Surface.ROTATION_270 -> "portrait-up"
        else -> "unknown"
      }
    }
  }

  @Suppress("DEPRECATION")
  private fun displayRotation(activity: Activity?): Int {
    if (activity == null) {
      return Surface.ROTATION_0
    }

    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      activity.display?.rotation ?: Surface.ROTATION_0
    } else {
      val windowManager = activity.getSystemService(Context.WINDOW_SERVICE) as WindowManager
      windowManager.defaultDisplay.rotation
    }
  }

  private fun Map<String, Any>.payloadKey(): String {
    return stableEncode(filterKeys { it != "revision" && it != "timestampMs" })
  }

  private fun stableEncode(value: Any?): String {
    return when (value) {
      null -> "null"
      is Map<*, *> -> value.entries
        .filter { it.key != null }
        .sortedBy { it.key.toString() }
        .joinToString(prefix = "{", postfix = "}") { entry ->
          "${quoteString(entry.key.toString())}:${stableEncode(entry.value)}"
        }
      is Iterable<*> -> value.joinToString(prefix = "[", postfix = "]") {
        stableEncode(it)
      }
      is Array<*> -> value.joinToString(prefix = "[", postfix = "]") {
        stableEncode(it)
      }
      is String -> quoteString(value)
      is Number -> value.toString()
      is Boolean -> value.toString()
      else -> quoteString(value.toString())
    }
  }

  private fun quoteString(value: String): String {
    val builder = StringBuilder(value.length + 2)
    builder.append('"')
    value.forEach { char ->
      when (char) {
        '\\' -> builder.append("\\\\")
        '"' -> builder.append("\\\"")
        '\n' -> builder.append("\\n")
        '\r' -> builder.append("\\r")
        '\t' -> builder.append("\\t")
        else -> {
          if (char < ' ') {
            builder.append("\\u")
            builder.append(char.code.toString(16).padStart(4, '0'))
          } else {
            builder.append(char)
          }
        }
      }
    }
    builder.append('"')
    return builder.toString()
  }

  private fun size(width: Float, height: Float, scale: Float): Map<String, Double> {
    return linkedMapOf(
      "width" to width.toDouble(),
      "height" to height.toDouble(),
      "scale" to scale.toDouble()
    )
  }

  private fun rect(x: Float, y: Float, width: Float, height: Float): Map<String, Double> {
    return linkedMapOf(
      "x" to x.toDouble(),
      "y" to y.toDouble(),
      "width" to width.toDouble(),
      "height" to height.toDouble()
    )
  }

  private fun androidx.core.graphics.Insets.toEdgeInsets(density: Float): EdgeInsetsSnapshot {
    return EdgeInsetsSnapshot(
      top = top / density,
      right = right / density,
      bottom = bottom / density,
      left = left / density
    )
  }

  private data class EdgeInsetsSnapshot(
    val top: Float,
    val right: Float,
    val bottom: Float,
    val left: Float
  ) {
    fun toMap(): Map<String, Double> = linkedMapOf(
      "top" to top.toDouble(),
      "right" to right.toDouble(),
      "bottom" to bottom.toDouble(),
      "left" to left.toDouble()
    )

    fun maxEdge(): Double = max(max(top, right), max(bottom, left)).toDouble()

    companion object {
      fun empty() = EdgeInsetsSnapshot(0f, 0f, 0f, 0f)
    }
  }

  private data class InsetsSnapshot(
    val safeArea: EdgeInsetsSnapshot,
    val stableSystem: EdgeInsetsSnapshot,
    val status: EdgeInsetsSnapshot,
    val stableStatus: EdgeInsetsSnapshot,
    val navigation: EdgeInsetsSnapshot,
    val stableNavigation: EdgeInsetsSnapshot,
    val statusVisible: Boolean?,
    val navigationVisible: Boolean?,
    val source: String
  ) {
    companion object {
      fun empty() = InsetsSnapshot(
        safeArea = EdgeInsetsSnapshot.empty(),
        stableSystem = EdgeInsetsSnapshot.empty(),
        status = EdgeInsetsSnapshot.empty(),
        stableStatus = EdgeInsetsSnapshot.empty(),
        navigation = EdgeInsetsSnapshot.empty(),
        stableNavigation = EdgeInsetsSnapshot.empty(),
        statusVisible = null,
        navigationVisible = null,
        source = "unavailable"
      )
    }
  }

  companion object {
    private const val ORIENTATION_COALESCENCE_DELAY_MS = 80L
    private val ORIENTATION_UNKNOWN = OrientationEventListener.ORIENTATION_UNKNOWN
  }
}
