import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useApp } from "../state/AppContext";
import { formatStatusLine, statusLabel, summaryText } from "../presence";
import { MemberView, PresenceStatus } from "../api";
import { colors, radius, spacing, typography } from "../theme/tokens";

export default function HomeScreen() {
  const { members, inviteCode, refreshMembers, setStatus, nearbyLabel } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      await refreshMembers();
    } catch {
      // 一覧取得の失敗は画面上部のエラー表示に頼らず、静かに次回更新を待つ
    }
  }, [refreshMembers]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 30000);
      return () => clearInterval(timer);
    }, [load])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const myStatus = members.find((m) => m.isMe)?.status;

  const handleSetStatus = async (status: PresenceStatus) => {
    if (status === myStatus || sending) return;
    setSending(true);
    try {
      await setStatus(status, "manual");
    } catch (err) {
      Alert.alert("エラー", err instanceof Error ? err.message : "通知の送信に失敗しました");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>わが家</Text>
        <Text style={styles.headerSub}>招待コード: {inviteCode ?? "------"}</Text>
        <Text style={styles.summary}>{summaryText(members)}</Text>
      </View>

      <View style={styles.statusSwitchRow}>
        <StatusSwitchButton
          label="在宅"
          active={myStatus === "home"}
          color={colors.home}
          softColor={colors.homeSoft}
          disabled={sending}
          onPress={() => handleSetStatus("home")}
        />
        <StatusSwitchButton
          label={nearbyLabel}
          active={myStatus === "nearby"}
          color={colors.nearby}
          softColor={colors.nearbySoft}
          disabled={sending}
          onPress={() => handleSetStatus("nearby")}
        />
        <StatusSwitchButton
          label="外出中"
          active={myStatus === "away"}
          color={colors.away}
          softColor={colors.awaySoft}
          disabled={sending}
          onPress={() => handleSetStatus("away")}
        />
      </View>
      {sending && <ActivityIndicator style={styles.statusSwitchLoading} color={colors.accent} />}

      <FlatList
        data={members}
        keyExtractor={(m) => m.memberId}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        renderItem={({ item }) => <MemberRow member={item} />}
        ListEmptyComponent={<Text style={styles.empty}>メンバー情報を読み込んでいます…</Text>}
      />
    </SafeAreaView>
  );
}

const STATUS_COLOR: Record<PresenceStatus, string> = {
  home: colors.home,
  nearby: colors.nearby,
  away: colors.away,
};
const STATUS_SOFT_COLOR: Record<PresenceStatus, string> = {
  home: colors.homeSoft,
  nearby: colors.nearbySoft,
  away: colors.awaySoft,
};

function MemberRow({ member }: { member: MemberView }) {
  return (
    <View style={styles.memberCard}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{member.nameOrAnonymous.slice(0, 1)}</Text>
      </View>
      <View style={styles.memberInfo}>
        <View style={styles.memberNameRow}>
          <Text style={styles.memberName}>{member.nameOrAnonymous}</Text>
          {member.isMe && (
            <View style={styles.meTag}>
              <Text style={styles.meTagText}>あなた</Text>
            </View>
          )}
        </View>
        <Text style={styles.memberTime}>{formatStatusLine(member)}</Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: STATUS_SOFT_COLOR[member.status] }]}>
        <Text style={[styles.statusPillText, { color: STATUS_COLOR[member.status] }]}>
          {statusLabel(member)}
        </Text>
      </View>
    </View>
  );
}

function StatusSwitchButton({
  label,
  active,
  color,
  softColor,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  color: string;
  softColor: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.statusSwitchButton,
        { backgroundColor: active ? softColor : colors.surface, borderColor: active ? color : colors.border },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.statusSwitchButtonText, { color: active ? color : colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  headerTitle: { ...typography.headlineSm, color: colors.textPrimary },
  headerSub: { ...typography.bodySm, color: colors.textFaint, marginTop: 2 },
  summary: { ...typography.titleMd, color: colors.home, marginTop: spacing.xs },
  statusSwitchRow: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  statusSwitchButton: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: "center",
  },
  statusSwitchButtonText: { ...typography.labelLg, fontSize: 13 },
  statusSwitchLoading: { marginBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  empty: { ...typography.bodyMd, color: colors.textFaint, textAlign: "center", marginTop: spacing.xl },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceSand,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...typography.titleMd, color: colors.primary },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  memberName: { ...typography.titleMd, color: colors.textPrimary },
  meTag: {
    backgroundColor: colors.surfaceSand,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  meTagText: { ...typography.bodySm, color: colors.textSecondary, fontSize: 10 },
  memberTime: { ...typography.bodySm, color: colors.textFaint, marginTop: 2 },
  statusPill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  statusPillText: { ...typography.labelLg, fontSize: 12 },
});
