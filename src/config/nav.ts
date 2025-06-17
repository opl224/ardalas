
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Megaphone,
  Users,
  UserCircle,
  BookOpen,
  School,
  BookCopy,
  FileText,
  ClipboardCheck,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  MessageSquare,
  Settings,
  UserCog,
  GraduationCap, 
} from "lucide-react";
import type { Role } from "./roles";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  roles?: Role[]; 
  children?: NavItem[];
  label?: string; 
}

export const navItems: NavItem[] = [
  { title: "Beranda", href: "/dashboard", icon: LayoutDashboard },
  { title: "Pengumuman", href: "/announcements", icon: Megaphone },
  { 
    title: "Administrasi Pengguna",
    href: "/admin/user-administration", 
    icon: UserCog,
    roles: ["admin"], 
  },
  {
    title: "Pengguna",
    href: "#", 
    icon: Users,
    roles: ["admin", "guru"], 
    children: [
      { title: "Guru", href: "/teachers", icon: Users, roles: ["admin"] },
      { title: "Murid", href: "/students", icon: Users, roles: ["admin", "guru"] }, 
      { title: "Orang Tua", href: "/parents", icon: UserCircle, roles: ["admin", "guru"] },
    ],
  },
  {
    title: "Akademik",
    href: "#", 
    icon: BookOpen,
    roles: ["admin", "guru", "siswa", "orangtua"],
    children: [
      { title: "Subjek", href: "/subjects", icon: BookOpen, roles: ["admin", "guru"] },
      { title: "Kelas", href: "/classes", icon: School, roles: ["admin", "guru"] },
      { title: "Kelas Anak", href: "/classes", icon: School, roles: ["orangtua"] },
      { title: "Kelas Saya", href: "/my-class", icon: School, roles: ["siswa"] },
      { title: "Pelajaran", href: "/lessons", icon: BookCopy, roles: ["admin", "guru", "siswa", "orangtua"] },
      { title: "Kehadiran", href: "/attendance", icon: CalendarCheck, roles: ["admin", "guru", "siswa", "orangtua"] },
    ],
  },
  {
    title: "Tugas & Penilaian",
    href: "#", 
    icon: ClipboardCheck,
    roles: ["admin", "guru", "siswa", "orangtua"],
    children: [
      { title: "Ujian", href: "/exams", icon: FileText, roles: ["admin", "guru", "siswa", "orangtua"] },
      { title: "Tugas", href: "/assignments", icon: ClipboardCheck, roles: ["admin", "guru", "siswa", "orangtua"] },
      { title: "Nilai Tugas", href: "/my-grades", icon: GraduationCap, roles: ["siswa", "orangtua"]},
      { title: "Hasil", href: "/results", icon: BarChart3, roles: ["admin", "guru"] },
    ],
  },
  // Menu "Kehidupan Sekolah" dihapus dari sini
  { 
    title: "Pengaturan", 
    href: "/settings", 
    icon: Settings,
  }, 
];

export const bottomNavItems: NavItem[] = [
    
];

