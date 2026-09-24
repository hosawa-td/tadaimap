import { google, sheets_v4 } from "googleapis";
import { AppError } from "./errors";
import {
  Repository,
  generateInviteCode,
  inviteCodeExpiryFrom,
} from "./repository";
import { Group, Member, PresenceStatus } from "./types";
import { NEARBY_LABEL_DEFAULT } from "./validation";

const GROUPS_SHEET = "Groups";
const MEMBERS_SHEET = "Members";

const GROUPS_COLUMNS = ["group_id", "invite_code", "invite_code_expires_at", "created_at"] as const;
const MEMBERS_COLUMNS = [
  "member_id",
  "group_id",
  "device_id",
  "name",
  "show_name",
  "status",
  "status_updated_at",
  "home_lat",
  "home_lng",
  "home_radius_m",
  "notify_enabled",
  "push_token",
  "created_at",
  // 施設内判定機能で追加(既存の行との互換性のため末尾に追加)
  "building_radius_m",
  "nearby_label",
] as const;

/**
 * 環境変数として貼り付けられた秘密鍵の、よくある入力ミスを吸収する。
 * - 前後に引用符(" や ')がそのまま含まれている場合は取り除く
 * - 改行が "\n" という文字列のまま渡された場合は、実際の改行に変換する
 */
export function normalizePrivateKey(rawKey: string): string {
  let key = rawKey.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, "\n");
}

function toBool(v: unknown): boolean {
  return v === true || v === "TRUE" || v === "true" || v === 1;
}

function toNumberOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Googleスプレッドシートを簡易DBとして使う本番用実装。
 * サービスアカウント経由で、共有ドライブ上のスプレッドシートを読み書きする。
 * (外部インターフェース設計書・スプレッドシート設計書を参照)
 */
export class SheetsRepository implements Repository {
  private sheetsApi: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor(spreadsheetId: string, serviceAccountEmail: string, privateKey: string) {
    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: normalizePrivateKey(privateKey),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    this.sheetsApi = google.sheets({ version: "v4", auth });
    this.spreadsheetId = spreadsheetId;
  }

