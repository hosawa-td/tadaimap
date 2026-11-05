package expo.modules.tadaimapwifi

import android.app.PendingIntent
import android.app.job.JobParameters
import android.app.job.JobService
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Bundle
import android.os.PersistableBundle
import android.util.Log
import expo.modules.interfaces.taskManager.TaskConsumer
import expo.modules.interfaces.taskManager.TaskConsumerInterface
import expo.modules.interfaces.taskManager.TaskInterface
import expo.modules.interfaces.taskManager.TaskManagerUtilsInterface

/**
 * Wi-Fiへの接続をOS(ConnectivityManager)に見張ってもらい、接続のたびにJSのタスクを実行する。
 * expo-locationのGeofencingTaskConsumerと同じ仕組み(expo-task-manager経由)で動くため、
 * アプリが閉じられていても起こされ、端末の再起動後もexpo-task-managerが登録を復元する。
 *
 * PendingIntent方式のネットワーク監視は「接続した」ときにしか通知されない(切断は通知されない)。
 * 切断側はJS側の定期確認(expo-background-task)で補う。
 */
class WifiTaskConsumer(context: Context, taskManagerUtils: TaskManagerUtilsInterface?) :
  TaskConsumer(context, taskManagerUtils), TaskConsumerInterface {
  private var mTask: TaskInterface? = null
  private var mPendingIntent: PendingIntent? = null

  override fun taskType(): String {
    return "tadaimapWifi"
  }

  override fun didRegister(task: TaskInterface) {
    mTask = task
    startWatching()
  }

  override fun didUnregister() {
    stopWatching()
    mTask = null
  }

  override fun didReceiveBroadcast(intent: Intent) {
    val task = mTask ?: return
    val data = PersistableBundle().apply { putString("event", EVENT_WIFI_CONNECTED) }
    taskManagerUtils.scheduleJob(context.applicationContext, task, listOf(data))
  }

  override fun didExecuteJob(jobService: JobService, params: JobParameters): Boolean {
    val task = mTask ?: return false
    val bundle = Bundle().apply { putString("event", EVENT_WIFI_CONNECTED) }
    task.execute(bundle, null) { jobService.jobFinished(params, false) }
    // 非同期で実行中のため、終了時に jobFinished を呼ぶ
    return true
  }

  private fun startWatching() {
    val context = context ?: return
    val task = mTask ?: return
    val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val request = NetworkRequest.Builder()
      .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
      .build()
    // 同じPendingIntentで登録し直した場合、OS側では前の登録が置き換えられる(重複しない)
    val pendingIntent = taskManagerUtils.createTaskIntent(context, task)
    try {
      connectivityManager.registerNetworkCallback(request, pendingIntent)
      mPendingIntent = pendingIntent
    } catch (e: RuntimeException) {
      Log.w(TAG, "Wi-Fiの見張りを登録できませんでした", e)
    }
  }

  private fun stopWatching() {
    val pendingIntent = mPendingIntent ?: return
    val context = context
    if (context != null) {
      val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      try {
        connectivityManager.unregisterNetworkCallback(pendingIntent)
      } catch (e: RuntimeException) {
        Log.w(TAG, "Wi-Fiの見張りを解除できませんでした", e)
      }
    }
    pendingIntent.cancel()
    mPendingIntent = null
  }

  companion object {
    private const val TAG = "WifiTaskConsumer"
    const val EVENT_WIFI_CONNECTED = "wifiConnected"
  }
}
