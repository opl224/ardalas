

"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Filter, Search, Megaphone, Edit, Trash2, AlertCircle, MoreVertical } from "lucide-react";
import LottieLoader from "@/components/ui/LottieLoader";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLES, Role, roleDisplayNames } from "@/config/roles";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useForm, type SubmitHandler, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { db, auth } from "@/lib/firebase/config";
import {
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
  where,
  documentId,
  writeBatch,
  limit
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface AnnouncementData {
  id: string;
  title: string;
  content: string;
  date: Timestamp;
  targetAudience: Role[];
  targetClassIds?: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdById?: string;
  createdByName?: string;
}

const baseAnnouncementSchema = z.object({
  title: z.string().min(5, { message: "Judul minimal 5 karakter." }),
  content: z.string().min(10, { message: "Konten minimal 10 karakter." }),
  targetAudience: z.array(z.enum(ROLES)).min(1, { message: "Pilih minimal satu target peran." }),
  targetClassIds: z.array(z.string()).optional(),
});

const announcementFormSchema = baseAnnouncementSchema.refine(
  (data) => {
    return true;
  },
  {
    message: "Guru harus memilih minimal satu kelas jika menargetkan Siswa atau Orang Tua.",
    path: ["targetClassIds"],
  }
);
type AnnouncementFormValues = z.infer<typeof announcementFormSchema>;

const editAnnouncementFormSchema = baseAnnouncementSchema.extend({ id: z.string() });
type EditAnnouncementFormValues = z.infer<typeof editAnnouncementFormSchema>;

const ROLES_FOR_TEACHER_TARGETING: Role[] = ["orangtua"];

interface ClassMin {
  id: string;
  name: string;
}

export default function AnnouncementsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const [announcements, setAnnouncements] = useState<AnnouncementData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementData | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [teacherClasses, setTeacherClasses] = useState<ClassMin[]>([]);
  const [isLoadingTeacherClasses, setIsLoadingTeacherClasses] = useState(false);

  const { toast } = useToast();

  const addAnnouncementForm = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementFormSchema),
    defaultValues: {
      title: "",
      content: "",
      targetAudience: [],
      targetClassIds: [],
    },
  });

  const editAnnouncementForm = useForm<EditAnnouncementFormValues>({
    resolver: zodResolver(editAnnouncementFormSchema),
    defaultValues: {
      title: "",
      content: "",
      targetAudience: [],
      targetClassIds: [],
    }
  });

  const toggleReadMore = (id: string) => {
    setExpandedIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        return newSet;
    });
  };

  const fetchAnnouncements = async () => {
    setIsLoading(true);
    try {
      const announcementsCollectionRef = collection(db, "announcements");
      let q = query(announcementsCollectionRef, orderBy("date", "desc"));
      const querySnapshot = await getDocs(q);
      let fetchedAnnouncements = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as AnnouncementData[];

      // Filter announcements based on user role and class
      if (user && role === 'orangtua') {
        const userClassId = user.linkedStudentClassId;
        fetchedAnnouncements = fetchedAnnouncements.filter(ann =>
          ann.targetAudience.includes(role!) ||
          ann.targetAudience.includes("semua") || // "semua" might not be in ROLES type, adjust if needed
          (ann.targetClassIds && userClassId && ann.targetClassIds.includes(userClassId))
        );
      } else if (user && role === 'guru') {
         fetchedAnnouncements = fetchedAnnouncements.filter(ann =>
            ann.targetAudience.includes('guru') ||
            ann.targetAudience.includes("semua") ||
            (ann.createdById === user.uid) || // Show announcements created by this teacher
            (teacherClasses.length > 0 && ann.targetClassIds && ann.targetClassIds.some(tcId => teacherClasses.map(tc => tc.id).includes(tcId)) ) // Show if targets any of their classes
        );
      }
      // Admin sees all by default

      setAnnouncements(fetchedAnnouncements);
    } catch (error) {
      console.error("Error fetching announcements: ", error);
      toast({ title: "Gagal Memuat Pengumuman", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) fetchAnnouncements();
  }, [authLoading, user, role, teacherClasses]); // Added teacherClasses dependency

  useEffect(() => {
    if (role === 'guru' && user && (isAddDialogOpen || (isEditDialogOpen && selectedAnnouncement))) {
      const fetchTeacherClasses = async () => {
        setIsLoadingTeacherClasses(true);
        try {
           // First, get the teacher's profile ID from the 'teachers' collection using their auth UID
          const teacherProfileQuery = query(collection(db, "teachers"), where("uid", "==", user.uid), limit(1));
          const teacherProfileSnapshot = await getDocs(teacherProfileQuery);

          if (teacherProfileSnapshot.empty) {
            toast({ title: "Profil Guru Tidak Ditemukan", description: "Tidak dapat memuat kelas untuk penargetan.", variant: "warning" });
            setTeacherClasses([]);
            setIsLoadingTeacherClasses(false);
            return;
          }
          const teacherProfileId = teacherProfileSnapshot.docs[0].id;

          const lessonsQuery = query(collection(db, "lessons"), where("teacherId", "==", teacherProfileId));
          const lessonsSnapshot = await getDocs(lessonsQuery);
          const classIds = new Set<string>();
          lessonsSnapshot.docs.forEach(doc => classIds.add(doc.data().classId));

          if (classIds.size > 0) {
            const classesQuery = query(collection(db, "classes"), where(documentId(), "in", Array.from(classIds)), orderBy("name"));
            const classesSnapshot = await getDocs(classesQuery);
            setTeacherClasses(classesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name } as ClassMin)));
          } else {
            setTeacherClasses([]);
          }
        } catch (error) {
          console.error("Error fetching teacher classes:", error);
          toast({ title: "Gagal memuat data kelas guru", variant: "destructive" });
          setTeacherClasses([]);
        } finally {
          setIsLoadingTeacherClasses(false);
        }
      };
      fetchTeacherClasses();
    }
  }, [role, user, isAddDialogOpen, isEditDialogOpen, selectedAnnouncement, toast]);


  useEffect(() => {
    if (selectedAnnouncement && isEditDialogOpen) {
      editAnnouncementForm.reset({
        id: selectedAnnouncement.id,
        title: selectedAnnouncement.title,
        content: selectedAnnouncement.content,
        targetAudience: selectedAnnouncement.targetAudience || [],
        targetClassIds: selectedAnnouncement.targetClassIds || [],
      });
    }
  }, [selectedAnnouncement, isEditDialogOpen, editAnnouncementForm]);

  const handleAddAnnouncementSubmit: SubmitHandler<AnnouncementFormValues> = async (data) => {
     if (!user) {
        toast({ title: "Aksi Ditolak", description: "Kamu harus login.", variant: "destructive"});
        return;
    }
    addAnnouncementForm.clearErrors();

    if (role === 'guru' && data.targetAudience.includes('orangtua') && (!data.targetClassIds || data.targetClassIds.length === 0)) {
      addAnnouncementForm.setError("targetClassIds", { type: "manual", message: "Pilih minimal satu kelas target." });
      toast({title: "Validasi Gagal", description: "Guru harus memilih kelas target jika menargetkan orang tua.", variant: "destructive"});
      return;
    }

    let finalTargetClassIds = data.targetClassIds;
    if (role !== 'guru') {
        finalTargetClassIds = [];
    }

    try {
      const announcementData = {
        ...data,
        targetClassIds: finalTargetClassIds,
        date: Timestamp.now(),
        createdById: user.uid,
        createdByName: user.displayName || user.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const newAnnouncementRef = await addDoc(collection(db, "announcements"), announcementData);
      toast({ title: "Pengumuman Ditambahkan", description: `"${data.title}" berhasil dipublikasikan.` });

      const batch = writeBatch(db);
      const notificationBase = {
        title: `Pengumuman Baru: ${data.title.substring(0,30)}${data.title.length > 30 ? "..." : ""}`,
        description: data.content.substring(0, 50) + (data.content.length > 50 ? "..." : ""),
        href: `/announcements`,
        read: false,
        createdAt: serverTimestamp(),
        type: "new_announcement",
      };

      const creatorNotificationRef = doc(collection(db, "notifications"));
      batch.set(creatorNotificationRef, { ...notificationBase, userId: user.uid });

      if (role === 'admin' && data.targetAudience && data.targetAudience.length > 0) {
        const usersRef = collection(db, "users");
        for (const targetRole of data.targetAudience) {
          if (targetRole === 'orangtua') {
            continue;
          }

          if (targetRole === 'admin' && user.uid === user.uid) { 
          }

          const qUsers = query(usersRef, where("role", "==", targetRole));
          try {
            const querySnapshot = await getDocs(qUsers);
            querySnapshot.forEach((userDoc) => {
              if (userDoc.id !== user.uid) {
                const userNotificationRef = doc(collection(db, "notifications"));
                batch.set(userNotificationRef, { ...notificationBase, userId: userDoc.id });
              }
            });
          } catch (e) {
            console.error(`Error querying users for role ${targetRole} for notification:`, e);
          }
        }
      } else if (role === 'guru' && data.targetAudience && data.targetClassIds && data.targetClassIds.length > 0) {
        const usersRef = collection(db, "users");
        for (const targetRole of data.targetAudience.filter(r => ROLES_FOR_TEACHER_TARGETING.includes(r))) {
            const qStudents = query(usersRef, where("role", "==", targetRole), where("classId", "in", data.targetClassIds));
             try {
              const querySnapshot = await getDocs(qStudents);
              querySnapshot.forEach((userDoc) => {
                if (userDoc.id !== user.uid) {
                  const userNotificationRef = doc(collection(db, "notifications"));
                  batch.set(userNotificationRef, { ...notificationBase, userId: userDoc.id });
                }
              });
            } catch (e) {
              console.error(`Error querying users for role ${targetRole} in classes for notification:`, e);
            }
        }
      }
      await batch.commit();

      setIsAddDialogOpen(false);
      addAnnouncementForm.reset({ title: "", content: "", targetAudience: [], targetClassIds: [] });
      fetchAnnouncements();
    } catch (error) {
      console.error("Error adding announcement or notification:", error);
      toast({ title: "Gagal Menambahkan Pengumuman", variant: "destructive" });
    }
  };

  const handleEditAnnouncementSubmit: SubmitHandler<EditAnnouncementFormValues> = async (data) => {
    if (!selectedAnnouncement || !user) return;
    editAnnouncementForm.clearErrors();

    if (role === 'guru' && data.targetAudience.includes('orangtua') && (!data.targetClassIds || data.targetClassIds.length === 0)) {
      editAnnouncementForm.setError("targetClassIds", { type: "manual", message: "Pilih minimal satu kelas target." });
      toast({title: "Validasi Gagal", description: "Guru harus memilih kelas target jika menargetkan orang tua.", variant: "destructive"});
      return;
    }

    let finalTargetClassIds = data.targetClassIds;
    if (role !== 'guru') {
      if (data.targetAudience.length === 0 || !data.targetAudience.some(r => ['orangtua'].includes(r))) {
        finalTargetClassIds = [];
      } else {
        finalTargetClassIds = selectedAnnouncement.targetClassIds || [];
      }
    }


    try {
      const announcementDocRef = doc(db, "announcements", data.id);
      await updateDoc(announcementDocRef, {
        ...data,
        targetClassIds: finalTargetClassIds,
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Pengumuman Diperbarui", description: `"${data.title}" berhasil diperbarui.` });

      setIsEditDialogOpen(false);
      setSelectedAnnouncement(null);
      fetchAnnouncements();
    } catch (error) {
      console.error("Error editing announcement:", error);
      toast({ title: "Gagal Memperbarui Pengumuman", variant: "destructive" });
    }
  };

  const handleDeleteAnnouncement = async (announcementId: string, announcementTitle?: string) => {
    try {
      await deleteDoc(doc(db, "announcements", announcementId));
      toast({ title: "Pengumuman Dihapus", description: `"${announcementTitle || 'Pengumuman'}" berhasil dihapus.` });
      setSelectedAnnouncement(null);
      fetchAnnouncements();
    } catch (error) {
      console.error("Error deleting announcement:", error);
      toast({ title: "Gagal Menghapus Pengumuman", variant: "destructive" });
    }
  };

  const openEditDialog = (announcement: AnnouncementData) => {
    setSelectedAnnouncement(announcement);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (announcement: AnnouncementData) => {
    setSelectedAnnouncement(announcement);
  };

  const canManageAnnouncements = role === "admin" || role === "guru";

  if (authLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Pengumuman Sekolah</h1>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md"><CardContent className="pt-6 flex items-center justify-center p-8"><LottieLoader width={32} height={32} className="mr-2" />Memuat...</CardContent></Card>
      </div>
    );
  }

  const renderFormFields = (formInstance: typeof addAnnouncementForm | typeof editAnnouncementForm, dialogType: 'add' | 'edit') => (
    <>
      <div>
        <Label htmlFor={`${dialogType}-announcement-title`}>Judul Pengumuman <span className="text-destructive">*</span></Label>
        <Input id={`${dialogType}-announcement-title`} {...formInstance.register("title")} className="mt-1" />
        {(formInstance.formState.errors as any).title && <p className="text-sm text-destructive mt-1">{(formInstance.formState.errors as any).title.message}</p>}
      </div>
      <div>
        <Label htmlFor={`${dialogType}-announcement-content`}>Isi Pengumuman <span className="text-destructive">*</span></Label>
        <Textarea id={`${dialogType}-announcement-content`} {...formInstance.register("content")} className="mt-1 min-h-[150px]" />
        {(formInstance.formState.errors as any).content && <p className="text-sm text-destructive mt-1">{(formInstance.formState.errors as any).content.message}</p>}
      </div>

      {role === 'guru' ? (
        <>
          <div>
            <Label>Target Kelas <span className="text-destructive">*</span></Label>
            {isLoadingTeacherClasses ? (
              <p className="text-sm text-muted-foreground mt-1">Memuat kelas...</p>
            ) : teacherClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-1">Tidak ada kelas yang diajar atau data kelas belum termuat.</p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2 border p-3 rounded-md max-h-32 overflow-y-auto">
                {teacherClasses.map((cls) => (
                  <FormField
                    key={cls.id}
                    control={formInstance.control}
                    name="targetClassIds"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value?.includes(cls.id)}
                            onCheckedChange={(checked) => {
                              return checked
                                ? field.onChange([...(field.value || []), cls.id])
                                : field.onChange(
                                    (field.value || []).filter(
                                      (value) => value !== cls.id
                                    )
                                  );
                            }}
                          />
                        </FormControl>
                        <FormLabel className="font-normal text-sm">
                          {cls.name}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            )}
            {(formInstance.formState.errors as any).targetClassIds && <p className="text-sm text-destructive mt-1">{(formInstance.formState.errors as any).targetClassIds.message}</p>}
          </div>
          <div>
            <Label>Target Peran di Kelas Tersebut <span className="text-destructive">*</span></Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ROLES_FOR_TEACHER_TARGETING.map((roleKey) => (
                <FormField
                  key={roleKey}
                  control={formInstance.control}
                  name="targetAudience"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value?.includes(roleKey)}
                          onCheckedChange={(checked) => {
                            return checked
                              ? field.onChange([...(field.value || []), roleKey])
                              : field.onChange(
                                  (field.value || []).filter(
                                    (value) => value !== roleKey
                                  )
                                );
                          }}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">
                        {roleDisplayNames[roleKey]}
                      </FormLabel>
                    </FormItem>
                  )}
                />
              ))}
            </div>
            {(formInstance.formState.errors as any).targetAudience && <p className="text-sm text-destructive mt-1">{(formInstance.formState.errors as any).targetAudience.message}</p>}
          </div>
        </>
      ) : (
        <div>
          <Label>Target Audiens <span className="text-destructive">*</span></Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {ROLES.map((roleKey) => (
              <FormField
                key={roleKey}
                control={formInstance.control}
                name="targetAudience"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value?.includes(roleKey)}
                        onCheckedChange={(checked) => {
                          return checked
                            ? field.onChange([...(field.value || []), roleKey])
                            : field.onChange(
                                (field.value || []).filter(
                                  (value) => value !== roleKey
                                )
                              );
                        }}
                      />
                    </FormControl>
                    <FormLabel className="font-normal">
                      {roleDisplayNames[roleKey]}
                    </FormLabel>
                  </FormItem>
                )}
              />
            ))}
          </div>
          {(formInstance.formState.errors as any).targetAudience && <p className="text-sm text-destructive mt-1">{(formInstance.formState.errors as any).targetAudience.message}</p>}
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-headline">Pengumuman Sekolah</h1>
          <p className="text-muted-foreground">Informasi terbaru dan penting untuk Kamu.</p>
        </div>
        {canManageAnnouncements && (
           <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
            setIsAddDialogOpen(isOpen);
            if (!isOpen) { addAnnouncementForm.reset({ title: "", content: "", targetAudience: [], targetClassIds: [] }); addAnnouncementForm.clearErrors(); }
          }}>
            <DialogTrigger asChild>
              <Button size="sm"><PlusCircle className="mr-2 h-4 w-4" /> Buat Pengumuman</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Buat Pengumuman Baru</DialogTitle><DialogDescription>Tulis dan publikasikan pengumuman.</DialogDescription></DialogHeader>
              <Form {...addAnnouncementForm}>
              <form onSubmit={addAnnouncementForm.handleSubmit(handleAddAnnouncementSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                {renderFormFields(addAnnouncementForm, 'add')}
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                  <Button type="submit" disabled={addAnnouncementForm.formState.isSubmitting}>
                    {addAnnouncementForm.formState.isSubmitting && <LottieLoader width={16} height={16} className="mr-2" />}
                    Publikasikan
                  </Button>
                </DialogFooter>
              </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
        </div>
      ) : announcements.length > 0 ? (
        announcements.map((announcement) => {
            const isExpanded = expandedIds.has(announcement.id);
            // Heuristics to determine if truncation is likely needed.
            const titleIsLong = announcement.title.length > 80;
            const contentIsLong = announcement.content.length > 150 || announcement.content.split('\n').length > 3;
            const showReadMore = titleIsLong || contentIsLong;

            return (
          <Card key={announcement.id} className="bg-card/70 backdrop-blur-sm border-border shadow-md hover:shadow-lg transition-shadow duration-300">
            <CardHeader>
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <CardTitle 
                    className={cn(
                        "text-xl break-words",
                        !isExpanded && "line-clamp-2"
                    )}
                    title={announcement.title}>
                      {announcement.title}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground mt-1 break-words">
                    <span>{format(announcement.date.toDate(), "dd MMMM yyyy, HH:mm", { locale: indonesiaLocale })}</span>
                    <span>&bull;</span>
                    <span>Untuk: {announcement.targetAudience.map(r => roleDisplayNames[r as keyof typeof roleDisplayNames] || r).join(", ")}</span>
                    {announcement.targetClassIds && announcement.targetClassIds.length > 0 && (
                        <>
                         <span>&bull;</span>
                         <span>Kelas: {announcement.targetClassIds.map(tcId => teacherClasses.find(tc => tc.id === tcId)?.name || tcId).join(", ")}</span>
                        </>
                    )}
                    {announcement.createdByName && <span>&bull; Oleh: {announcement.createdByName}</span>}
                  </div>
                </div>
                {canManageAnnouncements && (user?.uid === announcement.createdById || role === 'admin') && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Opsi untuk ${announcement.title}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(announcement)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              openDeleteDialog(announcement);
                            }}
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Hapus
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        {selectedAnnouncement && selectedAnnouncement.id === announcement.id && (
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Apakah Kamu Yakin?</AlertDialogTitle><AlertDialogDescription>Tindakan ini akan menghapus pengumuman <span className="font-semibold">"{selectedAnnouncement?.title}"</span>.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setSelectedAnnouncement(null)}>Batal</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteAnnouncement(selectedAnnouncement.id, selectedAnnouncement.title)}>Ya, Hapus Pengumuman</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        )}
                      </AlertDialog>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </CardHeader>
            <CardContent>
                <p className={cn("text-sm text-foreground whitespace-pre-line", !isExpanded && "line-clamp-3")}>
                    {announcement.content}
                </p>
                {showReadMore && (
                    <Button
                        variant="link"
                        className="p-0 h-auto mt-2 text-primary"
                        onClick={() => toggleReadMore(announcement.id)}
                    >
                        {isExpanded ? "Tutup" : "Baca Selengkapnya"}
                    </Button>
                )}
            </CardContent>
          </Card>
          );
        })
      ) : (
        <Card className="bg-card/70 backdrop-blur-sm border-border">
          <CardContent className="p-6 text-center text-muted-foreground">
            <Megaphone className="mx-auto h-12 w-12 mb-4" />
            <p>Belum ada pengumuman saat ini.</p>
          </CardContent>
        </Card>
      )}

      {canManageAnnouncements && selectedAnnouncement && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
          setIsEditDialogOpen(isOpen);
          if (!isOpen) { setSelectedAnnouncement(null); editAnnouncementForm.clearErrors(); }
        }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Edit Pengumuman</DialogTitle><DialogDescription>Perbarui detail pengumuman.</DialogDescription></DialogHeader>
            <Form {...editAnnouncementForm}>
            <form onSubmit={editAnnouncementForm.handleSubmit(handleEditAnnouncementSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <Input type="hidden" {...editAnnouncementForm.register("id")} />
              {renderFormFields(editAnnouncementForm, 'edit')}
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                <Button type="submit" disabled={editAnnouncementForm.formState.isSubmitting}>
                  {editAnnouncementForm.formState.isSubmitting && <LottieLoader width={16} height={16} className="mr-2" />}
                  Simpan Perubahan</Button>
              </DialogFooter>
            </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
