import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { useApp } from "../state/AppContext";
import { colors, radius, spacing, typography } from "../theme/tokens";
import { NEARBY_LABEL_MAX_LENGTH } from "../validation";

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    myName,
    showName,
    notifyEnabled,
    homeRadiusM,
    buildingRadiusM,
    nearbyLabel,
    amIAdmin,
    inviteCode,
    groupId,
    memberships,
    saveProfile,
    saveNearbyLabel,
    setNotifyEnabled,
    refreshInviteCode,
    switchGroup,
    leaveGroup,
    deleteGroup,
  } = useApp();

  const [nameDraft, setNameDraft] = useState(myName);
  const [nearbyLabelDraft, setNearbyLabelDraft] = useState(nearbyLabel);
  const [copied, setCopied] = useState(false);

  const handleNearbyLabelBlur = async () => {
    const trimmed = nearbyLabelDraft.trim();
    if (trimmed.length === 0) {
      setNearbyLabelDraft(nearbyLabel);
      return;
    }
    if (trimmed === nearbyLabel) return;
    try {
      await saveNearbyLabel(trimmed);
    } catch {
      setNearbyLabelDraft(nearbyLabel);
      Alert.alert("エラー", "呼び方の変更に失敗しました");
    }
  };

  const handleNameBlur = async () => {
    if (nameDraft.trim().length === 0 || nameDraft === myName) return;
    try {
      await saveProfile({ name: nameDraft });
    } catch (err) {
      Alert.alert("エラー", "名前の変更に失敗しました");
    }
  };

  const handleToggleShowName = async (value: boolean) => {
    try {
      await saveProfile({ showName: value });
    } catch {
      Alert.alert("エラー", "表示設定の変更に失敗しました");
    }
  };

  const handleToggleNotify = async (value: boolean) => {
    try {
      await setNotifyEnabled(value);
    } catch {
      Alert.alert("エラー", "通知設定の変更に失敗しました");
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleRefreshCode = async () => {
    try {
      await refreshInviteCode();
      Alert.alert("再発行しました", "新しい招待コードを発行しました。");
    } catch {
      Alert.alert("エラー", "招待コードの再発行に失敗しました");
    }
  };

  const handleLeave = () => {
    Alert.alert("グループを退出しますか？", "退出すると、家族の在宅状況が見られなくなります。", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "退出する",
        style: "destructive",
        onPress: async () => {
          await leaveGroup();
          if (memberships.length <= 1) {
            navigation.reset({ index: 0, routes: [{ name: "Start" }] });
          }
        },
      },
    ]);
  };

  const handleDeleteGroup = () => {
    Alert.alert(
      "グループを削除しますか？",
      "この操作は取り消せません。参加しているメンバー全員がこのグループから削除されます。",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除する",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteGroup();
              if (memberships.length <= 1) {
                navigation.reset({ index: 0, routes: [{ name: "Start" }] });
              }
            } catch (err) {
              Alert.alert("エラー", err instanceof Error ? err.message : "グループの削除に失敗しました");
            }
          },
        },
      ]
    );
  };

  const handleSwitchGroup = async (targetGroupId: string) => {
    if (targetGroupId === groupId) return;
    try {
      await switchGroup(targetGroupId);
    } catch {
      Alert.alert("エラー", "グループの切り替えに失敗しました");
    }
  };

  const handleAddGroup = () => {
    navigation.navigate("JoinGroup");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.header}>設定</Text>

        <Text style={styles.sectionTitle}>プロフィール</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowTitle}>名前</Text>
            <TextInput
              style={styles.nameInput}
              value={nameDraft}
              onChangeText={setNameDraft}
              onBlur={handleNameBlur}
              maxLength={12}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowTitle}>自分の名前を家族に表示する</Text>
              <Text style={styles.rowSub}>
                {showName
                  ? "オンにすると、家族の一覧にあなたの名前が表示されます"
                  : "オフのため、あなたは家族の一覧に「メンバー」として表示されます"}
              </Text>
            </View>
            <Switch value={showName} onValueChange={handleToggleShowName} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>近くにいるときの呼び方</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowTitle}>呼び方</Text>
              <Text style={styles.rowSub}>
                {amIAdmin
                  ? "自宅の範囲外・施設内の範囲内にいるとき、家族全員の表示に使われます（例：施設内、ロビー）"
                  : "管理者が設定した呼び方です。自宅の範囲外・施設内の範囲内にいるときに表示されます"}
              </Text>
            </View>
            {amIAdmin ? (
              <TextInput
                style={styles.nameInput}
                value={nearbyLabelDraft}
                onChangeText={setNearbyLabelDraft}
                onBlur={handleNearbyLabelBlur}
                maxLength={NEARBY_LABEL_MAX_LENGTH}
              />
            ) : (
              <Text style={styles.nameInput}>{nearbyLabel}</Text>
            )}
          </View>
        </View>

        <Text style={styles.sectionTitle}>自宅の設定</Text>
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate("RegisterHome", { fromSettings: true })}
        >
          <View style={styles.row}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowTitle}>自宅の位置・判定範囲</Text>
              <Text style={styles.rowSub}>
                現在：半径 {homeRadiusM}m（施設内は {buildingRadiusM}m まで）
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>通知</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowTitle}>帰宅・外出のプッシュ通知</Text>
              <Text style={styles.rowSub}>家族の誰かの状態が変わったときに知らせます</Text>
            </View>
            <Switch value={notifyEnabled} onValueChange={handleToggleNotify} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>家族グループ</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowTitle}>招待コード</Text>
              <Text style={styles.rowSub}>{inviteCode ?? "------"}</Text>
            </View>
            <TouchableOpacity style={styles.smallButton} onPress={handleCopyCode}>
              <Text style={styles.smallButtonText}>{copied ? "コピー済み" : "コピー"}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity onPress={handleRefreshCode}>
            <Text style={styles.linkText}>招待コードを再発行する</Text>
          </TouchableOpacity>
        </View>

        {memberships.length > 1 && (
          <>
            <Text style={styles.sectionTitle}>参加している他のグループ</Text>
            <View style={styles.card}>
              {memberships.map((m, i) => (
                <View key={m.groupId}>
                  {i > 0 && <View style={styles.divider} />}
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => handleSwitchGroup(m.groupId)}
                    disabled={m.groupId === groupId}
                  >
                    <View style={styles.rowTextBlock}>
                      <Text style={styles.rowTitle}>{m.myName}として参加中</Text>
                      {m.groupId === groupId && <Text style={styles.rowSub}>いま表示しているグループ</Text>}
                    </View>
                    {m.groupId !== groupId && <Text style={styles.chevron}>›</Text>}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}
        <TouchableOpacity style={styles.card} onPress={handleAddGroup}>
          <View style={styles.row}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowTitle}>別の招待コードで参加する</Text>
              <Text style={styles.rowSub}>もう一つの家族グループにも参加できます</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dangerButton} onPress={handleLeave}>
          <Text style={styles.dangerButtonText}>グループからの退出</Text>
        </TouchableOpacity>
        {amIAdmin && (
          <TouchableOpacity style={[styles.dangerButton, styles.dangerButtonStrong]} onPress={handleDeleteGroup}>
            <Text style={styles.dangerButtonTextStrong}>グループを削除する</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  header: { ...typography.headlineMd, color: colors.textPrimary, marginBottom: spacing.md },
  sectionTitle: {
    ...typography.bodySm,
    color: colors.textFaint,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  rowTextBlock: { flex: 1 },
  rowTitle: { ...typography.titleMd, color: colors.textPrimary },
  rowSub: { ...typography.bodySm, color: colors.textFaint, marginTop: 2 },
  nameInput: { ...typography.titleMd, color: colors.textPrimary, textAlign: "right", minWidth: 100 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  chevron: { fontSize: 22, color: colors.textFaint },
  smallButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  smallButtonText: { ...typography.bodySm, color: colors.textPrimary },
  linkText: { ...typography.bodyMd, color: colors.accent, marginTop: spacing.xs },
  dangerButton: {
    marginTop: spacing.xl,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
  },
  dangerButtonStrong: { marginTop: spacing.sm, backgroundColor: colors.danger },
  dangerButtonText: { color: colors.danger, ...typography.labelLg },
  dangerButtonTextStrong: { color: colors.onPrimary, ...typography.labelLg },
});
