export const ROLES = ["admin", "guru", "siswa", "orangtua"] as const;
export type Role = (typeof ROLES)[number];

export const roleDisplayNames: Record<Role, string> = {
  admin: "Admin",
  guru: "Guru",
  