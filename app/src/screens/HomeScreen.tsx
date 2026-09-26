import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import DraggableFlatList, { RenderItemParams } from "react-native-draggable-flatlist";
import { TouchableOpacity as GHTouchableOpacity } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../state/AppContext";
import { formatStatusLine, homeDetailText, statusLabel, summaryText } from "../presence";
import { MemberView, PresenceStatus } from "../api";
import { loadMemberOrder, saveMemberOrder } from "../storage";
import { colors, radius, spacing, typography } from "../theme/tokens";
import { HOME_DETAIL_MAX_LENGTH } from "../validation";

/**
 * 端末に保存済みの並び順があればそれを適用し(新しく増えたメンバーは末尾に追加)、
 * 保存が無い場合は自分を先頭にした既定の並びにする。
 */
function applyMemberOrder(members: MemberView[], order: string[] | null): MemberView[] {
  if (!order) {
    const me = members.find((m) => m.isMe);
    const others = members.filter((m) => !m.isMe);
    return me ? [me, ...others] : members;
  }
  const remaining = new Map(members.map((m) => [m.memberId, m]));
  const ordered: MemberView[] = [];
  order.forEach((id) => {
    const m = remaining.get(id);
    if (m) {
      ordered.push(m);
      remaining.delete(id);
    }
  });
  remaining.forEach((m) => ordered.push(m));
  return ordered;
}

export default function HomeScreen() {
  const {
    groupId,
    members,
    inviteCode,
    refreshMembers,
    setStatus,
    setMemberStatus,
    nearbyLabel,
    amIAdmin,
    saveHomeDetail,
    removeMember,
  } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [homeDetailDraft, setHomeDetailDraft] = useState("");
  const [editingHomeDetail, setEditingHomeDetail] = useState(false);
  const [adminTarget, setAdminTarget] = useState<MemberView | null>(null);
  const [orderedMembers, setOrderedMembers] = useState<MemberView[]>([]);

  useEffect(() => {
    // メンバー一覧が更新されるたびに、この端末で保存している並び順を適用し直す
    // (サーバー側の並びは常に一定ではないため)
    let cancelled = false;
    (async () => {
      const order = groupId ? await loadMemberOrder(groupId) : null;
      if (!cancelled) setOrderedMembers(applyMemberOrder(members, order));
    })();
    return () => {
      cancelled = true;
    };
  }, [members, groupId]);

  const handleDragEnd = useCallback(
    ({ data }: { data: MemberView[] }) => {
      setOrderedMembers(data);
      if (groupId) {
        saveMemberOrder(
          groupId,
          data.map((m) => m.memberId)
        ).catch(() => {});
      }
    },
    [groupId]
  );

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
  const myHomeDetail = members.find((m) => m.isMe)?.homeDetail ?? "";

  useEffect(() => {
    // 通信中に編集中の入力を上書きしないよう、編集していないときだけ同期する
    if (!editingHomeDetail) setHomeDetailDraft(myHomeDetail);
  }, [myHomeDetail, editingHomeDetail]);

  const commitHomeDetail = async (value: string) => {
    const trimmed = value.trim();
    if (trimmed === myHomeDetail) return;
    try {
      await saveHomeDetail(trimmed);
    } catch {
      setHomeDetailDraft(myHomeDetail);
      Alert.alert("エラー", "詳細な状態の変更に失敗しました");
    }
  };

  const handleHomeDetailBlur = () => {
    setEditingHomeDetail(false);
    commitHomeDetail(homeDetailDraft);
  };

  const handleHomeDetailSubmit = () => {
    Keyboard.dismiss();
    commitHomeDetail(homeDetailDraft);
  };

  const handleClearHomeDetail = () => {
    setHomeDetailDraft("");
    commitHomeDetail("");
  };

  const handleAdminChangeStatus = (target: MemberView) => {
    setAdminTarget(target);
  };

  const closeAdminModal = () => setAdminTarget(null);

  const handleAdminSetStatus = (status: PresenceStatus) => {
    if (!adminTarget) return;
    setMemberStatus(adminTarget.memberId, status);
    closeAdminModal();
  };

  const handleAdminRemoveMember = () => {
    if (!adminTarget) return;
    const target = adminTarget;
    closeAdminModal();
    Alert.alert(
      `${target.nameOrAnonymous}を削除しますか？`,
      "削除すると、この家族はグループから外れます。もう一度参加するには招待コードが必要になります。",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除する",
          style: "destructive",
          onPress: async () => {
            try {
              await removeMember(target.memberId);
            } catch (err) {
              Alert.alert("エラー", err instanceof Error ? err.message : "削除に失敗しました");
            }
          },
        },
      ]
    );
  };

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
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>わが家</Text>
            <Text style={styles.headerSub}>招待コード: {inviteCode ?? "------"}</Text>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh} disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.refreshButtonText}>更新</Text>
            )}
          </TouchableOpacity>
        </View>
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
      {myStatus === "home" && (
        <View style={styles.homeDetailRow}>
          <TouchableOpacity
            style={styles.homeDetailClearButton}
            onPress={handleClearHomeDetail}
            disabled={homeDetailDraft.length === 0}
          >
            <Text
              style={[
                styles.homeDetailClearText,
                homeDetailDraft.length === 0 && styles.homeDetailClearTextDisabled,
              ]}
            >
              ×
            </Text>
          </TouchableOpacity>
          <TextInput
            style={styles.homeDetailInput}
            placeholder="トイレ中・入浴中 など（任意）"
            placeholderTextColor={colors.textFaint}
            value={homeDetailDraft}
            onChangeText={setHomeDetailDraft}
            onFocus={() => setEditingHomeDetail(true)}
            onBlur={handleHomeDetailBlur}
            onSubmitEditing={handleHomeDetailSubmit}
            returnKeyType="done"
            maxLength={HOME_DETAIL_MAX_LENGTH}
          />
        </View>
      )}
      {amIAdmin && (
        <Text style={styles.adminHint}>管理者として、家族の名前を長押しすると代わりに状態を変更できます</Text>
      )}

      <DraggableFlatList
        data={orderedMembers}
        keyExtractor={(m) => m.memberId}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        onDragEnd={handleDragEnd}
        renderItem={({ item, drag, isActive }: RenderItemParams<MemberView>) => (
          <MemberRow
            member={item}
            isActive={isActive}
            onDrag={drag}
            onLongPress={amIAdmin && !item.isMe ? () => handleAdminChangeStatus(item) : undefined}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>メンバー情報を読み込んでいます…</Text>}
      />

      <Modal visible={adminTarget !== null} transparent animationType="fade" onRequestClose={closeAdminModal}>
        <Pressable style={styles.modalOverlay} onPress={closeAdminModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{adminTarget?.nameOrAnonymous}の状態を変更</Text>
            <Text style={styles.modalSub}>管理者として、この家族の状態を代わりに変更できます。</Text>
            <TouchableOpacity style={styles.modalButton} onPress={() => handleAdminSetStatus("home")}>
              <Text style={styles.modalButtonText}>在宅にする</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalButton} onPress={() => handleAdminSetStatus("nearby")}>
              <Text style={styles.modalButtonText}>{adminTarget?.nearbyLabel}にする</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalButton} onPress={() => handleAdminSetStatus("away")}>
              <Text style={styles.modalButtonText}>外出中にする</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, styles.modalButtonDanger]} onPress={handleAdminRemoveMember}>
              <Text style={styles.modalButtonDangerText}>このメンバーを削除する</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={closeAdminModal}>
              <Text style={styles.modalCancelText}>キャンセル</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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

