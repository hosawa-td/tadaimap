import { randomUUID } from "crypto";
import { AppError } from "./errors";
import {
  isEffectiveAdmin,
  Repository,
  generateInviteCode,
  inviteCodeExpiryFrom,
} from "./repository";
import { Group, Member, PresenceStatus } from "./types";
import { NEARBY_LABEL_DEFAULT } from "./validation";

/**
 * インメモリ実装。テスト用、および開発初期のローカル動作確認用。
 * 本番運用では repository.sheets.ts (Googleスプレッドシート実装) を使用する。
 */
export class MemoryRepository implements Repository {
  private groups = new Map<string, Group>();
  private members = new Map<string, Member>();

  async createGroup(deviceId: string, name: string) {
    const now = new Date();
    const group: Group = {
      groupId: randomUUID(),
      inviteCode: this.issueUniqueInviteCode(),
      inviteCodeExpiresAt: inviteCodeExpiryFrom(now),
      createdAt: now.toISOString(),
      nearbyLabel: NEARBY_LABEL_DEFAULT,
    };
    const member: Member = {
      memberId: randomUUID(),
      groupId: group.groupId,
      deviceId,
      name: name.trim(),
      showName: true,
      status: "away",
      statusUpdatedAt: now.toISOString(),
      homeDetail: "",
      homeLat: null,
      homeLng: null,
      homeRadiusM: null,
      buildingRadiusM: null,
      notifyEnabled: true,
      pushToken: null,
      webPushSubscription: null,
      createdAt: now.toISOString(),
      isAdmin: true,
    };
    this.groups.set(group.groupId, group);
    this.members.set(member.memberId, member);
    return { group, member };
  }

  async joinGroup(deviceId: string, inviteCode: string, name: string) {
    const group = [...this.groups.values()].find(
      (g) => g.inviteCode === inviteCode
    );
    if (!group) {
      throw new AppError("CODE_NOT_FOUND", "招待コードが見つかりません");
    }
    if (new Date(group.inviteCodeExpiresAt).getTime() < Date.now()) {
      throw new AppError("CODE_EXPIRED", "招待コードの有効期限が切れています");
    }
    const existing = await this.getMemberByDeviceId(deviceId);
    if (existing) {
      throw new AppError(
        "ALREADY_JOINED",
        "この端末は既に別のグループに参加しています"
      );
    }
    const now = new Date();
    const member: Member = {
      memberId: randomUUID(),
      groupId: group.groupId,
      deviceId,
      name: name.trim(),
      showName: true,
      status: "away",
      statusUpdatedAt: now.toISOString(),
      homeDetail: "",
      homeLat: null,
      homeLng: null,
      homeRadiusM: null,
      buildingRadiusM: null,
      notifyEnabled: true,
      pushToken: null,
      webPushSubscription: null,
      createdAt: now.toISOString(),
      isAdmin: false,
    };
    this.members.set(member.memberId, member);
    return { group, member };
  }

  async getGroup(groupId: string): Promise<Group | null> {
    return this.groups.get(groupId) ?? null;
  }

  async getMembersByGroup(groupId: string): Promise<Member[]> {
    return [...this.members.values()].filter((m) => m.groupId === groupId);
  }

  async getMemberById(memberId: string): Promise<Member | null> {
    return this.members.get(memberId) ?? null;
  }

  async getMemberByDeviceId(deviceId: string): Promise<Member | null> {
    return (
      [...this.members.values()].find((m) => m.deviceId === deviceId) ?? null
    );
  }

  async updateHome(
    memberId: string,
    deviceId: string,
    homeLat: number,
    homeLng: number,
    homeRadiusM: number,
    buildingRadiusM: number
  ): Promise<Member> {
    const member = this.requireOwnedMember(memberId, deviceId);
    member.homeLat = homeLat;
    member.homeLng = homeLng;
    member.homeRadiusM = homeRadiusM;
    member.buildingRadiusM = buildingRadiusM;
    return member;
  }

  async updateStatus(
    memberId: string,
    deviceId: string,
    status: PresenceStatus
  ): Promise<Member> {
    const member = await this.requireStatusPermission(memberId, deviceId);
    member.status = status;
    member.statusUpdatedAt = new Date().toISOString();
    member.homeDetail = "";
    return member;
  }

