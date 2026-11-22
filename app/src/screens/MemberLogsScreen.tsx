import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteProp, useFocusEffect, useRoute } from "@react-navigation/native";
import { useApp } from "../state/AppContext";
import { DescribedLog, groupLogsByDay, MemberLogEntry } from "../memberLogs";
import { colors, radius, spacing, typography } from "../theme/tokens";
import type { RootStackParamList } from "../../App";

type Filter = "all" | "status";

/** 管理者が、メンバー1人の状態の履歴と技術的なログを、日付ごとに見る画面(F28)。 */
export default function MemberLogsScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "MemberLogs">>();
  const { memberId, name } = route.params;
  const { fetchMemberLogs, nearbyLabel } = useApp();
  const [logs, setLogs] = useState<MemberLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    try {
      setError(null);
      setLogs(await fetchMemberLogs(memberId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログを取得できませんでした");
    }
  }, [fetchMemberLogs, memberId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const sections = useMemo(
    () =>
      groupLogsByDay(logs ?? [], nearbyLabel, { onlyStatus: filter === "status" }).map((g) => ({
        title: g.dateLabel,
        data: g.items,
      })),
    [logs, nearbyLabel, filter]
  );

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{name}さんのログ</Text>
        <Text style={styles.headerSub}>現在のログと、直近7日分の保存ログを、新しい順に表示します（日本時間）</Text>
        <View style={styles.filterRow}>
          <FilterButton label="すべて" active={filter === "all"} onPress={() => setFilter("all")} />
          <FilterButton label="状態の変化のみ" active={filter === "status"} onPress={() => setFilter("status")} />
        </View>
      </View>

      {logs === null && !error ? (
        <ActivityIndicator style={styles.loading} color={colors.accent} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.at}-${index}`}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => <LogRow item={item} />}
          ListEmptyComponent={
            <Text style={error ? styles.error : styles.empty}>
              {error ?? "表示できるログがありません"}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

function FilterButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.filterButton, active && styles.filterButtonActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.filterButtonText, active && styles.filterButtonTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function LogRow({ item }: { item: DescribedLog }) {
  const technical = item.kind === "technical";
  return (
    <View style={[styles.row, technical && styles.rowTechnical]}>
      <Text style={styles.time}>{item.timeLabel}</Text>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, technical && styles.rowTitleTechnical]}>{item.title}</Text>
        {item.note.length > 0 && <Text style={styles.rowNote}>{item.note}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.md, paddingBottom: spacing.sm },
  headerTitle: { ...typography.titleLg, color: colors.textPrimary },
  headerSub: { ...typography.bodySm, color: colors.textSecondary, marginTop: spacing.xs },
  filterRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  filterButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterButtonText: { ...typography.labelLg, color: colors.textSecondary },
  filterButtonTextActive: { color: colors.onPrimary },
  loading: { marginTop: spacing.xl },
  list: { paddingBottom: spacing.xl },
  sectionHeader: {
    backgroundColor: colors.surfaceSand,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  sectionHeaderText: { ...typography.labelLg, color: colors.textPrimary },
  row: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTechnical: { backgroundColor: colors.background },
  time: { ...typography.bodyMd, color: colors.textFaint, width: 72, fontVariant: ["tabular-nums"] },
  rowBody: { flex: 1 },
  rowTitle: { ...typography.titleMd, color: colors.textPrimary },
  rowTitleTechnical: { ...typography.bodyMd, color: colors.textSecondary },
  rowNote: { ...typography.bodySm, color: colors.textSecondary, marginTop: 2 },
  empty: { ...typography.bodyMd, color: colors.textFaint, textAlign: "center", marginTop: spacing.xl },
  error: { ...typography.bodyMd, color: colors.danger, textAlign: "center", marginTop: spacing.xl },
});