function MemberRow({
  member,
  onLongPress,
  onDrag,
  isActive,
}: {
  member: MemberView;
  onLongPress?: () => void;
  onDrag: () => void;
  isActive: boolean;
}) {
  const Wrapper = onLongPress ? TouchableOpacity : View;
  return (
    <Wrapper
      style={[styles.memberCard, isActive && styles.memberCardActive]}
      onLongPress={onLongPress}
      delayLongPress={400}
      {...(onLongPress ? { activeOpacity: 0.7 } : {})}
    >
      <GHTouchableOpacity
        style={styles.dragHandle}
        onLongPress={onDrag}
        delayLongPress={150}
        disabled={isActive}
        hitSlop={8}
      >
        <Ionicons name="reorder-three" size={22} color={colors.textFaint} />
      </GHTouchableOpacity>
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
          {member.isAdmin && (
            <View style={styles.adminTag}>
              <Text style={styles.adminTagText}>管理者</Text>
            </View>
          )}
        </View>
        <Text style={styles.memberTime}>{formatStatusLine(member)}</Text>
        {homeDetailText(member) && <Text style={styles.homeDetailCaption}>{homeDetailText(member)}</Text>}
      </View>
      <View style={[styles.statusPill, { backgroundColor: STATUS_SOFT_COLOR[member.status] }]}>
        <Text style={[styles.statusPillText, { color: STATUS_COLOR[member.status] }]}>
          {statusLabel(member)}
        </Text>
      </View>
    </Wrapper>
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
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerTitle: { ...typography.headlineSm, color: colors.textPrimary },
  headerSub: { ...typography.bodySm, color: colors.textFaint, marginTop: 2 },
  refreshButton: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    minWidth: 56,
    alignItems: "center",
  },
  refreshButtonText: { ...typography.labelLg, fontSize: 13, color: colors.textPrimary },
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
  homeDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  homeDetailInput: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    textAlign: "center",
  },
  homeDetailClearButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  homeDetailClearText: { color: colors.textSecondary, fontSize: 16, fontWeight: "700" },
  homeDetailClearTextDisabled: { color: colors.textFaint },
  adminHint: {
    ...typography.bodySm,
    color: colors.textFaint,
    textAlign: "center",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
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
  memberCardActive: {
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dragHandle: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
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
  adminTag: {
    backgroundColor: colors.homeSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  adminTagText: { ...typography.bodySm, color: colors.home, fontSize: 10 },
  memberTime: { ...typography.bodySm, color: colors.textFaint, marginTop: 2 },
  homeDetailCaption: { ...typography.bodySm, color: colors.accent, marginTop: 2, fontWeight: "600" },
  statusPill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  statusPillText: { ...typography.labelLg, fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  modalTitle: { ...typography.titleMd, color: colors.textPrimary, marginBottom: spacing.xs },
  modalSub: { ...typography.bodySm, color: colors.textFaint, marginBottom: spacing.md, lineHeight: 18 },
  modalButton: {
    backgroundColor: colors.surfaceSand,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  modalButtonText: { ...typography.bodyMd, color: colors.textPrimary, fontWeight: "600" },
  modalButtonDanger: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.danger },
  modalButtonDangerText: { ...typography.bodyMd, color: colors.danger, fontWeight: "600" },
  modalCancel: { alignItems: "center", padding: spacing.sm, marginTop: spacing.xs },
  modalCancelText: { ...typography.labelLg, color: colors.textFaint },
});
