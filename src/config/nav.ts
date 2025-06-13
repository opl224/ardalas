
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
} from "lucide-react";
import type { Role } from "./roles";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  roles?: Role[]; // Roles that can see this nav item. Undefined means all authenticated users.
  children?: NavItem[];
  label?: string; // Optional label for badges etc.
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
    href: "#", // Parent item, no direct link
    icon: Users,
    roles: ["admin", "guru"], // Diubah: Siswa tidak lagi melihat menu ini
    children: [
      { title: "Guru", href: "/teachers", icon: Users, roles: ["admin"] },
      { title: "Murid", href: "/students", icon: Users, roles: ["admin", "guru"] }, // Siswa akan mengakses daftar murid kelasnya via /my-class
      { title: "Orang Tua", href: "/parents", icon: UserCircle, roles: ["admin"] },
    ],
  },
  {
    title: "Akademik",
    href: "#", // Parent item
    icon: BookOpen,
    roles: ["admin", "guru", "siswa", "orangtua"],
    children: [
      { title: "Subjek", href: "/subjects", icon: BookOpen, roles: ["admin", "guru"] },
      { title: "Kelas", href: "/classes", icon: School, roles: ["admin", "guru"] },
      { title: "Kelas Saya", href: "/my-class", icon: School, roles: ["siswa"] },
      { title: "Pelajaran", href: "/lessons", icon: BookCopy, roles: ["admin", "guru", "siswa", "orangtua"] },
    ],
  },
  {
    title: "Tugas & Penilaian",
    href: "#", // Parent item
    icon: ClipboardCheck,
    roles: ["admin", "guru", "siswa", "orangtua"],
    children: [
      { title: "Ujian", href: "/exams", icon: FileText, roles: ["admin", "guru", "siswa", "orangtua"] },
      { title: "Tugas", href: "/assignments", icon: ClipboardCheck, roles: ["admin", "guru", "siswa", "orangtua"] },
      { title: "Hasil", href: "/results", icon: BarChart3, roles: ["admin", "guru", "siswa", "orangtua"] },
    ],
  },
  {
    title: "Kehidupan Sekolah",
    href: "#", // Parent item
    icon: CalendarDays,
    children: [
      { title: "Kehadiran", href: "/attendance", icon: CalendarCheck, roles: ["admin", "guru", "siswa"] },
      { title: "Acara Sekolah", href: "/events", icon: CalendarDays }, 
      { title: "Pesan", href: "/messages", icon: MessageSquare }, 
    ],
  },
  { 
    title: "Pengaturan", 
    href: "/settings", 
    icon: Settings,
    children: [
        { title: "Profil", href: "/settings/profile", icon: UserCircle },
    ]
  }, 
];

// bottomNavItems sekarang hanya untuk referensi, Pengaturan sudah dipindah
export const bottomNavItems: NavItem[] = [
    // Logout akan ditangani oleh tombol, bukan item nav langsung di daftar ini
];

