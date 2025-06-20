
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { UserCircle, Mail, Shield, Edit3, Pencil, School, Check, LinkIcon, Info, UserSquare2, Briefcase, Users as UsersIcon } from "lucide-react"; // Added Briefcase, UsersIcon
import LottieLoader from "@/components/ui/LottieLoader";
import { roleDisplayNames } from "@/config/roles";
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
import { doc, getDoc, Timestamp, updateDoc, query, collection, where, getDocs, limit, writeBatch } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm, type SubmitHandler, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

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

interface DetailedStudentData {
  name?: string;
  nis?: string;
  email?: string;
  className?: string;
  dateOfBirth?: Timestamp;
  gender?: "laki-laki" | "perempuan";
  address?: string;
  parentName?: string;
  attendanceNumber?: number;
  createdAt?: Timestamp;
}

interface DetailedParentData {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  gender?: "laki-laki" | "perempuan";
  studentName?: string; // From parents collection
  studentClassName?: string; // To be fetched or derived
  createdAt?: Timestamp; // From parents collection
}

interface DetailedTeacherData {
  name?: string;
  email?: string;
  subject?: string;
  phone?: string;
  address?: string;
  gender?: "laki-laki" | "perempuan";
  createdAt?: Timestamp; // From teachers collection
}


const GENDERS_OPTIONS = ["laki-laki", "perempuan"] as const;

const adminDetailFormSchema = z.object({
  phone: z.string().min(9, { message: "Nomor telepon minimal 9 digit." }).optional().or(z.literal("")),
  gender: z.enum(GENDERS_OPTIONS, { errorMap: () => ({ message: "Pilih jenis kelamin yang valid."}) }).optional(),
  address: z.string().trim().optional(),
});
type AdminDetailFormValues = z.infer<typeof adminDetailFormSchema>;


