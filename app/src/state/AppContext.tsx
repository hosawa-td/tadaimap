import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiClient, MemberView, PresenceStatus } from "../api";
import { getOrCreateDeviceId } from "../deviceId";
import {
  addMembership,
  clearAllMemberships,
  loadHomeGeofenceConfig,
  loadMemberships,
  Membership,
  removeMembership,
  saveHomeGeofenceConfig,
  setCurrentGroupId,
  STORAGE_KEYS,
  updateMembershipName,
} from "../storage";
import { BUILDING_RADIUS_DEFAULT, NEARBY_LABEL_DEFAULT, RADIUS_DEFAULT } from "../validation";
import { registerForPushNotifications, subscribeToNotifications } from "../notifications";
import { startHomeGeofence, stopHomeGeofence } from "../location";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

interface AppContextValue {
  ready: boolean;
  hasGroup: boolean;
  deviceId: string;
  groupId: string | null;
  memberId: string | null;
  myName: string;
  showName: boolean;
  notifyEnabled: boolean;
  homeRadiusM: number;
  buildingRadiusM: number;
  nearbyLabel: string;
  amIAdmin: boolean;
  inviteCode: string | null;
  members: MemberView[];
  /** 参加中の家族グループ一覧(1台の端末で複数のグループに参加できる)。 */
  memberships: Membership[];
  loading: boolean;
  errorMessage: string | null;