  async updateHomeDetail(memberId: string, deviceId: string, homeDetail: string): Promise<Member> {
    const member = this.requireOwnedMember(memberId, deviceId);
    member.homeDetail = homeDetail.trim();
    return member;
  }

  async updateProfile(
    memberId: string,
    deviceId: string,
    fields: { name?: string; showName?: boolean }
  ): Promise<Member> {
    const member = this.requireOwnedMember(memberId, deviceId);
    if (fields.name !== undefined) member.name = fields.name.trim();
    if (fields.showName !== undefined) member.showName = fields.showName;
    return member;
  }

  async updateGroupNearbyLabel(groupId: string, deviceId: string, nearbyLabel: string): Promise<Group> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new AppError("NOT_FOUND", "グループが見つかりません");
    }
    const requester = await this.getMemberByDeviceId(deviceId);
    const groupMembers = await this.getMembersByGroup(groupId);
    if (!requester || requester.groupId !== groupId || !isEffectiveAdmin(requester, groupMembers)) {
      throw new AppError("FORBIDDEN", "呼び方を変更する権限がありません");
    }
    group.nearbyLabel = nearbyLabel.trim();
    return group;
  }

  async updateNotify(
    memberId: string,
    deviceId: string,
    notifyEnabled: boolean
  ): Promise<Member> {
    const member = this.requireOwnedMember(memberId, deviceId);
    member.notifyEnabled = notifyEnabled;
    return member;
  }

  async updatePushToken(
    memberId: string,
    deviceId: string,
    pushToken: string
  ): Promise<Member> {
    const member = this.requireOwnedMember(memberId, deviceId);
    member.pushToken = pushToken;
    return member;
  }

  async updateWebPushSubscription(
    memberId: string,
    deviceId: string,
    subscription: string | null
  ): Promise<Member> {
    const member = this.requireOwnedMember(memberId, deviceId);
    member.webPushSubscription = subscription;
    return member;
  }

  async refreshInviteCode(groupId: string, deviceId: string): Promise<Group> {
    const member = await this.getMemberByDeviceId(deviceId);
    if (!member || member.groupId !== groupId) {
      throw new AppError(
        "FORBIDDEN",
        "このグループの招待コードを再発行する権限がありません"
      );
    }
    const group = this.groups.get(groupId);
    if (!group) {
      throw new AppError("NOT_FOUND", "グループが見つかりません");
    }
    const now = new Date();
    group.inviteCode = this.issueUniqueInviteCode();
    group.inviteCodeExpiresAt = inviteCodeExpiryFrom(now);
    return group;
  }

  async leaveGroup(memberId: string, deviceId: string): Promise<void> {
    const member = this.requireOwnedMember(memberId, deviceId);
    this.members.delete(member.memberId);
    const remaining = await this.getMembersByGroup(member.groupId);
    if (remaining.length === 0) {
      this.groups.delete(member.groupId);
    }
  }

  private requireOwnedMember(memberId: string, deviceId: string): Member {
    const member = this.members.get(memberId);
    if (!member) {
      throw new AppError("NOT_FOUND", "メンバーが見つかりません");
    }
    if (member.deviceId !== deviceId) {
      throw new AppError("FORBIDDEN", "このメンバー情報を操作する権限がありません");
    }
    return member;
  }

  /**
   * 状態(status)は本人に加えて、同じグループの管理者からも変更できる
   * (「管理者は参加者の状態設定を手動で変更もできる」という要件のため)。
   */
  private async requireStatusPermission(memberId: string, requesterDeviceId: string): Promise<Member> {
    const member = this.members.get(memberId);
    if (!member) {
      throw new AppError("NOT_FOUND", "メンバーが見つかりません");
    }
    if (member.deviceId === requesterDeviceId) {
      return member;
    }
    const requester = await this.getMemberByDeviceId(requesterDeviceId);
    const groupMembers = await this.getMembersByGroup(member.groupId);
    if (!requester || requester.groupId !== member.groupId || !isEffectiveAdmin(requester, groupMembers)) {
      throw new AppError("FORBIDDEN", "このメンバーの状態を変更する権限がありません");
    }
    return member;
  }

  private issueUniqueInviteCode(): string {
    let code = generateInviteCode();
    const existingCodes = new Set([...this.groups.values()].map((g) => g.inviteCode));
    while (existingCodes.has(code)) {
      code = generateInviteCode();
    }
    return code;
  }
}
