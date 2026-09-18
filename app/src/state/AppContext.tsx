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
import { clearMembership, loadMembership, saveMembership, STORAGE_KEYS } from "../storage";
import { RADIUS_DEFAULT } from "../validation";
import { registerForPushNotifications } from "../notifications";
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
  inviteCode: string | null;
  members: MemberView[];
  loading: boolean;
  errorMessage: string | null;

  createGroup: (name: string) => Promise<{ inviteCode: string }>;
  joinGroup: (inviteCode: string, name: string) => Promise<void>;
  refreshMembers: () => Promise<void>;
  saveHome: (lat: number, lng: number, radiusM: number) => Promise<void>;
  setStatus: (status: PresenceStatus, source: "auto" | "manual") => Promise<void>;
  saveProfile: (fields: { name?: string; showName?: boolean }) => Promise<void>;
  setNotifyEnabled: (value: boolean) => Promise<void>;
  refreshInviteCode: () => Promise<string>;
  leaveGroup: () => Promise<void>;
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
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberView[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const api = useMemo(() => (deviceId ? new ApiClient(API_BASE_URL, deviceId) : null), [deviceId]);

  useEffect(() => {
    (async () => {
      const id = await getOrCreateDeviceId();
      setDeviceId(id);
      const stored = await loadMembership();
      if (stored.groupId && stored.memberId) {
        setGroupId(stored.groupId);
        setMemberId(stored.memberId);
        setMyName(stored.myName ?? "");
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

  const refreshMembers = useCallback(async () => {
    if (!api || !groupId) return;
    const result = await api.getMembers(groupId);
    setInviteCode(result.inviteCode);
    setMembers(result.members);
  }, [api, groupId]);

  const createGroup = useCallback(
    async (name: string) => {
      if (!api) throw new Error("初期化中です");
      return withLoading(async () => {
        const result = await api.createGroup(name);
        setGroupId(result.groupId);
        setMemberId(result.memberId);
        setMyName(name);
        setInviteCode(result.inviteCode);
        await saveMembership(result.groupId, result.memberId, name);
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
        setGroupId(result.groupId);
        setMemberId(result.memberId);
        setMyName(name);
        await saveMembership(result.groupId, result.memberId, name);
      });
    },
    [api, withLoading]
  );

  const saveHome = useCallback(
    async (lat: number, lng: number, radiusM: number) => {
      if (!api || !memberId) return;
      await withLoading(async () => {
        await api.updateHome(memberId, lat, lng, radiusM);
        setHomeRadiusM(radiusM);
        await AsyncStorage.setItem(STORAGE_KEYS.homeRadiusM, String(radiusM));
        try {
          await startHomeGeofence(lat, lng, radiusM);
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

  const saveProfile = useCallback(
    async (fields: { name?: string; showName?: boolean }) => {
      if (!api || !memberId) return;
      await withLoading(async () => {
        await api.updateProfile(memberId, fields);
        if (fields.name !== undefined) setMyName(fields.name);
        if (fields.showName !== undefined) setShowNameState(fields.showName);
        await refreshMembers();
      });
    },
    [api, memberId, refreshMembers, withLoading]
  );

  const setNotifyEnabled = useCallback(
    async (value: boolean) => {
      if (!api || !memberId) return;
      await withLoading(async () => {
        await api.updateNotify(memberId, value);
        setNotifyEnabledState(value);
        await AsyncStorage.setItem(STORAGE_KEYS.notifyEnabled, value ? "1" : "0");
        if (value) {
          const token = await registerForPushNotifications();
          if (token) {
            await api.updatePushToken(memberId, token);
          }
        }
      });
    },
    [api, memberId, withLoading]
  );

  const refreshInviteCode = useCallback(async () => {
    if (!api || !groupId) throw new Error("グループが見つかりません");
    return withLoading(async () => {
      const result = await api.refreshInviteCode(groupId);
      setInviteCode(result.inviteCode);
      return result.inviteCode;
    });
  }, [api, groupId, withLoading]);

  const leaveGroup = useCallback(async () => {
    if (!api || !memberId) return;
    await withLoading(async () => {
      await api.leaveGroup(memberId);
      await stopHomeGeofence();
      await clearMembership();
      setGroupId(null);
      setMemberId(null);
      setMyName("");
      setInviteCode(null);
      setMembers([]);
    });
  }, [api, memberId, withLoading]);

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
    inviteCode,
    members,
    loading,
    errorMessage,
    createGroup,
    joinGroup,
    refreshMembers,
    saveHome,
    setStatus,
    saveProfile,
    setNotifyEnabled,
    refreshInviteCode,
    leaveGroup,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp は AppProvider の内側で使用してください");
  return ctx;
}
