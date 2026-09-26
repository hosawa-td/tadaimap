export type PresenceStatus = "home" | "nearby" | "away";

export interface MemberView {
  memberId: string;
  nameOrAnonymous: string;
  isMe: boolean;
  status: PresenceStatus;
  statusUpdatedAt: string;
  nearbyLabel: string;
  /** status が "home" の場合に、本人が任意で設定した詳細な状態(例:「トイレ中」)。 */
  homeDetail: string;
  isAdmin: boolean;
  /** 自宅位置・判定範囲(登録済みの場合のみ)。他メンバーには見せないため、isMeの行にしか入らない。 */
  home: { lat: number; lng: number; homeRadiusM: number; buildingRadiusM: number } | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface CreateGroupResult {
  groupId: string;
  memberId: string;
  inviteCode: string;
  inviteCodeExpiresAt: string;
}

export interface JoinGroupResult {
  groupId: string;
  memberId: string;
}

export interface MembersListResult {
  inviteCode: string;
  /** "nearby"ステータスの呼び方(グループ共通・管理者が設定)。 */
  nearbyLabel: string;
  members: MemberView[];
}

export class ApiClient {
  constructor(private baseUrl: string, private deviceId: string) {}

  private async request<T>(path: string, options: { method: string; body?: unknown }): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        "x-device-id": this.deviceId,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const body = json as Partial<ApiErrorBody>;
      throw new ApiError(
        res.status,
        body.error?.code ?? "UNKNOWN_ERROR",
        body.error?.message ?? "通信中にエラーが発生しました"
      );
    }
    return json as T;
  }

  createGroup(name: string): Promise<CreateGroupResult> {
    return this.request("/groups", { method: "POST", body: { deviceId: this.deviceId, name } });
  }

  joinGroup(inviteCode: string, name: string): Promise<JoinGroupResult> {
    return this.request("/groups/join", {
      method: "POST",
      body: { deviceId: this.deviceId, inviteCode, name },
    });
  }

  getMembers(groupId: string): Promise<MembersListResult> {
    return this.request(`/groups/${groupId}/members`, { method: "GET" });
  }

  updateHome(
    memberId: string,
    homeLat: number,
    homeLng: number,
    homeRadiusM: number,
    buildingRadiusM: number
  ): Promise<{ ok: true }> {
    return this.request(`/members/${memberId}/home`, {
      method: "PATCH",
      body: { deviceId: this.deviceId, homeLat, homeLng, homeRadiusM, buildingRadiusM },
    });
  }

  updateStatus(memberId: string, status: PresenceStatus, source: "auto" | "manual"): Promise<{ ok: true }> {
    return this.request(`/members/${memberId}/status`, {
      method: "PATCH",
      body: { deviceId: this.deviceId, status, source },
    });
  }

  updateProfile(memberId: string, fields: { name?: string; showName?: boolean }): Promise<{ ok: true }> {
    return this.request(`/members/${memberId}/profile`, {
      method: "PATCH",
      body: { deviceId: this.deviceId, ...fields },
    });
  }

  updateGroupNearbyLabel(groupId: string, nearbyLabel: string): Promise<{ ok: true; nearbyLabel: string }> {
    return this.request(`/groups/${groupId}/nearby-label`, {
      method: "PATCH",
      body: { deviceId: this.deviceId, nearbyLabel },
    });
  }

  updateHomeDetail(memberId: string, homeDetail: string): Promise<{ ok: true; homeDetail: string }> {
    return this.request(`/members/${memberId}/home-detail`, {
      method: "PATCH",
      body: { deviceId: this.deviceId, homeDetail },
    });
  }

  updateNotify(memberId: string, notifyEnabled: boolean): Promise<{ ok: true }> {
    return this.request(`/members/${memberId}/notify`, {
      method: "PATCH",
      body: { deviceId: this.deviceId, notifyEnabled },
    });
  }

  updatePushToken(memberId: string, pushToken: string): Promise<{ ok: true }> {
    return this.request(`/members/${memberId}/push-token`, {
      method: "PATCH",
      body: { deviceId: this.deviceId, pushToken },
    });
  }

  refreshInviteCode(groupId: string): Promise<{ inviteCode: string; inviteCodeExpiresAt: string }> {
    return this.request(`/groups/${groupId}/invite-code/refresh`, {
      method: "POST",
      body: { deviceId: this.deviceId },
    });
  }

  leaveGroup(memberId: string): Promise<{ ok: true }> {
    return this.request(`/members/${memberId}`, { method: "DELETE" });
  }

  /** 管理者が自分以外のメンバーを削除する(退出と同じエンドポイントで、権限はサーバー側が判定する)。 */
  removeMember(memberId: string): Promise<{ ok: true }> {
    return this.request(`/members/${memberId}`, { method: "DELETE" });
  }

  /** 管理者がグループそのものを削除する(所属メンバー全員も削除される)。 */
  deleteGroup(groupId: string): Promise<{ ok: true }> {
    return this.request(`/groups/${groupId}`, { method: "DELETE" });
  }

  /** この端末が参加しているグループの一覧を、端末内の保存内容に頼らずDBから取得する。 */
  getMyMemberships(): Promise<{
    memberships: { groupId: string; memberId: string; myName: string; inviteCode: string | null }[];
  }> {
    return this.request("/memberships", { method: "GET" });
  }
}
