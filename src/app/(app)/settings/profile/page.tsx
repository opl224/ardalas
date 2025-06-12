
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { UserCircle, Mail, Shield, Edit3, KeyRound } from "lucide-react";
import { roleDisplayNames } from "@/config/roles";
import type { Metadata } from 'next';
import Link from "next/link";

// Metadata tidak bisa diekspor dari client component secara langsung, 
// akan lebih baik jika diatur oleh layout induk jika diperlukan secara statis.
// export const metadata: Metadata = {
//   title: 'Profil Pengguna - SDN',
//   description: 'Lihat dan kelola informasi profil Anda.',
// };

export default function ProfilePage() {
  const { user, loading, role } = useAuth();

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "??";
    const names = name.split(" ");
    if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
    return (names[0][0] + names[names.length - 1][0]).toUpperCase();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardHeader className="items-center text-center">
            <Skeleton className="h-24 w-24 rounded-full mb-2" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Profil Pengguna</h1>
        <p className="text-muted-foreground">Anda harus login untuk melihat halaman ini.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">Profil Saya</h1>
        <p className="text-muted-foreground">Informasi akun Anda di sistem SDN.</p>
      </div>

      <Card className="max-w-2xl mx-auto bg-card/80 backdrop-blur-md border shadow-lg">
        <CardHeader className="items-center text-center pb-4 border-b">
           <Avatar className="h-24 w-24 mb-3 border-2 border-primary">
            <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User"} data-ai-hint="profile picture" />
            <AvatarFallback className="text-3xl">{getInitials(user.displayName)}</AvatarFallback>
          </Avatar>
          <CardTitle className="text-2xl font-semibold">{user.displayName || "Pengguna"}</CardTitle>
          {role && <CardDescription className="text-primary font-medium">{roleDisplayNames[role]}</CardDescription>}
        </CardHeader>
        <CardContent className="pt-6 space-y-5">
          <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-md">
            <UserCircle className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Nama Lengkap</p>
              <p className="font-medium">{user.displayName || "-"}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-md">
            <Mail className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{user.email || "-"}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-md">
            <Shield className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Peran</p>
              <p className="font-medium">{role ? roleDisplayNames[role] : "-"}</p>
            </div>
          </div>
          
          {user.role === 'siswa' && user.className && (
            <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-md">
              <School className="h-6 w-6 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Kelas</p>
                <p className="font-medium">{user.className}</p>
              </div>
            </div>
          )}

          <div className="pt-4 flex flex-col sm:flex-row gap-3">
            <Button variant="outline" className="w-full sm:w-auto">
                <Edit3 className="mr-2 h-4 w-4" /> Edit Profil
            </Button>
            <Button variant="outline" className="w-full sm:w-auto">
                <KeyRound className="mr-2 h-4 w-4" /> Ganti Password
            </Button>
          </div>
           <p className="text-xs text-muted-foreground text-center pt-2">
            Untuk perubahan data sensitif lainnya, silakan hubungi Administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
