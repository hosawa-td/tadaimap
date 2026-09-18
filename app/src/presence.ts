import { MemberView } from "./api";

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatStatusLine(member: MemberView): string {
  const time = formatTime(member.statusUpdatedAt);
  return member.status === "home" ? `在宅 · ${time}に帰宅` : `外出中 · ${time}に外出`;
}

export function countHome(members: MemberView[]): { home: number; total: number } {
  return {
    home: members.filter((m) => m.status === "home").length,
    total: members.length,
  };
}

export function summaryText(members: MemberView[]): string {
  const { home, total } = countHome(members);
  return `現在${home}/${total}人 在宅中`;
}
