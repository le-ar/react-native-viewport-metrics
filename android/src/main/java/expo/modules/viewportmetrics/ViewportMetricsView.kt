package expo.modules.viewportmetrics

import android.content.Context
import android.view.View
import androidx.core.view.ViewCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class ViewportMetricsView(
  context: Context,
  appContext: AppContext
) : ExpoView(context, appContext) {
  private val onSnapshot by EventDispatcher()
  private val aggregator = ViewportMetricsAggregatorRegistry.get(appContext)

  private val layoutListener = OnLayoutChangeListener { _: View, _: Int, _: Int, _: Int, _: Int, _: Int, _: Int, _: Int, _: Int ->
    aggregator.markDirty("providerLayout")
  }

  init {
    ViewCompat.setOnApplyWindowInsetsListener(this) { _, insets ->
      aggregator.markDirty("providerInsets")
      insets
    }
    addOnLayoutChangeListener(layoutListener)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    aggregator.registerProviderView(this)
    ViewCompat.requestApplyInsets(this)
    aggregator.markDirty("providerAttached")
  }

  override fun onDetachedFromWindow() {
    aggregator.unregisterProviderView(this)
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
    super.onSizeChanged(width, height, oldWidth, oldHeight)
    aggregator.markDirty("providerSize")
  }

  fun emitSnapshot(snapshot: Map<String, Any>) {
    onSnapshot(snapshot)
  }
}
