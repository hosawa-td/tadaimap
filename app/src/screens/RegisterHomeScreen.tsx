import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Circle, Marker, type LatLng, type MapPressEvent } from "react-native-maps";
import Slider from "@react-native-community/slider";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { useApp } from "../state/AppContext";
import { getCurrentLocation, requestLocationPermissions } from "../location";
import { loadHomeGeofenceConfig } from "../storage";
import {
  BUILDING_RADIUS_DEFAULT,
  BUILDING_RADIUS_MAX,
  BUILDING_RADIUS_MIN,
  RADIUS_DEFAULT,
  RADIUS_MAX,
  RADIUS_MIN,
} from "../validation";
import { colors, radius, spacing, typography } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "RegisterHome">;

// 東京駅付近。現在地が取得できるまでの仮の表示位置。
const FALLBACK_REGION = { lat: 35.681236, lng: 139.767125 };
// 地図の拡大率(約1km四方が見える程度)。ボタンで中心を移すときもこの大きさにそろえる。
const MAP_DELTA = 0.01;

export default function RegisterHomeScreen({ navigation, route }: Props) {
  const fromSettings = route.params?.fromSettings ?? false;
  const { saveHome, homeRadiusM, buildingRadiusM, nearbyGpsEnabled, loading } = useApp();

  const [radiusM, setRadiusM] = useState(fromSettings ? homeRadiusM : RADIUS_DEFAULT);
  const [buildingRadiusMValue, setBuildingRadiusMValue] = useState(
    fromSettings ? buildingRadiusM : BUILDING_RADIUS_DEFAULT
  );
  // 「近くにいる」をGPSで判定するか(F29)。設定画面から開いたときは、いまの設定から始める
  const [nearbyGps, setNearbyGps] = useState(fromSettings ? nearbyGpsEnabled : true);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [statusText, setStatusText] = useState(
    fromSettings
      ? `現在の設定：半径 ${homeRadiusM}m。ピンをドラッグするか地図をタップすると位置を変更できます。`
      : "地図をタップして、自宅の位置を選んでください。"
  );
  const mapRef = useRef<MapView>(null);
  // 画面を開いたあとの最初の位置が決まったときだけ、地図の中心をそこへ移す(その後は、ボタンを押したときだけ動かす)
  const initialCentered = useRef(false);

  const centerMapOn = (lat: number, lng: number) => {
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: MAP_DELTA, longitudeDelta: MAP_DELTA },
      400
    );
  };

  useEffect(() => {
    (async () => {
      try {
        // 設定画面から開いたときは、保存済みの自宅の位置をピンの初期位置にする
        if (fromSettings) {
          const saved = await loadHomeGeofenceConfig();
          if (saved) setCoords({ lat: saved.lat, lng: saved.lng });
        }
        const permission = await requestLocationPermissions();
        if (!permission.foreground) return;
        setLocationGranted(true);
        // 保存済みの位置が無い(初回の登録)ときは、現在地を最初のピンの候補にする
        if (!fromSettings) {
          const location = await getCurrentLocation();
          setCoords((prev) => prev ?? location);
        }
      } catch {
        // 取得できなくても地図はデフォルト位置のまま表示できるため、何もしない
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (coords && !initialCentered.current) {
      initialCentered.current = true;
      centerMapOn(coords.lat, coords.lng);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

  /** 「設定位置」ボタン: ピン(設定した自宅の位置)を地図の中心にする。 */
  const handleCenterOnPin = () => {
    if (!coords) return;
    centerMapOn(coords.lat, coords.lng);
  };

  /** 「現在地」ボタン: 現在地を地図の中心にする(ピンは動かさない。現在地は地図上の青い点で表示する)。 */
  const handleCenterOnCurrentLocation = async () => {
    setStatusText("現在地を取得中…");
    try {
      const permission = await requestLocationPermissions();
      if (!permission.foreground) {
        setStatusText("位置情報の利用が許可されていません。端末の設定から許可してください。");
        return;
      }
      setLocationGranted(true);
      const location = await getCurrentLocation();
      centerMapOn(location.lat, location.lng);
      setStatusText(
        permission.background
          ? "現在地を地図の中心にしました（青い点が現在地です）。"
          : "現在地を地図の中心にしました。ただし「常に許可」が選択されていないため、アプリを閉じている間の自動判定はできません。"
      );
    } catch (err) {
      setStatusText("位置情報を取得できませんでした。端末の位置情報がオンになっているか確認してください。");
    }
  };

  const handleMapPress = (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setCoords({ lat: latitude, lng: longitude });
    setStatusText("地図で選んだ場所にピンを置きました。「この位置で保存する」で確定します。");
  };

  const handleMarkerDragEnd = (coordinate: LatLng) => {
    setCoords({ lat: coordinate.latitude, lng: coordinate.longitude });
    setStatusText("ピンの位置を変更しました。「この位置で保存する」で確定します。");
  };

  const handleRadiusChange = (value: number) => {
    setRadiusM(value);
    // 施設の範囲は自宅の範囲より必ず広くする
    const minBuilding = Math.max(value, BUILDING_RADIUS_MIN);
    setBuildingRadiusMValue((prev) => (prev < minBuilding ? minBuilding : prev));
  };

  const handleSave = async () => {
    if (!coords) {
      Alert.alert("自宅の位置が未設定です", "地図をタップして、自宅の位置を選んでください。");
      return;
    }
    try {
      await saveHome(coords.lat, coords.lng, radiusM, buildingRadiusMValue, nearbyGps);
      if (fromSettings) {
        navigation.goBack();
      } else {
        navigation.reset({ index: 0, routes: [{ name: "Main" }] });
      }
    } catch (err) {
      Alert.alert("エラー", err instanceof Error ? err.message : "保存に失敗しました");
    }
  };

  const buildingMin = Math.max(RADIUS_MIN, BUILDING_RADIUS_MIN, radiusM);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.header}>
          {fromSettings ? "自宅の位置・判定範囲" : "自宅の位置を登録"}
        </Text>
        <Text style={styles.lead}>
          自宅を中心とした円の内側にいるとき、家族アプリ上で自動的に「在宅」と判定されます。
        </Text>

        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={{
              latitude: (coords ?? FALLBACK_REGION).lat,
              longitude: (coords ?? FALLBACK_REGION).lng,
              latitudeDelta: MAP_DELTA,
              longitudeDelta: MAP_DELTA,
            }}
            showsUserLocation={locationGranted}
            showsMyLocationButton={false}
            onPress={handleMapPress}
          >
            {coords && (
              <>
                <Marker
                  coordinate={{ latitude: coords.lat, longitude: coords.lng }}
                  draggable
                  onDragEnd={(e) => handleMarkerDragEnd(e.nativeEvent.coordinate)}
                />
                {nearbyGps && (
                  <Circle
                    center={{ latitude: coords.lat, longitude: coords.lng }}
                    radius={buildingRadiusMValue}
                    strokeColor={colors.nearby}
                    fillColor="rgba(217, 146, 10, 0.08)"
                  />
                )}
                <Circle
                  center={{ latitude: coords.lat, longitude: coords.lng }}
                  radius={radiusM}
                  strokeColor={colors.accent}
                  fillColor="rgba(217, 146, 10, 0.16)"
                />
              </>
            )}
          </MapView>
          <View style={styles.mapButtons} pointerEvents="box-none">
            <TouchableOpacity
              style={[styles.mapButton, !coords && styles.mapButtonDisabled]}
              onPress={handleCenterOnPin}
              disabled={!coords}
              activeOpacity={0.7}
            >
              <Text style={styles.mapButtonText}>設定位置</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mapButton} onPress={handleCenterOnCurrentLocation} activeOpacity={0.7}>
              <Text style={styles.mapButtonText}>現在地</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.statusText}>{statusText}</Text>

        <View style={styles.radiusHeaderRow}>
          <Text style={styles.label}>在宅と判定する半径</Text>
          <Text style={styles.radiusValue}>{radiusM}m</Text>
        </View>
        <Slider
          minimumValue={RADIUS_MIN}
          maximumValue={RADIUS_MAX}
          step={10}
          value={radiusM}
          onValueChange={handleRadiusChange}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.accent}
        />
        <View style={styles.radiusScaleRow}>
          <Text style={styles.scaleText}>50m（狭い）</Text>
          <Text style={styles.scaleText}>300m（広い）</Text>
        </View>

        <Text style={styles.hint}>
          広すぎると近所でも「在宅」扱いになり、狭すぎると建物内のGPS誤差で「不在」に切り替わる場合があります。戸建やマンションでは100m〜150mが最適です。
        </Text>

        <View style={styles.switchRow}>
          <View style={styles.switchTextBlock}>
            <Text style={styles.label}>マンション内など「近くにいる」をGPSで判定する</Text>
            <Text style={styles.switchSub}>
              {nearbyGps
                ? "オン：自宅の範囲の外でも、下の範囲の中にいれば「近くにいる」にします。"
                : "オフ：GPSでは「近くにいる」を使わず、自宅の範囲の内側なら「在宅」、外側なら「外出中」にします。"}
            </Text>
          </View>
          <Switch value={nearbyGps} onValueChange={setNearbyGps} />
        </View>

        {nearbyGps && (
          <>
            <View style={styles.radiusHeaderRow}>
              <Text style={styles.label}>「近くにいる」と判定する範囲</Text>
              <Text style={[styles.radiusValue, { color: colors.nearby }]}>{buildingRadiusMValue}m</Text>
            </View>
            <Slider
              minimumValue={buildingMin}
              maximumValue={BUILDING_RADIUS_MAX}
              step={10}
              value={buildingRadiusMValue}
              onValueChange={setBuildingRadiusMValue}
              minimumTrackTintColor={colors.nearby}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.nearby}
            />
            <View style={styles.radiusScaleRow}>
              <Text style={styles.scaleText}>{buildingMin}m（狭い）</Text>
              <Text style={styles.scaleText}>2000m（広い）</Text>
            </View>

            <Text style={styles.hint}>
              自宅の範囲より外側でも、この範囲の中にいれば「同じ建物内にいる」として家族に知らせます。マンションの別の階や、隣接する建物まで含めたい場合は広めに設定してください。
            </Text>
          </>
        )}
        {!nearbyGps && (
          <Text style={styles.hint}>
            「近くにいる」のGPS判定をオフにすると、自宅の範囲を出た時点で「外出中」になります。別の部屋のWi-Fiを登録している場合は、そのWi-Fiにつながったときの「近くにいる」はそのまま使えます。
          </Text>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.disabledButton]}
          disabled={loading}
          onPress={handleSave}
        >
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>この位置で保存する</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },
  header: { ...typography.headlineMd, color: colors.textPrimary, marginBottom: spacing.xs },
  lead: { ...typography.bodyMd, color: colors.textSecondary, marginBottom: spacing.lg },
  mapWrap: {
    height: 260,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: spacing.sm,
  },
  map: { width: "100%", height: "100%" },
  mapButtons: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    gap: spacing.sm,
  },
  mapButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 3,
  },
  mapButtonDisabled: { opacity: 0.4 },
  mapButtonText: { ...typography.labelLg, color: colors.textPrimary },
  radiusHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.xs,
  },
  label: { ...typography.titleMd, color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
  radiusValue: { ...typography.titleMd, color: colors.accent, flexShrink: 0 },
  radiusScaleRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md },
  scaleText: { ...typography.bodySm, color: colors.textFaint },
  hint: {
    ...typography.bodySm,
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  switchTextBlock: { flex: 1, marginRight: spacing.sm },
  switchSub: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  statusText: {
    ...typography.bodySm,
    color: colors.textFaint,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: "center",
  },
  disabledButton: { opacity: 0.4 },
  primaryButtonText: { color: colors.onPrimary, ...typography.labelLg, fontSize: 16 },
});
