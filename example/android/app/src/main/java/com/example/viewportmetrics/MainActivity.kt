package com.example.viewportmetrics

import android.content.Intent
import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    normalizeDetoxLaunchArgs(intent)
    super.onCreate(null)
  }

  override fun onNewIntent(intent: Intent) {
    normalizeDetoxLaunchArgs(intent)
    super.onNewIntent(intent)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }

  private fun normalizeDetoxLaunchArgs(intent: Intent?) {
    val launchArgs = intent?.getBundleExtra(DETOX_LAUNCH_ARGS_KEY) ?: return

    for (key in launchArgs.keySet()) {
      val value = launchArgs.getString(key) ?: continue
      putNormalizedStringExtra(intent, key, value)
    }
  }

  private fun putNormalizedStringExtra(intent: Intent, key: String, value: String) {
    when {
      value.equals("true", ignoreCase = true) || value.equals("false", ignoreCase = true) -> {
        intent.putExtra(key, value.equals("true", ignoreCase = true))
      }

      value.toIntOrNull() != null -> {
        intent.putExtra(key, value.toInt())
      }

      value.toLongOrNull() != null -> {
        intent.putExtra(key, value.toLong())
      }

      value.contains(".") && value.toDoubleOrNull() != null -> {
        intent.putExtra(key, value.toDouble())
      }

      else -> {
        intent.putExtra(key, value)
      }
    }
  }

  companion object {
    private const val DETOX_LAUNCH_ARGS_KEY = "launchArgs"
  }
}
