import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { useApp } from "../state/AppContext";
import { isValidInviteCode, isValidName } from "../validation";
import { ApiError } from "../api";
import { colors, radius, spacing, typography } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "JoinGroup">;

const NAME_SUGGESTIONS = ["お母さん", "お父さん", "ゆうた"];

const ERROR_MESSAGES: Record<string, string> = {
  CODE_NOT_FOUND: "招待コードが見つかりません。もう一度確認してください。",
  CODE_EXPIRED: "招待コードの有効期限が切れています。発行した方に再発行を依頼してください。",
  ALREADY_JOINED: "この端末は既に別のグループに参加しています。",
};

export default function JoinGroupScreen({ navigation }: Props) {
  const { joinGroup, loading } = useApp();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const canSubmit = isValidInviteCode(code) && isValidName(name) && !loading;

  const handleJoin = async () => {
    try {
      await joinGroup(code, name);
      navigation.navigate("RegisterHome", { fromSettings: false });
    } catch (err) {
      const message =
        err instanceof ApiError ? ERROR_MESSAGES[err.code] ?? err.message : "参加に失敗しました";
      Alert.alert("参加できませんでした", message);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.header}>招待コードで参加</Text>
        <Text style={styles.lead}>
          家族から共有された6桁の招待コードと、あなたの名前を入力してください。
        </Text>

        <Text style={styles.label}>招待コード（6桁）</Text>
        <TextInput
          style={styles.input}
          placeholder="例：842915"
          placeholderTextColor={colors.textFaint}
          value={code}
          onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
        />

        <Text style={styles.label}>あなたの名前</Text>
        <TextInput
          style={styles.input}
          placeholder="例：お母さん、ゆき"
          placeholderTextColor={colors.textFaint}
          value={name}
          onChangeText={setName}
          maxLength={12}
        />
        <View style={styles.chipRow}>
          {NAME_SUGGESTIONS.map((s) => (
            <TouchableOpacity key={s} style={styles.chip} onPress={() => setName(s)}>
              <Text style={styles.chipText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, !canSubmit && styles.disabledButton]}
          disabled={!canSubmit}
          onPress={handleJoin}
        >
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>グループに参加する</Text>
          )}
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>コードが見つかりませんか？</Text>
          <Text style={styles.cardBody}>
            招待コードがわからない場合は、すでにグループを作成した家族にアプリの設定画面または作成画面を確認してもらってください。
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },
  header: { ...typography.headlineMd, color: colors.textPrimary, marginBottom: spacing.xs },
  lead: { ...typography.bodyMd, color: colors.textSecondary, marginBottom: spacing.lg },
  label: { ...typography.titleMd, color: colors.textPrimary, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.xl },
  chip: {
    backgroundColor: colors.surfaceSand,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: { color: colors.primary, ...typography.bodySm },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  disabledButton: { opacity: 0.4 },
  primaryButtonText: { color: colors.onPrimary, ...typography.labelLg, fontSize: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  cardTitle: { ...typography.titleMd, color: colors.textPrimary, marginBottom: spacing.xs },
  cardBody: { ...typography.bodySm, color: colors.textSecondary, lineHeight: 20 },
});
