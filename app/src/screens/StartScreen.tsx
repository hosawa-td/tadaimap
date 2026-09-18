import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { colors, radius, spacing, typography } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "Start">;

export default function StartScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.logo}>
          <Text style={styles.logoEmoji}>🏠</Text>
        </View>
        <Text style={styles.title}>タダイマップ</Text>
        <Text style={styles.tagline}>家族の「いま、いるよ」がひと目でわかる</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>位置情報の利用について</Text>
          <Text style={styles.cardBody}>
            ご自宅の周囲（設定した半径）に出入りした時だけ、在宅・不在を自動判定します。詳細な移動履歴や現在地が家族に共有されることはありません。
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate("CreateGroup")}
        >
          <Text style={styles.primaryButtonText}>家族グループを作る</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate("JoinGroup")}
        >
          <Text style={styles.secondaryButtonText}>招待コードを持っている</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, alignItems: "center" },
  logo: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  logoEmoji: { fontSize: 44 },
  title: { ...typography.headlineLg, color: colors.textPrimary, marginBottom: spacing.xs },
  tagline: {
    ...typography.titleMd,
    color: colors.accent,
    marginBottom: spacing.lg,
    textAlign: "center",
  },
  card: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardTitle: { ...typography.titleMd, color: colors.textPrimary, marginBottom: spacing.sm },
  cardBody: { ...typography.bodyMd, color: colors.textSecondary, lineHeight: 22 },
  primaryButton: {
    width: "100%",
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  primaryButtonText: { color: colors.onPrimary, ...typography.labelLg, fontSize: 16 },
  secondaryButton: {
    width: "100%",
    backgroundColor: colors.surfaceSand,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: { color: colors.primary, ...typography.labelLg, fontSize: 16 },
});
