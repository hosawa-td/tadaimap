export type PresenceStatus = "home" | "away";

export interface MemberView {
  memberId: string;
  nameOrAnonymous: string;
  isMe: boolean;
  status: PresenceStatus;
  statusUpdatedAt: string;
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

  updateHome(memberId: string, homeLat: number, homeLng: number, homeRadiusM: number): Promise<{ ok: true }> {
    return this.request(`/members/${memberId}/home`, {
      method: "PATCH",
      body: { deviceId: this.deviceId, homeLat, homeLng, homeRadiusM },
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
}
