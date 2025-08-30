
export const ROLES = ["admin", "guru", "orangtua"] as const;
export type Role = (typeof ROLES)[number];

export const roleDisplayNames: Record<Role | "siswa", string> = {
  admin: "Admin",
  guru: "Guru",
  orangtua: "Orang Tua",
  siswa: "Siswa",
};
