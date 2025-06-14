
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Settings as SettingsIcon, User, Lock, Bell, Moon, Sun } from "lucide-react"; // Renamed to avoid conflict, added new icons
import type { Metadata } from 'next';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";

// Metadata tidak bisa diekspor dari client component secara langsung.
// Jika dibutuhkan secara statis, harus diatur di layout induk atau page.tsx induk jika ini adalah route group.
// export const metadata: Metadata = {
//   title: 'Pengaturan Akun - SDN',
//   description: 'Kelola pengaturan akun Anda di SDN.',
// };

export default function SettingsPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Efek untuk memuat tema dari localStorage saat komponen dimuat
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      setIsDarkMode(true);
    } else {
      document.documentElement.classList.remove("dark");
      setIsDarkMode(false);
    }
  }, []);

  const toggleDarkMode = () => {
    const newIsDarkMode = !isDarkMode;
    setIsDarkMode(newIsDarkMode);
    if (newIsDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">Pengaturan Akun</h1>
        <p className="text-muted-foreground">Kelola preferensi dan informasi akun Anda.</p>
      </div>

      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          {/* <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-primary" />
            <span>Preferensi Akun</span>
          </CardTitle>
          <CardDescription>
            Atur berbagai aspek akun Anda untuk pengalaman yang lebih personal.
          </CardDescription> */}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* <div>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              Profil Pengguna
            </h3>
            <p className="text-sm text-muted-foreground">
              Lihat dan perbarui informasi profil Anda seperti nama, foto, dan detail kontak. (Fitur ini akan segera hadir)
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              Keamanan Akun
            </h3>
            <p className="text-sm text-muted-foreground">
              Ubah kata sandi Anda secara berkala untuk menjaga keamanan akun. (Fitur ini akan segera hadir)
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <Bell className="h-5 w-5 text-muted-foreground" />
              Notifikasi
            </h3>
            <p className="text-sm text-muted-foreground">
              Atur preferensi notifikasi untuk pengumuman, tugas, dan acara penting lainnya. (Fitur ini akan segera hadir)
            </p>
          </div> */}
          
          <div className="border-t border-border pt-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                {isDarkMode ? <Moon className="h-5 w-5 text-muted-foreground" /> : <Sun className="h-5 w-5 text-muted-foreground" />}
                Tampilan Aplikasi
            </h3>
            <div className="flex items-center justify-between space-x-2 p-3 bg-muted/30 rounded-md">
                <Label htmlFor="dark-mode-toggle" className="flex flex-col space-y-1">
                    <span>Mode Gelap</span>
                    <span className="font-normal leading-snug text-muted-foreground text-xs">
                        Sesuaikan tampilan aplikasi dengan preferensi visual Anda.
                    </span>
                </Label>
                <Switch
                    id="dark-mode-toggle"
                    checked={isDarkMode}
                    onCheckedChange={toggleDarkMode}
                    aria-label="Toggle dark mode"
                />
            </div>
          </div>

          <div className="mt-8 p-6 border border-dashed border-border rounded-md text-center text-muted-foreground">
            <p className="font-semibold">Fitur Lainnya Segera Hadir!</p>
            <p className="text-xs">Kami terus berupaya meningkatkan pengalaman Anda.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