export default function ProfilePage() {
  const { user, loading, role, refreshUser } = useAuth();
  const { toast } = useToast();
  const [isAvatarDialogOpen, setIsAvatarDialogOpen] = useState(false);
  const [selectedAvatarUrlInDialog, setSelectedAvatarUrlInDialog] = useState<string | null>(null);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);

  const [isStudentDetailDialogOpen, setIsStudentDetailDialogOpen] = useState(false);
  const [detailedStudentData, setDetailedStudentData] = useState<DetailedStudentData | null>(null);
  const [isLoadingStudentDetail, setIsLoadingStudentDetail] = useState(false);

  const [isParentDetailDialogOpen, setIsParentDetailDialogOpen] = useState(false);
  const [detailedParentData, setDetailedParentData] = useState<DetailedParentData | null>(null);
  const [isLoadingParentDetail, setIsLoadingParentDetail] = useState(false);

  const [isTeacherDetailDialogOpen, setIsTeacherDetailDialogOpen] = useState(false);
  const [detailedTeacherData, setDetailedTeacherData] = useState<DetailedTeacherData | null>(null);
  const [isLoadingTeacherDetail, setIsLoadingTeacherDetail] = useState(false);

  const [isEditNameDialogOpen, setIsEditNameDialogOpen] = useState(false);
  const [newName, setNewName] = useState(user?.displayName || "");
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  const [isAdminDetailDialogOpen, setIsAdminDetailDialogOpen] = useState(false);
  const [adminDetails, setAdminDetails] = useState<{ phone?: string; gender?: "laki-laki" | "perempuan"; address?: string; } | null>(null);
  const [isLoadingAdminDetails, setIsLoadingAdminDetails] = useState(false);
  const [isUpdatingAdminDetails, setIsUpdatingAdminDetails] = useState(false);

  const adminDetailForm = useForm<AdminDetailFormValues>({
    resolver: zodResolver(adminDetailFormSchema),
    defaultValues: {
      phone: "",
      gender: undefined,
      address: "",
    },
  });


  useEffect(() => {
    if (user?.photoURL) {
      setSelectedAvatarUrlInDialog(user.photoURL);
    } else if (localAvatars.length > 0) {
      if (!localAvatars.some(avatar => avatar.src === user?.photoURL)) {
         setSelectedAvatarUrlInDialog(localAvatars[0].src);
      } else {
         setSelectedAvatarUrlInDialog(user?.photoURL || localAvatars[0].src);
      }
    } else {
      setSelectedAvatarUrlInDialog(null);
    }
  }, [user?.photoURL]);

  useEffect(() => {
    if (user?.displayName) {
      setNewName(user.displayName);
    }
  }, [user?.displayName]);

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
        await refreshUser();
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

  const fetchDetailedStudentData = async () => {
    if (!user || role !== 'siswa') return;
    setIsLoadingStudentDetail(true);
    try {
      const studentDocRef = doc(db, "users", user.uid);
      const studentDocSnap = await getDoc(studentDocRef);
      if (studentDocSnap.exists()) {
        const data = studentDocSnap.data();
        setDetailedStudentData({
          name: data.name,
          nis: data.nis,
          email: data.email,
          className: data.className,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          address: data.address,
          parentName: data.parentName,
          attendanceNumber: data.attendanceNumber,
          createdAt: data.createdAt,
        });
      } else {
        toast({ title: "Data Tidak Ditemukan", description: "Detail data siswa tidak ditemukan.", variant: "destructive" });
        setDetailedStudentData(null);
      }
    } catch (error) {
      console.error("Error fetching detailed student data:", error);
      toast({ title: "Error", description: "Gagal memuat detail data siswa.", variant: "destructive" });
      setDetailedStudentData(null);
    } finally {
      setIsLoadingStudentDetail(false);
    }
  };

  const handleOpenStudentDetailDialog = () => {
    fetchDetailedStudentData();
    setIsStudentDetailDialogOpen(true);
  };

  const fetchDetailedParentData = async () => {
    if (!user || role !== 'orangtua') return;
    setIsLoadingParentDetail(true);
    try {
      const parentQuery = query(collection(db, "parents"), where("uid", "==", user.uid), limit(1));
      const parentSnapshot = await getDocs(parentQuery);
      if (!parentSnapshot.empty) {
        const parentData = parentSnapshot.docs[0].data();
        const dataToSet: DetailedParentData = {
          name: parentData.name,
          email: parentData.email,
          phone: parentData.phone,
          address: parentData.address,
          gender: parentData.gender,
          studentName: parentData.studentName,
          createdAt: parentData.createdAt,
        };
        // Use existing info from AuthContext if available for child's class name
        dataToSet.studentClassName = user.linkedStudentClassName || user.linkedStudentClassId || "Tidak Diketahui";
        setDetailedParentData(dataToSet);
      } else {
        toast({ title: "Data Tidak Ditemukan", description: "Profil orang tua tidak ditemukan.", variant: "destructive" });
        setDetailedParentData(null);
      }
    } catch (error) {
      console.error("Error fetching detailed parent data:", error);
      toast({ title: "Error", description: "Gagal memuat detail data orang tua.", variant: "destructive" });
      setDetailedParentData(null);
    } finally {
      setIsLoadingParentDetail(false);
    }
  };

  const handleOpenParentDetailDialog = () => {
    fetchDetailedParentData();
    setIsParentDetailDialogOpen(true);
  };

  const fetchDetailedTeacherData = async () => {
    if (!user || role !== 'guru') return;
    setIsLoadingTeacherDetail(true);
    try {
      const teacherQuery = query(collection(db, "teachers"), where("uid", "==", user.uid), limit(1));
      const teacherSnapshot = await getDocs(teacherQuery);
      if (!teacherSnapshot.empty) {
        const teacherData = teacherSnapshot.docs[0].data();
        setDetailedTeacherData({
          name: teacherData.name,
          email: teacherData.email,
          subject: teacherData.subject,
          phone: teacherData.phone,
          address: teacherData.address,
          gender: teacherData.gender,
          createdAt: teacherData.createdAt,
        });
      } else {
        toast({ title: "Data Tidak Ditemukan", description: "Profil guru tidak ditemukan.", variant: "destructive" });
        setDetailedTeacherData(null);
      }
    } catch (error) {
      console.error("Error fetching detailed teacher data:", error);
      toast({ title: "Error", description: "Gagal memuat detail data guru.", variant: "destructive" });
      setDetailedTeacherData(null);
    } finally {
      setIsLoadingTeacherDetail(false);
    }
  };

  const handleOpenTeacherDetailDialog = () => {
    fetchDetailedTeacherData();
    setIsTeacherDetailDialogOpen(true);
  };

  const handleSaveName = async () => {
    if (!user || !auth.currentUser) {
      toast({ title: "Gagal", description: "Pengguna tidak ditemukan.", variant: "destructive" });
      return;
    }
    if (!newName.trim() || newName.trim().length < 3) {
      toast({ title: "Nama Tidak Valid", description: "Nama minimal 3 karakter.", variant: "destructive" });
      return;
    }
    setIsUpdatingName(true);
    const batch = writeBatch(db);
    try {
      await updateProfile(auth.currentUser, { displayName: newName.trim() });

      const userDocRef = doc(db, "users", user.uid);
      batch.update(userDocRef, { name: newName.trim() });

      if (role === 'guru') {
        const teacherProfileQuery = query(collection(db, "teachers"), where("uid", "==", user.uid), limit(1));
        const teacherProfileSnapshot = await getDocs(teacherProfileQuery);
        if (!teacherProfileSnapshot.empty) {
          const teacherDocRef = teacherProfileSnapshot.docs[0].ref;
          batch.update(teacherDocRef, { name: newName.trim() });
        }
      }
      
      await batch.commit();

      if (refreshUser) {
        await refreshUser();
      }
      toast({ title: "Sukses", description: "Nama berhasil diperbarui." });
      setIsEditNameDialogOpen(false);
    } catch (error) {
      console.error("Error updating name:", error);
      toast({ title: "Error", description: "Gagal memperbarui nama.", variant: "destructive" });
    } finally {
      setIsUpdatingName(false);
    }
  };

  const fetchAdminDetails = async () => {
    if (!user || role !== 'admin') return;
    setIsLoadingAdminDetails(true);
    try {
      const adminDocRef = doc(db, "users", user.uid);
      const adminDocSnap = await getDoc(adminDocRef);
      if (adminDocSnap.exists()) {
        const data = adminDocSnap.data();
        const details = {
          phone: data.phone || "",
          gender: data.gender as "laki-laki" | "perempuan" | undefined,
          address: data.address || "",
        };
        setAdminDetails(details);
        adminDetailForm.reset(details);
      } else {
        toast({ title: "Data Tidak Ditemukan", description: "Detail data admin tidak ditemukan.", variant: "destructive" });
        setAdminDetails(null);
        adminDetailForm.reset({ phone: "", gender: undefined, address: "" });
      }
    } catch (error) {
      console.error("Error fetching admin details:", error);
      toast({ title: "Error", description: "Gagal memuat detail data admin.", variant: "destructive" });
      setAdminDetails(null);
      adminDetailForm.reset({ phone: "", gender: undefined, address: "" });
    } finally {
      setIsLoadingAdminDetails(false);
    }
  };

  const handleOpenAdminDetailDialog = () => {
    fetchAdminDetails();
    setIsAdminDetailDialogOpen(true);
  };

  const handleSaveAdminDetails: SubmitHandler<AdminDetailFormValues> = async (data) => {
    if (!user || role !== 'admin') {
      toast({ title: "Aksi Ditolak", variant: "destructive" });
      return;
    }
    setIsUpdatingAdminDetails(true);
    try {
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, {
        phone: data.phone || null,
        gender: data.gender || null,
        address: data.address || null,
      });
      toast({ title: "Sukses", description: "Detail admin berhasil diperbarui." });
      setAdminDetails(data); 
      if (refreshUser) await refreshUser(); 
      setIsAdminDetailDialogOpen(false);
    } catch (error) {
      console.error("Error updating admin details:", error);
      toast({ title: "Error", description: "Gagal memperbarui detail admin.", variant: "destructive" });
    } finally {
      setIsUpdatingAdminDetails(false);
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
        <p className="text-muted-foreground">Informasi akun Anda di sistem Ardalas.</p>
      </div>

      <Card className="max-w-2xl mx-auto bg-card/80 backdrop-blur-md border shadow-lg">
        <CardHeader className="items-center text-center pb-4 border-b">
          <div className="relative">
            <Avatar className="h-24 w-24 mb-3 border-2 border-accent transition-opacity">
              <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User"} data-ai-hint="profile picture" />
              <AvatarFallback className="text-3xl bg-muted">{getInitials(user.displayName)}</AvatarFallback>
            </Avatar>
            <Dialog open={isAvatarDialogOpen} onOpenChange={(open) => {
              setIsAvatarDialogOpen(open);
              if (!open) setSelectedAvatarUrlInDialog(user.photoURL || (localAvatars.length > 0 ? localAvatars[0].src : null));
            }}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute bottom-2 right-0 transform translate-x-1/4 translate-y-1/4 h-8 w-8 rounded-full transition-opacity bg-background hover:bg-muted"
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
                    Klik pada salah satu avatar di bawah ini untuk memilihnya.
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
                    {isUpdatingAvatar && <LottieLoader width={16} height={16} className="mr-2" />}
                    {isUpdatingAvatar ? "Menyimpan..." : "Simpan Avatar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <CardTitle className="text-2xl font-semibold flex items-center gap-2">
            {user.displayName || "Pengguna"}
            {role === 'guru' && (
                <Dialog open={isEditNameDialogOpen} onOpenChange={setIsEditNameDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label="Edit Nama">
                            <Edit3 className="h-4 w-4 text-muted-foreground hover:text-primary"/>
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Edit Nama Lengkap</DialogTitle>
                            <DialogDescription>
                                Masukkan nama lengkap baru Anda.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4 space-y-2">
                            <Label htmlFor="edit-name-input">Nama Baru</Label>
                            <Input
                                id="edit-name-input"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Nama Lengkap Baru"
                            />
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button variant="outline">Batal</Button></DialogClose>
                            <Button onClick={handleSaveName} disabled={isUpdatingName || !newName.trim() || newName.trim() === user.displayName}>
                                {isUpdatingName && <LottieLoader width={16} height={16} className="mr-2"/>}
                                {isUpdatingName ? "Menyimpan..." : "Simpan Nama"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
          </CardTitle>
          {role && (
            <CardDescription className="text-primary font-medium">
              {roleDisplayNames[role]}
              {role === 'orangtua' && user.linkedStudentName && (
                <span className="block text-sm text-muted-foreground mt-0.5">
                  (Orang Tua dari: {user.linkedStudentName})
                </span>
              )}
            </CardDescription>
          )}
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
          {user.role === 'orangtua' && user.linkedStudentId && (
             <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-md">
                <LinkIcon className="h-6 w-6 text-muted-foreground" />
                <div>
                    <p className="text-xs text-muted-foreground">Anak Terhubung</p>
                    <p className="font-medium">
                        {user.linkedStudentName || "Nama Siswa Tidak Ada"}
                        {user.linkedStudentClassName ? ` - Kelas: ${user.linkedStudentClassName}` : (user.linkedStudentClassId ? ` - Kelas: ${user.linkedStudentClassId}` : " - Kelas Tidak Ada")}
                    </p>
                </div>
            </div>
          )}

          {role === 'siswa' && (
            <Button onClick={handleOpenStudentDetailDialog} variant="outline" className="w-full mt-4">
                <UserSquare2 className="mr-2 h-4 w-4" />
                Lihat Detail Data Saya
            </Button>
          )}
          {role === 'orangtua' && (
            <Button onClick={handleOpenParentDetailDialog} variant="outline" className="w-full mt-4">
                <UsersIcon className="mr-2 h-4 w-4" />
                Lihat Detail Data Saya
            </Button>
          )}
          {role === 'guru' && (
             <Button onClick={handleOpenTeacherDetailDialog} variant="outline" className="w-full mt-4">
                <Briefcase className="mr-2 h-4 w-4" />
                Lihat Detail Data Saya
            </Button>
          )}
          {role === 'admin' && (
            <Button onClick={handleOpenAdminDetailDialog} variant="outline" className="w-full mt-4">
                <UserSquare2 className="mr-2 h-4 w-4" />
                Lihat Detail Admin Saya
            </Button>
          )}

           <p className="text-xs text-muted-foreground text-center pt-2">
            Untuk perubahan data sensitif lainnya, silakan hubungi Administrator.
          </p>
        </CardContent>
      </Card>

      <Dialog open={isStudentDetailDialogOpen} onOpenChange={setIsStudentDetailDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail Data Siswa</DialogTitle>
            <DialogDescription>
              Informasi lengkap mengenai data diri Anda sebagai siswa.
            </DialogDescription>
          </DialogHeader>
          {isLoadingStudentDetail ? (
            <div className="flex justify-center items-center py-8">
                <LottieLoader width={48} height={48} />
                <span className="ml-2">Memuat data detail...</span>
            </div>
          ) : detailedStudentData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2 text-sm">
              <div><Label className="text-muted-foreground">Nama Lengkap:</Label><p className="font-medium">{detailedStudentData.name || "-"}</p></div>
              <div><Label className="text-muted-foreground">NIS:</Label><p className="font-medium">{detailedStudentData.nis || "-"}</p></div>
              <div><Label className="text-muted-foreground">Email:</Label><p className="font-medium">{detailedStudentData.email || "-"}</p></div>
              <div><Label className="text-muted-foreground">Kelas:</Label><p className="font-medium">{detailedStudentData.className || "-"}</p></div>
              <div><Label className="text-muted-foreground">Nomor Absen:</Label><p className="font-medium">{detailedStudentData.attendanceNumber ?? "-"}</p></div>
              <div>
                <Label className="text-muted-foreground">Tanggal Lahir:</Label>
                <p className="font-medium">
                  {detailedStudentData.dateOfBirth ? format(detailedStudentData.dateOfBirth.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale }) : "-"}
                </p>
              </div>
              <div><Label className="text-muted-foreground">Jenis Kelamin:</Label><p className="font-medium capitalize">{detailedStudentData.gender || "-"}</p></div>
              <div><Label className="text-muted-foreground">Orang Tua Terhubung:</Label><p className="font-medium">{detailedStudentData.parentName || "-"}</p></div>
              <div className="md:col-span-2"><Label className="text-muted-foreground">Alamat:</Label><p className="font-medium whitespace-pre-line">{detailedStudentData.address || "-"}</p></div>
              {detailedStudentData.createdAt && (
                <div className="md:col-span-2">
                  <Label className="text-muted-foreground">Tanggal Profil Dibuat:</Label>
                  <p className="font-medium">{format(detailedStudentData.createdAt.toDate(), "dd MMMM yyyy, HH:mm", { locale: indonesiaLocale })}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
                <Info className="mx-auto h-10 w-10 mb-2" />
                Tidak dapat memuat detail data siswa.
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Tutup</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isParentDetailDialogOpen} onOpenChange={setIsParentDetailDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail Data Orang Tua</DialogTitle>
            <DialogDescription>
              Informasi lengkap mengenai data diri Anda sebagai orang tua.
            </DialogDescription>
          </DialogHeader>
          {isLoadingParentDetail ? (
            <div className="flex justify-center items-center py-8">
                <LottieLoader width={48} height={48} />
                <span className="ml-2">Memuat data detail...</span>
            </div>
          ) : detailedParentData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2 text-sm">
              <div><Label className="text-muted-foreground">Nama Lengkap:</Label><p className="font-medium">{detailedParentData.name || "-"}</p></div>
              <div><Label className="text-muted-foreground">Email:</Label><p className="font-medium">{detailedParentData.email || "-"}</p></div>
              <div><Label className="text-muted-foreground">Nomor Telepon:</Label><p className="font-medium">{detailedParentData.phone || "-"}</p></div>
              <div><Label className="text-muted-foreground">Jenis Kelamin:</Label><p className="font-medium capitalize">{detailedParentData.gender || "-"}</p></div>
              <div className="md:col-span-2"><Label className="text-muted-foreground">Alamat:</Label><p className="font-medium whitespace-pre-line">{detailedParentData.address || "-"}</p></div>
              <div><Label className="text-muted-foreground">Anak Terhubung:</Label><p className="font-medium">{detailedParentData.studentName || "-"}</p></div>
              <div><Label className="text-muted-foreground">Kelas Anak:</Label><p className="font-medium">{detailedParentData.studentClassName || "-"}</p></div>
              {detailedParentData.createdAt && (
                <div className="md:col-span-2">
                  <Label className="text-muted-foreground">Tanggal Profil Dibuat:</Label>
                  <p className="font-medium">{format(detailedParentData.createdAt.toDate(), "dd MMMM yyyy, HH:mm", { locale: indonesiaLocale })}</p>
                </div>
              )}
            </div>
          ) : (
             <div className="text-center py-8 text-muted-foreground">
                <Info className="mx-auto h-10 w-10 mb-2" />
                Tidak dapat memuat detail data orang tua.
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Tutup</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isTeacherDetailDialogOpen} onOpenChange={setIsTeacherDetailDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail Data Guru</DialogTitle>
            <DialogDescription>
              Informasi lengkap mengenai data diri Anda sebagai guru.
            </DialogDescription>
          </DialogHeader>
          {isLoadingTeacherDetail ? (
             <div className="flex justify-center items-center py-8">
                <LottieLoader width={48} height={48} />
                <span className="ml-2">Memuat data detail...</span>
            </div>
          ) : detailedTeacherData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2 text-sm">
              <div><Label className="text-muted-foreground">Nama Lengkap:</Label><p className="font-medium">{detailedTeacherData.name || "-"}</p></div>
              <div><Label className="text-muted-foreground">Email:</Label><p className="font-medium">{detailedTeacherData.email || "-"}</p></div>
              <div><Label className="text-muted-foreground">Mata Pelajaran Utama:</Label><p className="font-medium">{detailedTeacherData.subject || "-"}</p></div>
              <div><Label className="text-muted-foreground">Nomor Telepon:</Label><p className="font-medium">{detailedTeacherData.phone || "-"}</p></div>
              <div><Label className="text-muted-foreground">Jenis Kelamin:</Label><p className="font-medium capitalize">{detailedTeacherData.gender || "-"}</p></div>
              <div className="md:col-span-2"><Label className="text-muted-foreground">Alamat:</Label><p className="font-medium whitespace-pre-line">{detailedTeacherData.address || "-"}</p></div>
              {detailedTeacherData.createdAt && (
                <div className="md:col-span-2">
                  <Label className="text-muted-foreground">Tanggal Profil Dibuat:</Label>
                  <p className="font-medium">{format(detailedTeacherData.createdAt.toDate(), "dd MMMM yyyy, HH:mm", { locale: indonesiaLocale })}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
                <Info className="mx-auto h-10 w-10 mb-2" />
                Tidak dapat memuat detail data guru.
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Tutup</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAdminDetailDialogOpen} onOpenChange={(open) => {
          setIsAdminDetailDialogOpen(open);
          if (!open) {
              adminDetailForm.reset({
                  phone: adminDetails?.phone || "",
                  gender: adminDetails?.gender,
                  address: adminDetails?.address || "",
              });
          }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detail Data Admin</DialogTitle>
            <DialogDescription>
              Informasi tambahan untuk profil admin.
            </DialogDescription>
          </DialogHeader>
          {isLoadingAdminDetails ? (
            <div className="flex justify-center items-center py-8">
                <LottieLoader width={48} height={48} />
                <span className="ml-2">Memuat detail admin...</span>
            </div>
          ) : (
            <form onSubmit={adminDetailForm.handleSubmit(handleSaveAdminDetails)} className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
              <div>
                <Label htmlFor="admin-phone">Nomor Telepon</Label>
                <Input id="admin-phone" {...adminDetailForm.register("phone")} className="mt-1" />
                {adminDetailForm.formState.errors.phone && (
                  <p className="text-sm text-destructive mt-1">{adminDetailForm.formState.errors.phone.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="admin-gender">Jenis Kelamin</Label>
                <Controller
                  name="gender"
                  control={adminDetailForm.control}
                  render={({ field }) => (
                    <Select
                      onValueChange={(value) => field.onChange(value as "laki-laki" | "perempuan" | undefined)}
                      value={field.value || undefined}
                    >
                      <SelectTrigger id="admin-gender" className="mt-1">
                        <SelectValue placeholder="Pilih jenis kelamin" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="laki-laki">Laki-laki</SelectItem>
                        <SelectItem value="perempuan">Perempuan</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                 {adminDetailForm.formState.errors.gender && (
                  <p className="text-sm text-destructive mt-1">{adminDetailForm.formState.errors.gender.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="admin-address">Alamat</Label>
                <Textarea id="admin-address" {...adminDetailForm.register("address")} className="mt-1" />
                 {adminDetailForm.formState.errors.address && (
                  <p className="text-sm text-destructive mt-1">{adminDetailForm.formState.errors.address.message}</p>
                )}
              </div>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                <Button type="submit" disabled={isUpdatingAdminDetails}>
                  {isUpdatingAdminDetails && <LottieLoader width={16} height={16} className="mr-2" />}
                  {isUpdatingAdminDetails ? "Menyimpan..." : "Simpan Detail Admin"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}