  createGroup: (name: string) => Promise<{ inviteCode: string }>;
  joinGroup: (inviteCode: string, name: string) => Promise<void>;
  /** 参加中の別のグループに切り替える。 */
  switchGroup: (groupId: string) => Promise<void>;
  refreshMembers: (targetGroupId?: string) => Promise<void>;
  saveHome: (lat: number, lng: number, homeRadiusM: number, buildingRadiusM: number) => Promise<void>;
  setStatus: (status: PresenceStatus, source: "auto" | "manual") => Promise<void>;
  setMemberStatus: (targetMemberId: string, status: PresenceStatus) => Promise<void>;
  saveProfile: (fields: { name?: string; showName?: boolean }) => Promise<void>;
  saveNearbyLabel: (nearbyLabel: string) => Promise<void>;
  saveHomeDetail: (homeDetail: string) => Promise<void>;
  setNotifyEnabled: (value: boolean) => Promise<void>;
  refreshInviteCode: () => Promise<string>;
  leaveGroup: () => Promise<void>;
  /** 管理者が自分以外のメンバーを削除する。 */
  removeMember: (targetMemberId: string) => Promise<void>;
  /** 管理者がいまのグループそのものを削除する。 */
  deleteGroup: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [myName, setMyName] = useState<string>("");
  const [showName, setShowNameState] = useState(true);
  const [notifyEnabled, setNotifyEnabledState] = useState(true);
  const [homeRadiusM, setHomeRadiusM] = useState(RADIUS_DEFAULT);
  const [buildingRadiusM, setBuildingRadiusM] = useState(BUILDING_RADIUS_DEFAULT);
  const [nearbyLabel, setNearbyLabelState] = useState(NEARBY_LABEL_DEFAULT);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberView[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const api = useMemo(() => (deviceId ? new ApiClient(API_BASE_URL, deviceId) : null), [deviceId]);

  useEffect(() => {
    (async () => {
      const id = await getOrCreateDeviceId();
      setDeviceId(id);
      const stored = await loadMemberships();
      setMemberships(stored.memberships);
      const current = stored.memberships.find((m) => m.groupId === stored.currentGroupId);
      if (current) {
        setGroupId(current.groupId);
        setMemberId(current.memberId);
        setMyName(current.myName);
      }
      const geofenceConfig = await loadHomeGeofenceConfig();
      if (geofenceConfig) {
        setHomeRadiusM(geofenceConfig.homeRadiusM);
        setBuildingRadiusM(geofenceConfig.buildingRadiusM);
      }
      setReady(true);
    })();
  }, []);

  const withLoading = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setLoading(true);
    setErrorMessage(null);
    try {
      return await fn();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "エラーが発生しました");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMembers = useCallback(
    async (targetGroupId?: string) => {
      const effectiveGroupId = targetGroupId ?? groupId;
      if (!api || !effectiveGroupId) return;
      const result = await api.getMembers(effectiveGroupId);
      setInviteCode(result.inviteCode);
      setMembers(result.members);
      setNearbyLabelState(result.nearbyLabel);
    },
    [api, groupId]
  );

  useEffect(() => {
    // 帰宅・外出のプッシュ通知を受け取った瞬間に、一覧をその場で最新化する
    // (通知が届いてから次の定期更新まで待たせないため)
    const unsubscribe = subscribeToNotifications(() => {
      refreshMembers().catch(() => {});
    });
    return unsubscribe;
  }, [refreshMembers]);

  const createGroup = useCallback(
    async (name: string) => {
      if (!api) throw new Error("初期化中です");
      return withLoading(async () => {
        const result = await api.createGroup(name);
        const membership: Membership = { groupId: result.groupId, memberId: result.memberId, myName: name };
        setGroupId(result.groupId);
        setMemberId(result.memberId);
        setMyName(name);
        setInviteCode(result.inviteCode);
        await addMembership(membership);
        setMemberships((prev) => [...prev.filter((m) => m.groupId !== membership.groupId), membership]);
        return { inviteCode: result.inviteCode };
      });
    },
    [api, withLoading]
  );

  const joinGroup = useCallback(
    async (inviteCode2: string, name: string) => {
      if (!api) throw new Error("初期化中です");
      await withLoading(async () => {
        const result = await api.joinGroup(inviteCode2, name);
        const membership: Membership = { groupId: result.groupId, memberId: result.memberId, myName: name };
        setGroupId(result.groupId);
        setMemberId(result.memberId);
        setMyName(name);
        await addMembership(membership);
        setMemberships((prev) => [...prev.filter((m) => m.groupId !== membership.groupId), membership]);
      });
    },
    [api, withLoading]
  );

  const switchGroup = useCallback(
    async (targetGroupId: string) => {
      const target = memberships.find((m) => m.groupId === targetGroupId);
      if (!target) return;
      await withLoading(async () => {
        await setCurrentGroupId(target.groupId);
        setGroupId(target.groupId);
        setMemberId(target.memberId);
        setMyName(target.myName);
        setInviteCode(null);
        setMembers([]);
        await refreshMembers(target.groupId);
      });
    },
    [memberships, withLoading, refreshMembers]
  );

  const saveHome = useCallback(
    async (lat: number, lng: number, homeRadiusMValue: number, buildingRadiusMValue: number) => {
      if (!api || !memberId) return;
      await withLoading(async () => {
        await api.updateHome(memberId, lat, lng, homeRadiusMValue, buildingRadiusMValue);
        setHomeRadiusM(homeRadiusMValue);
        setBuildingRadiusM(buildingRadiusMValue);
        await saveHomeGeofenceConfig({
          lat,
          lng,
          homeRadiusM: homeRadiusMValue,
          buildingRadiusM: buildingRadiusMValue,
        });
        try {
          await startHomeGeofence(lat, lng, homeRadiusMValue, buildingRadiusMValue);
        } catch (err) {
          // 位置情報の権限が無い場合などは自動判定を諦め、手動更新にフォールバックする
          // eslint-disable-next-line no-console
          console.warn("[home] ジオフェンスの登録に失敗しました", err);
        }
      });
    },
    [api, memberId, withLoading]
  );

  const setStatus = useCallback(
    async (status: PresenceStatus, source: "auto" | "manual") => {
      if (!api || !memberId) return;
      await withLoading(async () => {
        await api.updateStatus(memberId, status, source);
        await refreshMembers();
      });
    },
    [api, memberId, refreshMembers, withLoading]
  );

  const setMemberStatus = useCallback(
    async (targetMemberId: string, status: PresenceStatus) => {
      if (!api) return;
      // 管理者が他のメンバーの状態を代わりに変更する場合に使う(権限の判定はサーバー側で行う)
      await withLoading(async () => {
        await api.updateStatus(targetMemberId, status, "manual");
        await refreshMembers();
      });
    },
    [api, refreshMembers, withLoading]
  );

  const saveProfile = useCallback(
    async (fields: { name?: string; showName?: boolean }) => {
      if (!api || !memberId || !groupId) return;
      // 画面のスイッチ/入力欄がすぐに反映されるよう、通信の結果を待たず先に表示を更新する
      // (通信が失敗した場合は元の値に戻す)
      const previousName = myName;
      const previousShowName = showName;
      if (fields.name !== undefined) setMyName(fields.name);
      if (fields.showName !== undefined) setShowNameState(fields.showName);
      try {
        await withLoading(async () => {
          await api.updateProfile(memberId, fields);
          if (fields.name !== undefined) {
            await updateMembershipName(groupId, fields.name);
            setMemberships((prev) =>
              prev.map((m) => (m.groupId === groupId ? { ...m, myName: fields.name as string } : m))
            );
          }
          await refreshMembers();
        });
      } catch (err) {
        setMyName(previousName);
        setShowNameState(previousShowName);
        throw err;
      }
    },
    [api, memberId, groupId, myName, showName, refreshMembers, withLoading]
  );

  const saveNearbyLabel = useCallback(
    async (label: string) => {
      if (!api || !groupId) return;
      // 管理者が全員分の呼び方をまとめて変更する(権限の判定はサーバー側で行う)
      const previous = nearbyLabel;
      setNearbyLabelState(label);
      try {
        await withLoading(async () => {
          await api.updateGroupNearbyLabel(groupId, label);
          await refreshMembers();
        });
      } catch (err) {
        setNearbyLabelState(previous);
        throw err;
      }
    },
    [api, groupId, nearbyLabel, refreshMembers, withLoading]
  );

  const saveHomeDetail = useCallback(
    async (homeDetail: string) => {
      if (!api || !memberId) return;
      await withLoading(async () => {
        await api.updateHomeDetail(memberId, homeDetail);
        await refreshMembers();
      });
    },
    [api, memberId, refreshMembers, withLoading]
  );

  const setNotifyEnabled = useCallback(
    async (value: boolean) => {
      if (!api || !memberId) return;
      // saveProfile と同様、スイッチの見た目は先に切り替え、失敗時のみ元に戻す
      const previous = notifyEnabled;
      setNotifyEnabledState(value);
      try {
        await withLoading(async () => {
          await api.updateNotify(memberId, value);
          await AsyncStorage.setItem(STORAGE_KEYS.notifyEnabled, value ? "1" : "0");
          if (value) {
            const token = await registerForPushNotifications();
            if (token) {
              await api.updatePushToken(memberId, token);
            }
          }
        });
      } catch (err) {
        setNotifyEnabledState(previous);
        throw err;
      }
    },
    [api, memberId, notifyEnabled, withLoading]
  );

  const refreshInviteCode = useCallback(async () => {
    if (!api || !groupId) throw new Error("グループが見つかりません");
    return withLoading(async () => {
      const result = await api.refreshInviteCode(groupId);
      setInviteCode(result.inviteCode);
      return result.inviteCode;
    });
  }, [api, groupId, withLoading]);

  /** グループ退出・削除の後始末。他に参加中のグループがあれば切り替え、無ければ端末の状態を全てリセットする。 */
  const settleAfterLeavingCurrentGroup = useCallback(async () => {
    if (!groupId) return;
    await stopHomeGeofence();
    const { memberships: remaining, currentGroupId } = await removeMembership(groupId);
    setMemberships(remaining);
    const next = remaining.find((m) => m.groupId === currentGroupId);
    if (next) {
      setGroupId(next.groupId);
      setMemberId(next.memberId);
      setMyName(next.myName);
      setInviteCode(null);
      setMembers([]);
      await refreshMembers(next.groupId);
    } else {
      await clearAllMemberships();
      setGroupId(null);
      setMemberId(null);
      setMyName("");
      setInviteCode(null);
      setMembers([]);
    }
  }, [groupId, refreshMembers]);

  const leaveGroup = useCallback(async () => {
    if (!api || !memberId) return;
    await withLoading(async () => {
      await api.leaveGroup(memberId);
      await settleAfterLeavingCurrentGroup();
    });
  }, [api, memberId, withLoading, settleAfterLeavingCurrentGroup]);

  const removeMember = useCallback(
    async (targetMemberId: string) => {
      if (!api) return;
      await withLoading(async () => {
        await api.removeMember(targetMemberId);
        await refreshMembers();
      });
    },
    [api, refreshMembers, withLoading]
  );

  const deleteGroup = useCallback(async () => {
    if (!api || !groupId) return;
    await withLoading(async () => {
      await api.deleteGroup(groupId);
      await settleAfterLeavingCurrentGroup();
    });
  }, [api, groupId, withLoading, settleAfterLeavingCurrentGroup]);

  const amIAdmin = members.find((m) => m.isMe)?.isAdmin ?? false;

  const value: AppContextValue = {
    ready,
    hasGroup: !!(groupId && memberId),
    deviceId,
    groupId,
    memberId,
    myName,
    showName,
    notifyEnabled,
    homeRadiusM,
    buildingRadiusM,
    nearbyLabel,
    amIAdmin,
    inviteCode,
    members,
    memberships,
    loading,
    errorMessage,
    createGroup,
    joinGroup,
    switchGroup,
    refreshMembers,
    saveHome,
    setStatus,
    setMemberStatus,
    saveProfile,
    saveNearbyLabel,
    saveHomeDetail,
    setNotifyEnabled,
    refreshInviteCode,
    leaveGroup,
    removeMember,
    deleteGroup,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp は AppProvider の内側で使用してください");
  return ctx;
}
