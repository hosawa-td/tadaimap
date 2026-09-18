import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useApp } from "../state/AppContext";
import { formatStatusLine, summaryText } from "../presence";
import { MemberView } from "../api";
import { colors, radius, spacing, typography } from "../theme/tokens";

export default function HomeScreen() {
  const { members, inviteCode, refreshMembers, setStatus } = useApp();
  const [refreshing, setRefreshing] = useState(false);

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

  const handleArrivedNow = async () => {
    try {
      await setStatus("home", "manual");
    } catch (err) {
      Alert.alert("エラー", err instanceof Error ? err.message : "通知の送信に失敗しました");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>わが家</Text>
        <Text style={styles.headerSub}>招待コード: {inviteCode ?? "------"}</Text>
        <Text style={styles.summary}>{summaryText(members)}</Text>
      </View>

      <TouchableOpacity style={styles.arrivedButton} onPress={handleArrivedNow}>
        <Text style={styles.arrivedButtonText}>「ただいま！」を送る</Text>
      </TouchableOpacity>

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
      <View style={[styles.statusPill, member.status === "home" ? styles.homePill : styles.awayPill]}>
        <Text style={member.status === "home" ? styles.homePillText : styles.awayPillText}>
          {member.status === "home" ? "在宅" : "外出中"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  headerTitle: { ...typography.headlineSm, color: colors.textPrimary },
  headerSub: { ...typography.bodySm, color: colors.textFaint, marginTop: 2 },
  summary: { ...typography.titleMd, color: colors.home, marginTop: spacing.xs },
  arrivedButton: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: spacing.md,
  },
  arrivedButtonText: { color: colors.onAccent, ...typography.labelLg, fontSize: 15 },
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
  homePill: { backgroundColor: colors.homeSoft },
  awayPill: { backgroundColor: colors.awaySoft },
  homePillText: { color: colors.home, ...typography.labelLg, fontSize: 12 },
  awayPillText: { color: colors.away, ...typography.labelLg, fontSize: 12 },
});
