
"use client";

import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { User as UserIcon, Mail, Shield, AlertCircle, Edit, Home, School, Phone, BookOpen, GraduationCap, Calendar as CalendarIcon, Hash, MapPin, Milestone, Users } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { updateProfile } from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";
import { doc, getDoc, updateDoc, setDoc, Timestamp, collection, query, where, limit, getDocs } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from 'date-fns';
import { id as indonesiaLocale } from 'date-fns/locale';


const availableAvatars = [
  "/avatars/l-dokter.png",
  "/avatars/l-guru.png",
  "/avatars/l-pemadam.png",
  "/avatars/l-polisi.png",
  "/avatars/l-sains.png",
  "/avatars/laki-laki.png",
  "/avatars/messi.png",
  "/avatars/p-dokter.png",
  "/avatars/p-guru.png",
  "/avatars/p-pemadam.png",
  "/avatars/p-polisi.png",
  "/avatars/p-sains.png",
  "/avatars/perempuan.png",
  "/avatars/ronaldo.png",
];

const profileFormSchema = z.object({
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }),
  email: z.string().email(), // Keep email for display, but it won't be editable
  phone: z.string().min(9, { message: "Nomor telepon minimal 9 digit." }).optional().or(z.literal("")),
  address: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;


export default function ProfilePage() {
  const { user, loading, role, refreshUser } = useAuth();
  const { toast } = useToast();
  
  const [isAvatarDialogOpen, setIsAvatarDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(user?.photoURL || null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [detailedProfileData, setDetailedProfileData] = useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: user?.displayName || "",
      email: user?.email || "",
      phone: "",
      address: "",
    },
  });

  useEffect(() => {
    if (isDetailDialogOpen && user && role) {
      const fetchExtraData = async () => {
        setIsLoadingDetails(true);
        setDetailedProfileData(null);
        try {
          let profileData = null;
          let profileCollectionName: string | null = null;
          let queryField = "uid";

          switch(role) {
            case 'admin':
            case 'siswa':
              profileCollectionName = "users";
              break;
            case 'guru':
              profileCollectionName = "teachers";
              break;
            case 'orangtua':
              profileCollectionName = "parents";
              break;
          }
          
          if(profileCollectionName) {
            let docRef;
            if(profileCollectionName === "users") {
                docRef = doc(db, profileCollectionName, user.uid);
                const docSnap = await getDoc(docRef);
                 if (docSnap.exists()) {
                    profileData = docSnap.data();
                 }
            } else {
                const q = query(collection(db, profileCollectionName), where(queryField, "==", user.uid), limit(1));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    profileData = snapshot.docs[0].data();
                }
            }
          }
          
          if (profileData) {
            setDetailedProfileData(profileData);
            form.reset({
              name: user.displayName || "",
              email: user.email || "",
              phone: profileData.phone || "",
              address: profileData.address || "",
            });
          } else {
             form.reset({
              name: user.displayName || "",
              email: user.email || "",
              phone: "",
              address: "",
            });
          }
        } catch (e) {
          console.error("Error fetching detailed profile", e);
          toast({ title: "Gagal memuat detail profil", variant: "destructive" });
        } finally {
          setIsLoadingDetails(false);
        }
      };
      fetchExtraData();
    }
  }, [isDetailDialogOpen, user, role, form, toast]);


  const handleAvatarUpdate = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !selectedAvatar) {
      toast({ title: "Error", description: "Avatar atau pengguna tidak valid.", variant: "destructive" });
      return;
    }
    if (currentUser.photoURL === selectedAvatar) {
        setIsAvatarDialogOpen(false);
        return;
    }

    setIsUpdating(true);
    try {
      await updateProfile(currentUser, { photoURL: selectedAvatar });
      await refreshUser(); 
      toast({ title: "Avatar Diperbarui", description: "Foto profil berhasil diubah." });
      setIsAvatarDialogOpen(false);
    } catch (error) {
      console.error("Error updating avatar:", error);
      toast({ title: "Gagal Memperbarui Avatar", variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleProfileUpdate = async (values: ProfileFormValues) => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast({ title: "Error", description: "Sesi tidak valid, silakan login kembali.", variant: "destructive" });
        return;
      }
      setIsUpdatingProfile(true);

      try {
        if (currentUser.displayName !== values.name) {
            await updateProfile(currentUser, { displayName: values.name });
        }

        const userDocRef = doc(db, "users", currentUser.uid);
        await setDoc(userDocRef, { 
            name: values.name,
            phone: values.phone || null,
            address: values.address || null 
        }, { merge: true });

        // Update corresponding profile collection if it exists
        if (role === 'guru') {
            const teacherQuery = query(collection(db, "teachers"), where("uid", "==", currentUser.uid), limit(1));
            const teacherSnapshot = await getDocs(teacherQuery);
            if (!teacherSnapshot.empty) {
                await updateDoc(teacherSnapshot.docs[0].ref, { name: values.name, phone: values.phone || null, address: values.address || null });
            }
        } else if (role === 'orangtua') {
            const parentQuery = query(collection(db, "parents"), where("uid", "==", currentUser.uid), limit(1));
            const parentSnapshot = await getDocs(parentQuery);
            if (!parentSnapshot.empty) {
                await updateDoc(parentSnapshot.docs[0].ref, { name: values.name, phone: values.phone || null, address: values.address || null });
            }
        }

        await refreshUser(); 

        toast({
            title: "Profil Diperbarui",
            description: "Informasi profil telah berhasil disimpan.",
        });

        setIsDetailDialogOpen(false);
      } catch (error) {
        console.error("Error updating profile:", error);
        toast({
            title: "Gagal Memperbarui Profil",
            variant: "destructive",
        });
      } finally {
          setIsUpdatingProfile(false);
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
              <p>Silakan login untuk melihat profil.</p>
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
  
  const DetailItem = ({ icon: Icon, label, value }: { icon: React.ElementType, label: string, value: React.ReactNode }) => (
    <div className="flex items-start gap-3">
        <Icon className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-medium">{value || "-"}</p>
        </div>
    </div>
  );

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
                            Pilih salah satu gambar di bawah ini untuk dijadikan foto profil.
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh]">
                        <div className="py-4 grid grid-cols-3 sm:grid-cols-4 gap-4 pr-4">
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
                    </ScrollArea>
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
                    <DetailItem icon={UserIcon} label="Nama Lengkap" value={user.displayName} />
                    <DetailItem icon={Mail} label="Email" value={user.email} />
                    <DetailItem icon={Shield} label="Peran" value={role ? roleDisplayNames[role] : "Tidak diketahui"} />
                </div>
            </div>
            {role === 'orangtua' && user.linkedStudentName && (
               <div className="border-t border-border pt-4">
                <h3 className="text-lg font-semibold mb-2">Informasi Anak</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DetailItem icon={UserIcon} label="Nama Anak" value={user.linkedStudentName} />
                    <DetailItem icon={School} label="Kelas Anak" value={user.linkedStudentClassName} />
                </div>
              </div>
            )}
            <div className="pt-4 flex justify-center">
              <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    {role === 'admin' || role === 'guru' ? 'Lihat & Edit Detail' : 'Lihat Detail Lengkap'}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Detail Profil</DialogTitle>
                    <DialogDescription>
                      {role === 'admin' || role === 'guru'
                        ? 'Perbarui informasi profil. Perubahan akan disimpan di seluruh sistem.'
                        : 'Informasi lengkap mengenai profil anda.'}
                    </DialogDescription>
                  </DialogHeader>

                  {isLoadingDetails ? (
                     <div className="space-y-4 py-4">
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-6 w-1/2" />
                        <Skeleton className="h-6 w-2/3" />
                     </div>
                  ) : (role === 'admin' || role === 'guru') ? (
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(handleProfileUpdate)} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 py-4">
                          <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Nama Lengkap</FormLabel>
                                <FormControl>
                                  <Input placeholder="Nama lengkap" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email (tidak dapat diubah)</FormLabel>
                                <FormControl>
                                  <Input {...field} readOnly disabled />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                           <FormField
                            control={form.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Nomor Telepon</FormLabel>
                                <FormControl>
                                  <Input placeholder="08123..." {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          {role === 'guru' && detailedProfileData && (
                            <>
                                <DetailItem icon={Milestone} label="NIP" value={detailedProfileData.nip} />
                                <DetailItem icon={BookOpen} label="Mapel Utama" value={detailedProfileData.subject} />
                                <DetailItem icon={Users} label="Jenis Kelamin" value={<span className="capitalize">{detailedProfileData.gender}</span>} />
                                <DetailItem icon={Milestone} label="Agama" value={detailedProfileData.agama} />
                            </>
                          )}
                          <div className="sm:col-span-2">
                            <FormField
                              control={form.control}
                              name="address"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Alamat</FormLabel>
                                  <FormControl>
                                    <Textarea placeholder="Masukkan alamat" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                        <DialogFooter className="pt-4">
                          <DialogClose asChild>
                            <Button type="button" variant="outline">Batal</Button>
                          </DialogClose>
                          <Button type="submit" disabled={isUpdatingProfile}>
                            {isUpdatingProfile ? 'Menyimpan...' : 'Simpan Perubahan'}
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  ) : !detailedProfileData ? (
                    <p className="py-4 text-muted-foreground">Detail profil tambahan tidak ditemukan.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 py-4 text-sm">
                        <DetailItem icon={UserIcon} label="Nama Lengkap" value={user.displayName} />
                        <DetailItem icon={Mail} label="Email" value={user.email} />
                        <DetailItem icon={Phone} label="Telepon" value={detailedProfileData.phone} />
                        <DetailItem icon={Home} label="Alamat" value={detailedProfileData.address} />
                        
                        {role === 'siswa' && (
                          <>
                            <div className="pt-2 border-t sm:col-span-2 mt-2">
                              <h4 className="font-semibold text-base mt-2">Info Akademik</h4>
                            </div>
                            <DetailItem icon={Milestone} label="NIS" value={detailedProfileData.nis} />
                            <DetailItem icon={School} label="Kelas" value={user.className} />
                            <DetailItem icon={CalendarIcon} label="Tanggal Lahir" value={detailedProfileData.dateOfBirth ? format(detailedProfileData.dateOfBirth.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale }) : null} />
                            <DetailItem icon={Users} label="Jenis Kelamin" value={<span className="capitalize">{detailedProfileData.gender}</span>} />
                            <DetailItem icon={Milestone} label="Agama" value={detailedProfileData.agama} />
                            <DetailItem icon={Hash} label="Nomor Absen" value={detailedProfileData.attendanceNumber} />
                            <DetailItem icon={UserIcon} label="Orang Tua Terhubung" value={detailedProfileData.parentName} />
                          </>
                        )}
                         {role === 'orangtua' && (
                          <>
                             <div className="pt-2 border-t sm:col-span-2 mt-2">
                              <h4 className="font-semibold text-base mt-2">Info Pribadi</h4>
                            </div>
                             <DetailItem icon={Users} label="Jenis Kelamin" value={<span className="capitalize">{detailedProfileData.gender}</span>} />
                             <DetailItem icon={Milestone} label="Agama" value={detailedProfileData.agama} />
                             <div className="pt-2 border-t sm:col-span-2 mt-2">
                                <h4 className="font-semibold text-base mt-2">Info Anak</h4>
                             </div>
                             <DetailItem icon={UserIcon} label="Nama Anak" value={user.linkedStudentName} />
                             <DetailItem icon={School} label="Kelas Anak" value={user.linkedStudentClassName} />
                          </>
                        )}
                      </div>
                       <DialogFooter>
                          <DialogClose asChild>
                            <Button type="button" variant="outline">Tutup</Button>
                          </DialogClose>
                        </DialogFooter>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