  private async readSheet(sheetName: string): Promise<string[][]> {
    const res = await this.sheetsApi.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A:Z`,
    });
    return (res.data.values as string[][]) ?? [];
  }

  private async appendRow(sheetName: string, row: (string | number | boolean | null)[]) {
    await this.sheetsApi.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A:A`,
      valueInputOption: "RAW",
      requestBody: { values: [row.map((v) => (v === null ? "" : v))] },
    });
  }

  private async updateRow(sheetName: string, rowNumber1Based: number, row: (string | number | boolean | null)[]) {
    await this.sheetsApi.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A${rowNumber1Based}:${columnLetter(row.length)}${rowNumber1Based}`,
      valueInputOption: "RAW",
      requestBody: { values: [row.map((v) => (v === null ? "" : v))] },
    });
  }

  private async deleteRow(sheetName: string, sheetId: number, rowNumber1Based: number) {
    await this.sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowNumber1Based - 1,
                endIndex: rowNumber1Based,
              },
            },
          },
        ],
      },
    });
  }

  private async getSheetId(sheetName: string): Promise<number> {
    const meta = await this.sheetsApi.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName);
    if (sheet?.properties?.sheetId == null) {
      throw new Error(`シート ${sheetName} が見つかりません`);
    }
    return sheet.properties.sheetId;
  }

  private rowToGroup(row: string[]): Group {
    return {
      groupId: row[0],
      inviteCode: row[1],
      inviteCodeExpiresAt: row[2],
      createdAt: row[3],
    };
  }

  private groupToRow(g: Group): string[] {
    return [g.groupId, g.inviteCode, g.inviteCodeExpiresAt, g.createdAt];
  }

  private rowToMember(row: string[]): Member {
    return {
      memberId: row[0],
      groupId: row[1],
      deviceId: row[2],
      name: row[3],
      showName: toBool(row[4]),
      status: (row[5] as PresenceStatus) || "away",
      statusUpdatedAt: row[6],
      homeLat: toNumberOrNull(row[7]),
      homeLng: toNumberOrNull(row[8]),
      homeRadiusM: toNumberOrNull(row[9]),
      notifyEnabled: row[10] === undefined ? true : toBool(row[10]),
      pushToken: row[11] || null,
      createdAt: row[12],
      buildingRadiusM: toNumberOrNull(row[13]),
      nearbyLabel: row[14] || NEARBY_LABEL_DEFAULT,
    };
  }

  private memberToRow(m: Member): (string | number | boolean)[] {
    return [
      m.memberId,
      m.groupId,
      m.deviceId,
      m.name,
      m.showName,
      m.status,
      m.statusUpdatedAt,
      m.homeLat ?? "",
      m.homeLng ?? "",
      m.homeRadiusM ?? "",
      m.notifyEnabled,
      m.pushToken ?? "",
      m.createdAt,
      m.buildingRadiusM ?? "",
      m.nearbyLabel,
    ];
  }

  private async findGroupRow(groupId: string): Promise<{ rowNumber: number; group: Group } | null> {
    const rows = await this.readSheet(GROUPS_SHEET);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === groupId) {
        return { rowNumber: i + 1, group: this.rowToGroup(rows[i]) };
      }
    }
    return null;
  }

  private async findGroupByInviteCode(inviteCode: string): Promise<{ rowNumber: number; group: Group } | null> {
    const rows = await this.readSheet(GROUPS_SHEET);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][1] === inviteCode) {
        return { rowNumber: i + 1, group: this.rowToGroup(rows[i]) };
      }
    }
    return null;
  }

  private async findMemberRow(memberId: string): Promise<{ rowNumber: number; member: Member } | null> {
    const rows = await this.readSheet(MEMBERS_SHEET);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === memberId) {
        return { rowNumber: i + 1, member: this.rowToMember(rows[i]) };
      }
    }
    return null;
  }

  async createGroup(deviceId: string, name: string) {
    const now = new Date();
    const group: Group = {
      groupId: cryptoRandomId(),
      inviteCode: await this.issueUniqueInviteCode(),
      inviteCodeExpiresAt: inviteCodeExpiryFrom(now),
      createdAt: now.toISOString(),
    };
    const member: Member = {
      memberId: cryptoRandomId(),
      groupId: group.groupId,
      deviceId,
      name: name.trim(),
      showName: true,
      status: "away",
      statusUpdatedAt: now.toISOString(),
      homeLat: null,
      homeLng: null,
      homeRadiusM: null,
      buildingRadiusM: null,
      nearbyLabel: NEARBY_LABEL_DEFAULT,
      notifyEnabled: true,
      pushToken: null,
      createdAt: now.toISOString(),
    };
    await this.appendRow(GROUPS_SHEET, this.groupToRow(group));
    await this.appendRow(MEMBERS_SHEET, this.memberToRow(member));
    return { group, member };
  }

  async joinGroup(deviceId: string, inviteCode: string, name: string) {
    const found = await this.findGroupByInviteCode(inviteCode);
    if (!found) throw new AppError("CODE_NOT_FOUND", "招待コードが見つかりません");
    if (new Date(found.group.inviteCodeExpiresAt).getTime() < Date.now()) {
      throw new AppError("CODE_EXPIRED", "招待コードの有効期限が切れています");
    }
    const existing = await this.getMemberByDeviceId(deviceId);
    if (existing) {
      throw new AppError("ALREADY_JOINED", "この端末は既に別のグループに参加しています");
    }
    const now = new Date();
    const member: Member = {
      memberId: cryptoRandomId(),
      groupId: found.group.groupId,
      deviceId,
      name: name.trim(),
      showName: true,
      status: "away",
      statusUpdatedAt: now.toISOString(),
      homeLat: null,
      homeLng: null,
      homeRadiusM: null,
      buildingRadiusM: null,
      nearbyLabel: NEARBY_LABEL_DEFAULT,
      notifyEnabled: true,
      pushToken: null,
      createdAt: now.toISOString(),
    };
    await this.appendRow(MEMBERS_SHEET, this.memberToRow(member));
    return { group: found.group, member };
  }

  async getGroup(groupId: string): Promise<Group | null> {
    const found = await this.findGroupRow(groupId);
    return found?.group ?? null;
  }

  async getMembersByGroup(groupId: string): Promise<Member[]> {
    const rows = await this.readSheet(MEMBERS_SHEET);
    return rows.slice(1).filter((r) => r[1] === groupId).map((r) => this.rowToMember(r));
  }

  async getMemberById(memberId: string): Promise<Member | null> {
    const found = await this.findMemberRow(memberId);
    return found?.member ?? null;
  }

  async getMemberByDeviceId(deviceId: string): Promise<Member | null> {
    const rows = await this.readSheet(MEMBERS_SHEET);
    const row = rows.slice(1).find((r) => r[2] === deviceId);
    return row ? this.rowToMember(row) : null;
  }

  private async requireOwnedMemberRow(memberId: string, deviceId: string) {
    const found = await this.findMemberRow(memberId);
    if (!found) throw new AppError("NOT_FOUND", "メンバーが見つかりません");
    if (found.member.deviceId !== deviceId) {
      throw new AppError("FORBIDDEN", "このメンバー情報を操作する権限がありません");
    }
    return found;
  }

  async updateHome(
    memberId: string,
    deviceId: string,
    homeLat: number,
    homeLng: number,
    homeRadiusM: number,
    buildingRadiusM: number
  ) {
    const { rowNumber, member } = await this.requireOwnedMemberRow(memberId, deviceId);
    member.homeLat = homeLat;
    member.homeLng = homeLng;
    member.homeRadiusM = homeRadiusM;
    member.buildingRadiusM = buildingRadiusM;
    await this.updateRow(MEMBERS_SHEET, rowNumber, this.memberToRow(member));
    return member;
  }

  async updateStatus(memberId: string, deviceId: string, status: PresenceStatus) {
    const { rowNumber, member } = await this.requireOwnedMemberRow(memberId, deviceId);
    member.status = status;
    member.statusUpdatedAt = new Date().toISOString();
    await this.updateRow(MEMBERS_SHEET, rowNumber, this.memberToRow(member));
    return member;
  }

  async updateProfile(
    memberId: string,
    deviceId: string,
    fields: { name?: string; showName?: boolean; nearbyLabel?: string }
  ) {
    const { rowNumber, member } = await this.requireOwnedMemberRow(memberId, deviceId);
    if (fields.name !== undefined) member.name = fields.name.trim();
    if (fields.showName !== undefined) member.showName = fields.showName;
    if (fields.nearbyLabel !== undefined) member.nearbyLabel = fields.nearbyLabel.trim();
    await this.updateRow(MEMBERS_SHEET, rowNumber, this.memberToRow(member));
    return member;
  }

  async updateNotify(memberId: string, deviceId: string, notifyEnabled: boolean) {
    const { rowNumber, member } = await this.requireOwnedMemberRow(memberId, deviceId);
    member.notifyEnabled = notifyEnabled;
    await this.updateRow(MEMBERS_SHEET, rowNumber, this.memberToRow(member));
    return member;
  }

  async updatePushToken(memberId: string, deviceId: string, pushToken: string) {
    const { rowNumber, member } = await this.requireOwnedMemberRow(memberId, deviceId);
    member.pushToken = pushToken;
    await this.updateRow(MEMBERS_SHEET, rowNumber, this.memberToRow(member));
    return member;
  }

  async refreshInviteCode(groupId: string, deviceId: string): Promise<Group> {
    const member = await this.getMemberByDeviceId(deviceId);
    if (!member || member.groupId !== groupId) {
      throw new AppError("FORBIDDEN", "このグループの招待コードを再発行する権限がありません");
    }
    const found = await this.findGroupRow(groupId);
    if (!found) throw new AppError("NOT_FOUND", "グループが見つかりません");
    const now = new Date();
    found.group.inviteCode = await this.issueUniqueInviteCode();
    found.group.inviteCodeExpiresAt = inviteCodeExpiryFrom(now);
    await this.updateRow(GROUPS_SHEET, found.rowNumber, this.groupToRow(found.group));
    return found.group;
  }

  async leaveGroup(memberId: string, deviceId: string): Promise<void> {
    const { rowNumber, member } = await this.requireOwnedMemberRow(memberId, deviceId);
    const membersSheetId = await this.getSheetId(MEMBERS_SHEET);
    await this.deleteRow(MEMBERS_SHEET, membersSheetId, rowNumber);
    const remaining = await this.getMembersByGroup(member.groupId);
    if (remaining.length === 0) {
      const found = await this.findGroupRow(member.groupId);
      if (found) {
        const groupsSheetId = await this.getSheetId(GROUPS_SHEET);
        await this.deleteRow(GROUPS_SHEET, groupsSheetId, found.rowNumber);
      }
    }
  }

  private async issueUniqueInviteCode(): Promise<string> {
    const rows = await this.readSheet(GROUPS_SHEET);
    const existing = new Set(rows.slice(1).map((r) => r[1]));
    let code = generateInviteCode();
    while (existing.has(code)) {
      code = generateInviteCode();
    }
    return code;
  }
}

function cryptoRandomId(): string {
  // Node 18+ globalThis.crypto.randomUUID を利用
  return globalThis.crypto?.randomUUID?.() ?? require("crypto").randomUUID();
}

function columnLetter(count: number): string {
  let n = count;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export { GROUPS_COLUMNS, MEMBERS_COLUMNS };
