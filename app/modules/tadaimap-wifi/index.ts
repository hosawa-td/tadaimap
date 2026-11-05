import { requireOptionalNativeModule } from "expo";

export interface NativeWifiState {
  /** 端末のWi-Fi機能がオンかどうか。 */
  enabled: boolean;
  /** いずれかのWi-Fiに接続中かどうか。 */
  connected: boolean;
  /** 接続中のWi-Fi名。未接続、または権限不足で読み取れない場合はnull。 */
  ssid: string | null;
}

interface TadaimapWifiNativeModule {
  getWifiState(): NativeWifiState;
  startWifiWatchAsync(taskName: string): Promise<void>;
  stopWifiWatchAsync(taskName: string): Promise<void>;
}

/** Android以外(iOS・Web)では存在しないため、呼び出し側はnullを考慮すること。 */
export default requireOptionalNativeModule<TadaimapWifiNativeModule>("TadaimapWifi");
