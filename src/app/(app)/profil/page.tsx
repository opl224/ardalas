
"use client";

import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { User as UserIcon, Mail, Shield, AlertCircle, Edit } from "lucide-react";
import { roleDisplayNames } from "@/config/roles";
import LottieLoader from "@/components/ui/LottieLoader";
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
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { cn } from "@/lib/utils";


const availableAvatars = [
  "/avatars/opank1.png",
  "/avatars/laki-laki.png",
  "/avatars/perempuan.png",
];

export default function ProfilePage() {
  const { user, loading, role, refreshUser } = useAuth();
  const { toast } = useToast();
  
  const [isAvatarDialogOpen, setIsAvatarDialogOpen] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(user?.photoURL || null);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleAvatarUpdate = async () => {
    if (!user || !selectedAvatar) {
      toast({ title: "Error", description: "Avatar tidak dipilih.", variant: "destructive" });
      return;
    }
    if (user.photoURL === selectedAvatar) {
        setIsAvatarDialogOpen(false);
        return;
    }

    setIsUpdating(true);
    try {
      await updateProfile(user, { photoURL: selectedAvatar });
      await refreshUser(); 
      toast({ title: "Avatar Diperbarui", description: "Foto profil Anda berhasil diubah." });
      setIsAvatarDialogOpen(false);
    } catch (error) {
      console.error("Error updating avatar:", error);
      toast({ title: "Gagal Memperbarui Avatar", variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };


  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-1/2" />
        <Card>
          <CardHeader>
             <Skeleton className="h-6 w-1/3" />
             <Skeleton className="h-4 w-2/3 mt-2" />
          </CardHeader>
          <CardContent className="flex items-center justify-center p-8">
            <LottieLoader width={32} height={32} className="mr-2" />
            Memuat profil...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Profil</h1>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <AlertCircle className="w-12 h-12 mb-4 text-destructive" />
              <p className="font-semibold">Pengguna tidak ditemukan.</p>
              <p>Silakan login untuk melihat profil Anda.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const getInitials = (name: string | null | undefined) => {
    if (!name) return "??";
    const names = name.split(" ");
    if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
    return (names[0][0] + names[names.length - 1][0]).toUpperCase();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold font-headline">Profil Pengguna</h1>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="items-center text-center">
            <Dialog open={isAvatarDialogOpen} onOpenChange={setIsAvatarDialogOpen}>
                <div className="relative">
                    <Avatar className="h-24 w-24 mb-4">
                        <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User"} data-ai-hint="profile avatar"/>
                        <AvatarFallback className="text-3xl">{getInitials(user.displayName)}</AvatarFallback>
                    </Avatar>
                     <DialogTrigger asChild>
                        <Button variant="outline" size="icon" className="absolute bottom-4 -right-1 h-8 w-8 rounded-full">
                            <Edit className="h-4 w-4" />
                            <span className="sr-only">Ubah Avatar</span>
                        </Button>
                    </DialogTrigger>
                </div>
                 <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Pilih Avatar Baru</DialogTitle>
                        <DialogDescription>
                            Pilih salah satu gambar di bawah ini untuk dijadikan foto profil Anda.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 grid grid-cols-3 gap-4">
                        {availableAvatars.map(avatarPath => (
                            <button 
                                key={avatarPath} 
                                className={cn(
                                    "relative aspect-square w-full rounded-full overflow-hidden border-2 transition-all",
                                    selectedAvatar === avatarPath ? "border-primary ring-2 ring-primary ring-offset-2" : "border-transparent hover:border-primary/50"
                                )}
                                onClick={() => setSelectedAvatar(avatarPath)}
                            >
                                <Image src={avatarPath} alt={`Avatar option`} layout="fill" objectFit="cover" data-ai-hint="avatar picture"/>
                            </button>
                        ))}
                    </div>
                     <DialogFooter>
                        <DialogClose asChild><Button variant="outline" type="button">Batal</Button></DialogClose>
                        <Button onClick={handleAvatarUpdate} disabled={isUpdating}>
                            {isUpdating && <LottieLoader width={16} height={16} className="mr-2" />}
                            Simpan Perubahan
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <CardTitle className="text-2xl">{user.displayName || "Pengguna"}</CardTitle>
            <CardDescription>{role ? roleDisplayNames[role] : "Peran tidak diketahui"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="border-t border-border pt-4">
                <h3 className="text-lg font-semibold mb-2">Detail Akun</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                        <UserIcon className="h-5 w-5 text-muted-foreground shrink-0"/>
                        <div>
                            <p className="text-xs text-muted-foreground">Nama Lengkap</p>
                            <p className="font-medium">{user.displayName || "-"}</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                        <Mail className="h-5 w-5 text-muted-foreground shrink-0"/>
                        <div>
                            <p className="text-xs text-muted-foreground">Email</p>
                            <p className="font-medium">{user.email || "-"}</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                        <Shield className="h-5 w-5 text-muted-foreground shrink-0"/>
                        <div>
                            <p className="text-xs text-muted-foreground">Peran</p>
                            <p className="font-medium">{role ? roleDisplayNames[role] : "Tidak diketahui"}</p>
                        </div>
                    </div>
                </div>
            </div>
            {role === 'orangtua' && user.linkedStudentName && (
               <div className="border-t border-border pt-4">
                <h3 className="text-lg font-semibold mb-2">Informasi Anak</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                        <UserIcon className="h-5 w-5 text-muted-foreground shrink-0"/>
                        <div>
                            <p className="text-xs text-muted-foreground">Nama Anak</p>
                            <p className="font-medium">{user.linkedStudentName || "-"}</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                        <Shield className="h-5 w-5 text-muted-foreground shrink-0"/>
                        <div>
                            <p className="text-xs text-muted-foreground">Kelas Anak</p>
                            <p className="font-medium">{user.linkedStudentClassName || "-"}</p>
                        </div>
                    </div>
                </div>
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
