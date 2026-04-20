package com.example.viewportmetrics

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class ExampleSystemUiModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var lockedHidden = false
  private val lockedHiddenRunnable = object : Runnable {
    override fun run() {
      if (!lockedHidden) {
        return
      }

      val activity = reactApplicationContext.currentActivity
      if (activity != null) {
        val window = activity.window
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
      }

      mainHandler.postDelayed(this, LOCKED_HIDDEN_REHIDE_MS)
    }
  }

  override fun getName(): String = "ExampleSystemUi"

  @ReactMethod
  fun getLaunchFlags(promise: Promise) {
    val intent = reactApplicationContext.currentActivity?.intent
    val flags = Arguments.createMap()
    flags.putBoolean(
      "hideSystemBarsOnMount",
      intent?.getBooleanExtra("hideSystemBarsOnMount", false) ?: false
    )
    flags.putString(
      "systemBarsModeOnMount",
      intent?.getStringExtra("systemBarsModeOnMount") ?: "visible"
    )
    flags.putInt(
      "blockJsOnMountMs",
      intent?.getIntExtra("blockJsOnMountMs", 0) ?: 0
    )
    flags.putInt(
      "blockJsOnMountDelayMs",
      intent?.getIntExtra("blockJsOnMountDelayMs", 1000) ?: 1000
    )
    promise.resolve(flags)
  }

  @ReactMethod
  fun setSystemBarsHidden(hidden: Boolean, promise: Promise) {
    setSystemBarsMode(if (hidden) MODE_HIDDEN_TRANSIENT else MODE_VISIBLE, promise)
  }

  @ReactMethod
  fun setSystemBarsMode(mode: String, promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "Current activity is not available")
      return
    }

    activity.runOnUiThread {
      try {
        applySystemBarsMode(mode)
        promise.resolve(null)
      } catch (error: Throwable) {
        promise.reject("E_SYSTEM_BARS", error)
      }
    }
  }

  @ReactMethod
  fun requestShowSystemBars(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "Current activity is not available")
      return
    }

    activity.runOnUiThread {
      try {
        val window = activity.window
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.show(WindowInsetsCompat.Type.systemBars())
        promise.resolve(null)
      } catch (error: Throwable) {
        promise.reject("E_SYSTEM_BARS", error)
      }
    }
  }

  private fun applySystemBarsMode(mode: String) {
    val activity = reactApplicationContext.currentActivity
      ?: throw IllegalStateException("Current activity is not available")
    val window = activity.window
    val controller = WindowInsetsControllerCompat(window, window.decorView)

    when (mode) {
      MODE_VISIBLE -> {
        stopLockedHiddenLoop()
        WindowCompat.setDecorFitsSystemWindows(window, true)
        controller.show(WindowInsetsCompat.Type.systemBars())
      }

      MODE_HIDDEN_DEFAULT -> {
        stopLockedHiddenLoop()
        WindowCompat.setDecorFitsSystemWindows(window, false)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_DEFAULT
        controller.hide(WindowInsetsCompat.Type.systemBars())
      }

      MODE_HIDDEN_TRANSIENT -> {
        stopLockedHiddenLoop()
        WindowCompat.setDecorFitsSystemWindows(window, false)
        controller.systemBarsBehavior =
          WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
      }

      MODE_LOCKED_HIDDEN -> {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        controller.systemBarsBehavior =
          WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
        startLockedHiddenLoop()
      }

      else -> throw IllegalArgumentException("Unknown system bars mode: $mode")
    }
  }

  private fun startLockedHiddenLoop() {
    lockedHidden = true
    mainHandler.removeCallbacks(lockedHiddenRunnable)
    mainHandler.postDelayed(lockedHiddenRunnable, LOCKED_HIDDEN_REHIDE_MS)
  }

  private fun stopLockedHiddenLoop() {
    lockedHidden = false
    mainHandler.removeCallbacks(lockedHiddenRunnable)
  }

  companion object {
    private const val MODE_VISIBLE = "visible"
    private const val MODE_HIDDEN_DEFAULT = "hidden-default"
    private const val MODE_HIDDEN_TRANSIENT = "hidden-transient"
    private const val MODE_LOCKED_HIDDEN = "locked-hidden"
    private const val LOCKED_HIDDEN_REHIDE_MS = 250L
  }
}
