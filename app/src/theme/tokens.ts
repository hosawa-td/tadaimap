/**
 * Google Stitchで作成した「Warm Hearth Presence」デザインシステムのトークン。
 * 設計書/stitch_export/stitch_/warm_hearth_presence/DESIGN.md を参照。
 */
export const colors = {
  background: "#FDF8F0",
  surface: "#FFFFFF",
  surfaceSand: "#F5E6D3",
  primary: "#182430",
  onPrimary: "#FFFFFF",
  accent: "#D9920A",
  onAccent: "#FFFFFF",
  home: "#4A7C59",
  homeSoft: "rgba(74, 124, 89, 0.12)",
  nearby: "#B9770E",
  nearbySoft: "rgba(217, 146, 10, 0.14)",
  away: "#7D8A99",
  awaySoft: "rgba(125, 138, 153, 0.15)",
  textPrimary: "#1D1C17",
  textSecondary: "#44474B",
  textFaint: "#7D8A99",
  border: "#E7E2DA",
  danger: "#BA1A1A",
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const typography = {
  headlineLg: { fontSize: 30, fontWeight: "700" as const },
  headlineMd: { fontSize: 24, fontWeight: "700" as const },
  headlineSm: { fontSize: 20, fontWeight: "600" as const },
  titleLg: { fontSize: 18, fontWeight: "700" as const },
  titleMd: { fontSize: 16, fontWeight: "600" as const },
  bodyLg: { fontSize: 16, fontWeight: "400" as const },
  bodyMd: { fontSize: 14, fontWeight: "400" as const },
  bodySm: { fontSize: 12, fontWeight: "400" as const },
  labelLg: { fontSize: 14, fontWeight: "700" as const },
} as const;
