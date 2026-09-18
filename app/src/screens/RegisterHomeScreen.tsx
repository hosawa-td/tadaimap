import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
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
import { RADIUS_DEFAULT, RADIUS_MAX, RADIUS_MIN } from "../validation";
import { colors, radius, spacing, typography } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "RegisterHome">;

// 東京駅付近。現在地が取得できるまでの仮の表示位置。
const FALLBACK_REGION = { lat: 35.681236, lng: 139.767125 };

export default function RegisterHomeScreen({ navigation, route }: Props) {
  const fromSettings = route.params?.fromSettings ?? false;
  const { saveHome, homeRadiusM, loading } = useApp();

  const [radiusM, setRadiusM] = useState(fromSettings ? homeRadiusM : RADIUS_DEFAULT);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [statusText, setStatusText] = useState(
    fromSettings
      ? `現在の設定：半径 ${homeRadiusM}m。ピンをドラッグするか地図をタップすると位置を変更できます。`
      : "地図をタップするか「現在地を自宅として設定」を押して、自宅の位置を選んでください。"
  );

  useEffect(() => {
    // 現在地を取得できる場合は、最初から地図の中心とピンの候補にしておく
    // (自宅設定の変更時は保存済みの座標を持っていないため、現在地を初期値として使う)
    (async () => {
      try {
        const permission = await requestLocationPermissions();
        if (!permission.foreground) return;
        const location = await getCurrentLocation();
        setCoords((prev) => prev ?? location);
      } catch {
        // 取得できなくても地図はデフォルト位置のまま表示できるため、何もしない
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUseCurrentLocation = async () => {
    setStatusText("位置情報を取得中…");
    try {
      const permission = await requestLocationPermissions();
      if (!permission.foreground) {
        setStatusText("位置情報の利用が許可されていません。端末の設定から許可してください。");
        return;
      }
      const location = await getCurrentLocation();
      setCoords(location);
      if (!permission.background) {
        setStatusText(
          "現在地を取得しました。ただし「常に許可」が選択されていないため、アプリを閉じている間の自動判定はできません。"
        );
      } else {
        setStatusText("現在地を自宅として設定しました。ピンの位置は地図上でも調整できます。");
      }
    } catch (err) {
      setStatusText("位置情報を取得できませんでした。地図をタップして位置を選ぶこともできます。");
    }
  };

  const handleMapPress = (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setCoords({ lat: latitude, lng: longitude });
    setStatusText("地図で選んだ場所を自宅として設定しました。");
  };

  const handleMarkerDragEnd = (coordinate: LatLng) => {
    setCoords({ lat: coordinate.latitude, lng: coordinate.longitude });
    setStatusText("ピンの位置を自宅として設定しました。");
  };

  const handleSave = async () => {
    if (!coords) {
      Alert.alert("自宅の位置が未設定です", "地図をタップするか「現在地を自宅として設定」を押して、位置を選んでください。");
      return;
    }
    try {
      await saveHome(coords.lat, coords.lng, radiusM);
      if (fromSettings) {
        navigation.goBack();
      } else {
        navigation.reset({ index: 0, routes: [{ name: "Main" }] });
      }
    } catch (err) {
      Alert.alert("エラー", err instanceof Error ? err.message : "保存に失敗しました");
    }
  };

  const mapCenter = coords ?? FALLBACK_REGION;

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
            style={styles.map}
            region={{
              latitude: mapCenter.lat,
              longitude: mapCenter.lng,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            onPress={handleMapPress}
          >
            {coords && (
              <>
                <Marker
                  coordinate={{ latitude: coords.lat, longitude: coords.lng }}
                  draggable
                  onDragEnd={(e) => handleMarkerDragEnd(e.nativeEvent.coordinate)}
                />
                <Circle
                  center={{ latitude: coords.lat, longitude: coords.lng }}
                  radius={radiusM}
                  strokeColor={colors.accent}
                  fillColor="rgba(217, 146, 10, 0.16)"
                />
              </>
            )}
          </MapView>
        </View>

        <View style={styles.radiusHeaderRow}>
          <Text style={styles.label}>在宅と判定する半径</Text>
          <Text style={styles.radiusValue}>{radiusM}m</Text>
        </View>
        <Slider
          minimumValue={RADIUS_MIN}
          maximumValue={RADIUS_MAX}
          step={10}
          value={radiusM}
          onValueChange={setRadiusM}
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

        <TouchableOpacity style={styles.outlineButton} onPress={handleUseCurrentLocation}>
          <Text style={styles.outlineButtonText}>現在地を自宅として設定</Text>
        </TouchableOpacity>
        <Text style={styles.statusText}>{statusText}</Text>

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
    height: 220,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: spacing.lg,
  },
  map: { width: "100%", height: "100%" },
  radiusHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xs },
  label: { ...typography.titleMd, color: colors.textPrimary },
  radiusValue: { ...typography.titleMd, color: colors.accent },
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
  outlineButton: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  outlineButtonText: { color: colors.textPrimary, ...typography.labelLg },
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
