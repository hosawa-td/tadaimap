package expo.modules.tadaimapwifi

import android.content.Context
import android.net.wifi.WifiManager
import expo.modules.interfaces.taskManager.TaskManagerInterface
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * 自宅のWi-Fiにつながっているかどうかで「在宅」を判定するためのネイティブ部品(F24)。
 * - getWifiState: いま接続中のWi-Fiの状態(Wi-Fiがオンか・接続中か・SSID)を返す
 * - startWifiWatchAsync: Wi-Fiへの接続をOSに見張らせ、接続のたびにJSのタスクを起こす。
 *   アプリが閉じられていてもOSが起こしてくれるため、通知欄への常駐表示は不要。
 */
class TadaimapWifiModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val taskManager: TaskManagerInterface by lazy {
    appContext.legacyModule<TaskManagerInterface>()
      ?: throw IllegalStateException("TaskManager is not available")
  }

  override fun definition() = ModuleDefinition {
    Name("TadaimapWifi")

    Function("getWifiState") {
      readWifiState(context)
    }

    AsyncFunction("startWifiWatchAsync") { taskName: String ->
      taskManager.registerTask(taskName, WifiTaskConsumer::class.java, HashMap<String, Any>())
    }

    AsyncFunction("stopWifiWatchAsync") { taskName: String ->
      if (taskManager.taskHasConsumerOfClass(taskName, WifiTaskConsumer::class.java)) {
        taskManager.unregisterTask(taskName, WifiTaskConsumer::class.java)
      }
    }
  }

  companion object {
    fun readWifiState(context: Context): Map<String, Any?> {
      val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      if (!wifiManager.isWifiEnabled) {
        return mapOf("enabled" to false, "connected" to false, "ssid" to null)
      }
      // getConnectionInfoはAndroid 12で非推奨になったが、位置情報の権限があれば引き続きSSIDを返す
      @Suppress("DEPRECATION")
      val info = wifiManager.connectionInfo
      @Suppress("DEPRECATION")
      val connected = info != null && info.networkId != -1
      // 位置情報の権限が無い・位置情報がオフの場合、SSIDは"<unknown ssid>"に伏せられる
      val ssid = info?.ssid
        ?.removeSurrounding("\"")
        ?.takeUnless { it.isEmpty() || it == WifiManager.UNKNOWN_SSID }
      return mapOf("enabled" to true, "connected" to connected, "ssid" to if (connected) ssid else null)
    }
  }
}
