import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { useApp } from "../state/AppContext";
import { isValidName } from "../validation";
import { colors, radius, spacing, typography } from "../theme/tokens";

type Props = NativeStackScreenProps<RootStackParamList, "CreateGroup">;

const NAME_SUGGESTIONS = ["お父さん", "お母さん", "じいじ", "ばあば"];

export default function CreateGroupScreen({ navigation }: Props) {
  const { createGroup, loading } = useApp();
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canSubmit = isValidName(name) && !loading;

  const handleCreate = async () => {
    try {
      const result = await createGroup(name);
      setInviteCode(result.inviteCode);
    } catch (err) {
      Alert.alert("エラー", err instanceof Error ? err.message : "グループの作成に失敗しました");
    }
  };

  const handleCopy = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    setCopied(true);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.header}>グループを作る</Text>
        <Text style={styles.lead}>招待コードを伝えるだけで、家族とつながることができます。</Text>

        {!inviteCode ? (
          <>
            <Text style={styles.label}>あなたの名前</Text>
            <TextInput
              style={styles.input}
              placeholder="例：お父さん、たかし"
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
              onPress={handleCreate}
            >
              {loading ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.primaryButtonText}>招待コードを発行する</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>この家族の招待コード</Text>
            <View style={styles.codeRow}>
              <View style={styles.codeChip}>
                <Text style={styles.codeText}>{inviteCode}</Text>
              </View>
              <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
                <Text style={styles.copyButtonText}>{copied ? "コピー済み" : "コピー"}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>
              あとで家族にこのコードを伝えると、同じグループに参加できます（有効期限：発行から7日間）。
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.navigate("RegisterHome", { fromSettings: false })}
            >
              <Text style={styles.primaryButtonText}>次へ進む（自宅の設定へ）</Text>
            </TouchableOpacity>
          </>
        )}
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
    marginBottom: spacing.sm,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.xl },
  chip: {
    backgroundColor: colors.surfaceSand,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: { color: colors.primary, ...typography.bodySm },
  codeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  codeChip: {
    flex: 1,
    backgroundColor: colors.surfaceSand,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  codeText: { ...typography.headlineSm, color: colors.primary, letterSpacing: 4 },
  copyButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  copyButtonText: { color: colors.textPrimary, ...typography.labelLg },
  hint: { ...typography.bodySm, color: colors.textFaint, marginBottom: spacing.xl },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: "center",
  },
  disabledButton: { opacity: 0.4 },
  primaryButtonText: { color: colors.onPrimary, ...typography.labelLg, fontSize: 16 },
});
