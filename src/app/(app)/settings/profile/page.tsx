
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { UserCircle, Mail, Shield, Edit3, Pencil, School, Check } from "lucide-react";
import { roleDisplayNames } from "@/config/roles";
import type { Metadata } from 'next';
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase/config";
import { updateProfile, type User as FirebaseUserType } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { cn } from "@/lib/utils";

// Metadata tidak bisa diekspor dari client component secara langsung, 
// akan lebih baik jika diatur oleh layout induk jika diperlukan secara statis.
// export const metadata: Metadata = {
//   title: 'Profil Pengguna - SDN',
//   description: 'Lihat dan kelola informasi profil Anda.',
// };

const localAvatars = [
    { src: '/avatars/laki-laki.png', hint: 'avatar male', alt: 'Avatar Laki-laki'},
    { src: '/avatars/perempuan.png', hint: 'avatar female', alt: 'Avatar Perempuan' },
    { src: '/avatars/l-guru.png', hint: 'teacher male avatar', alt: 'Avatar Guru Laki-laki' },
    { src: '/avatars/p-guru.png', hint: 'teacher female avatar', alt: 'Avatar Guru Perempuan' },
    { src: '/avatars/l-dokter.png', hint: 'doctor male avatar', alt: 'Avatar Dokter Laki-laki' },
    { src: '/avatars/p-dokter.png', hint: 'doctor female avatar', alt: 'Avatar Dokter Perempuan' },
    { src: '/avatars/l-polisi.png', hint: 'police male avatar', alt: 'Avatar Polisi Laki-laki' },
    { src: '/avatars/p-polisi.png', hint: 'police female avatar', alt: 'Avatar Polisi Perempuan' },
    { src: '/avatars/messi.png', hint: 'football player avatar', alt: 'Avatar Messi' },
    { src: '/avatars/ronaldo.png', hint: 'soccer player avatar', alt: 'Avatar Ronaldo' },
    { src: '/avatars/l-pemadam.png', hint: 'firefighter male avatar', alt: 'Avatar Pemadam Laki-laki' },
    { src: '/avatars/p-pemadam.png', hint: 'firefighter female avatar', alt: 'Avatar Pemdam Perempuan' },
    { src: '/avatars/l-sains.png', hint: 'Sains female avatar', alt: 'Avatar Sains Laki-laki' },
    { src: '/avatars/p-sains.png', hint: 'Sains female avatar', alt: 'Avatar Sains Perempuan' },
];


export default function ProfilePage() {
  const { user, loading, role, refreshUser } = useAuth(); 
  const { toast } = useToast();
  const [isAvatarDialogOpen, setIsAvatarDialogOpen] = useState(false);
  const [selectedAvatarUrlInDialog, setSelectedAvatarUrlInDialog] = useState<string | null>(null);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);

  useEffect(() => {
    if (user?.photoURL) {
      setSelectedAvatarUrlInDialog(user.photoURL);
    } else if (localAvatars.length > 0) {
      // If user has no photoURL, select the first local avatar as default in dialog
      setSelectedAvatarUrlInDialog(localAvatars[0].src);
    } else {
      setSelectedAvatarUrlInDialog(null);
    }
  }, [user?.photoURL]);


  const getInitials = (name: string | null | undefined) => {
    if (!name) return "??";
    const names = name.split(" ");
    if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
    return (names[0][0] + names[names.length - 1][0]).toUpperCase();
  };

  const handleAvatarSelect = (avatarUrl: string) => {
    setSelectedAvatarUrlInDialog(avatarUrl);
  };

  const handleSaveAvatar = async () => {
    if (!selectedAvatarUrlInDialog || !user || !auth.currentUser) {
      toast({ title: "Gagal", description: "Tidak ada avatar dipilih atau pengguna tidak ditemukan.", variant: "destructive" });
      return;
    }
    setIsUpdatingAvatar(true);
    try {
      await updateProfile(auth.currentUser as FirebaseUserType, { photoURL: selectedAvatarUrlInDialog });
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, { photoURL: selectedAvatarUrlInDialog });
      
      if (refreshUser) {
        await refreshUser(); // Call refreshUser to update context
      }
      
      toast({ title: "Sukses", description: "Avatar berhasil diperbarui." });
      setIsAvatarDialogOpen(false);
    } catch (error) {
      console.error("Error updating avatar:", error);
      toast({ title: "Error", description: "Gagal memperbarui avatar.", variant: "destructive" });
    } finally {
      setIsUpdatingAvatar(false);
    }
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
          <div className="relative group">
            <Avatar className="h-24 w-24 mb-3 border-2 border-primary group-hover:opacity-80 transition-opacity">
              <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User"} data-ai-hint="profile picture" />
              <AvatarFallback className="text-3xl bg-muted">{getInitials(user.displayName)}</AvatarFallback>
            </Avatar>
            <Dialog open={isAvatarDialogOpen} onOpenChange={(open) => {
              setIsAvatarDialogOpen(open);
              // Reset selection to current user's avatar or first local if dialog closes
              if (!open) setSelectedAvatarUrlInDialog(user.photoURL || (localAvatars.length > 0 ? localAvatars[0].src : null)); 
            }}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute bottom-2 right-0 transform translate-x-1/4 translate-y-1/4 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-background hover:bg-muted"
                  aria-label="Ubah avatar"
                  onClick={() => setIsAvatarDialogOpen(true)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Pilih Avatar Baru</DialogTitle>
                  <DialogDescription>
                    Klik pada salah satu avatar di bawah ini untuk memilihnya. Pastikan gambar tersedia di folder public/avatars.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 py-4 max-h-[60vh] overflow-y-auto">
                  {localAvatars.map((avatar) => (
                    <button
                      key={avatar.src}
                      onClick={() => handleAvatarSelect(avatar.src)}
                      className={cn(
                        "relative aspect-square rounded-full overflow-hidden border-2 transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                        selectedAvatarUrlInDialog === avatar.src ? "border-primary ring-2 ring-primary ring-offset-2" : "border-transparent hover:border-primary/50"
                      )}
                      aria-label={`Pilih ${avatar.alt}`}
                    >
                      <Image src={avatar.src} alt={avatar.alt} layout="fill" objectFit="cover" data-ai-hint={avatar.hint}/>
                      {selectedAvatarUrlInDialog === avatar.src && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Check className="h-8 w-8 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Batal</Button></DialogClose>
                  <Button onClick={handleSaveAvatar} disabled={isUpdatingAvatar || !selectedAvatarUrlInDialog || selectedAvatarUrlInDialog === user.photoURL}>
                    {isUpdatingAvatar ? "Menyimpan..." : "Simpan Avatar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
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
           <p className="text-xs text-muted-foreground text-center pt-2">
            Untuk perubahan data sensitif lainnya, silakan hubungi Administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

