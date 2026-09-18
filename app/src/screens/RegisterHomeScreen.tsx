import React, { useState } from "react";
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
import Slider from "@react-native-community/slider";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { useApp } from "../state/AppContext";
import { getCurrentLocation, requestLocationPermissions } from "../location";
import { RADIUS_DEFAULT, RADIUS_MAX, RADIUS_MIN } from "../validation";
import { colors, radius, spacing, typography } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "RegisterHome">;

export default function RegisterHomeScreen({ navigation, route }: Props) {
  const fromSettings = route.params?.fromSettings ?? false;
  const { saveHome, homeRadiusM, loading } = useApp();

  const [radiusM, setRadiusM] = useState(fromSettings ? homeRadiusM : RADIUS_DEFAULT);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [statusText, setStatusText] = useState("まだ位置情報は取得していません。");

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
        setStatusText(
          `現在地（緯度 ${location.lat.toFixed(4)} / 経度 ${location.lng.toFixed(4)} 付近）を自宅として設定しました。`
        );
      }
    } catch (err) {
      setStatusText("位置情報を取得できませんでした。あとで設定からやり直せます。");
    }
  };

  const handleSave = async () => {
    if (!coords) {
      Alert.alert("自宅の位置が未設定です", "「現在地を自宅として設定」を押して、位置を取得してください。");
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

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.header}>
          {fromSettings ? "自宅の位置・判定範囲" : "自宅の位置を登録"}
        </Text>
        <Text style={styles.lead}>
          自宅を中心とした円の内側にいるとき、家族アプリ上で自動的に「在宅」と判定されます。
        </Text>

        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapPin}>📍</Text>
          <Text style={styles.mapCircleLabel}>判定範囲：半径 {radiusM}m</Text>
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
  mapPlaceholder: {
    height: 180,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  mapPin: { fontSize: 32, marginBottom: spacing.xs },
  mapCircleLabel: { ...typography.bodySm, color: colors.textSecondary },
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
