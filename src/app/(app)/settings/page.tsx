
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Settings as SettingsIcon, User, Lock, Bell, Moon, Sun } from "lucide-react"; 
import type { Metadata } from 'next';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";

export default function SettingsPage() {
  // Initialize state by reading from localStorage, defaulting to false (light mode)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark";
    }
    return false; 
  });

  // Effect to update the class on documentElement when isDarkMode changes locally
  // This is mostly for immediate visual feedback of the toggle switch itself.
  // The global theme application is handled by AuthProvider.
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);


  const toggleDarkMode = () => {
    const newIsDarkMode = !isDarkMode;
    setIsDarkMode(newIsDarkMode); // Update local state for the switch
    if (newIsDarkMode) {
      document.documentElement.classList.add("dark"); // Directly apply for instant feedback
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark"); // Directly apply for instant feedback
      localStorage.setItem("theme", "light");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">Pengaturan Akun</h1>
        <p className="text-muted-foreground">Kelola preferensi dan informasi akun anda.</p>
      </div>

      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          {/* <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-primary" />
            <span>Preferensi Akun</span>
          </CardTitle>
          <CardDescription>
            Atur berbagai aspek akun anda untuk pengalaman yang lebih personal.
          </CardDescription> */}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* <div>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              Profil Pengguna
            </h3>
            <p className="text-sm text-muted-foreground">
              Lihat dan perbarui informasi profil anda seperti nama, foto, dan detail kontak. (Fitur ini akan segera hadir)
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              Keamanan Akun
            </h3>
            <p className="text-sm text-muted-foreground">
              Ubah kata sandi anda secara berkala untuk menjaga keamanan akun. (Fitur ini akan segera hadir)
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
                        Sesuaikan tampilan aplikasi dengan preferensi visual.
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
        </CardContent>
      </Card>
    </div>
  );
}
