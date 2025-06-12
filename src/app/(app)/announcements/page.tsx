
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Filter, Search, Megaphone, Edit, Trash2, Loader2, AlertCircle } from "lucide-react";
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
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";

interface AnnouncementData {
  id: string;
  title: string;
  content: string;
  date: Timestamp; 
  targetAudience: Role[];
  targetClassIds?: string[]; // ID kelas yang dituju, opsional
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

// Custom refinement for teacher role
const announcementFormSchema = baseAnnouncementSchema.refine(
  (data) => {
    // This validation is context-dependent (based on role)
    // It's better handled in the submit handler or by dynamic schema adjustments
    // For now, we assume role is available in the component context when submitting
    return true; 
  },
  {
    message: "Guru harus memilih minimal satu kelas jika menargetkan Siswa atau Orang Tua.",
    path: ["targetClassIds"], // This path might not be ideal for a general refinement
  }
);
type AnnouncementFormValues = z.infer<typeof announcementFormSchema>;

const editAnnouncementFormSchema = baseAnnouncementSchema.extend({ id: z.string() });
type EditAnnouncementFormValues = z.infer<typeof editAnnouncementFormSchema>;

const ROLES_FOR_TEACHER_TARGETING: Role[] = ["siswa", "orangtua"];

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
    defaultValues: { // Default values for edit form are set in useEffect
      title: "",
      content: "",
      targetAudience: [],
      targetClassIds: [],
    }
  });

  const fetchAnnouncements = async () => {
    setIsLoading(true);
    try {
      const announcementsCollectionRef = collection(db, "announcements");
      const q = query(announcementsCollectionRef, orderBy("date", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedAnnouncements = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as AnnouncementData[];
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
  }, [authLoading]);

  // Fetch teacher's classes when add/edit dialog is opened by a teacher
  useEffect(() => {
    if (role === 'guru' && user && (isAddDialogOpen || (isEditDialogOpen && selectedAnnouncement))) {
      const fetchTeacherClasses = async () => {
        setIsLoadingTeacherClasses(true);
        try {
          // Assuming lessons link teachers to classes
          const lessonsQuery = query(collection(db, "lessons"), where("teacherId", "==", user.uid));
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
        toast({ title: "Aksi Ditolak", description: "Anda harus login.", variant: "destructive"});
        return;
    }
    addAnnouncementForm.clearErrors();

    if (role === 'guru' && (data.targetAudience.includes('siswa') || data.targetAudience.includes('orangtua')) && (!data.targetClassIds || data.targetClassIds.length === 0)) {
      addAnnouncementForm.setError("targetClassIds", { type: "manual", message: "Pilih minimal satu kelas target." });
      toast({title: "Validasi Gagal", description: "Guru harus memilih kelas target jika menargetkan siswa atau orang tua.", variant: "destructive"});
      return;
    }
    
    let finalTargetClassIds = data.targetClassIds;
    if (role !== 'guru') { 
        finalTargetClassIds = [];
    }


    try {
      const newAnnouncementRef = await addDoc(collection(db, "announcements"), {
        ...data,
        targetClassIds: finalTargetClassIds,
        date: Timestamp.now(),
        createdById: user.uid,
        createdByName: user.displayName || user.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Pengumuman Ditambahkan", description: `"${data.title}" berhasil dipublikasikan.` });
      
      // Create a notification for the user who created the announcement
      await addDoc(collection(db, "notifications"), {
        userId: user.uid, // Target the creator for now
        title: "Pengumuman Baru Dipublikasikan",
        description: `Pengumuman "${data.title}" telah berhasil Anda publikasikan.`,
        href: `/announcements`, // Link to general announcements page
        read: false,
        createdAt: serverTimestamp(),
        type: "new_announcement",
      });

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

    if (role === 'guru' && (data.targetAudience.includes('siswa') || data.targetAudience.includes('orangtua')) && (!data.targetClassIds || data.targetClassIds.length === 0)) {
      editAnnouncementForm.setError("targetClassIds", { type: "manual", message: "Pilih minimal satu kelas target." });
      toast({title: "Validasi Gagal", description: "Guru harus memilih kelas target jika menargetkan siswa atau orang tua.", variant: "destructive"});
      return;
    }

    let finalTargetClassIds = data.targetClassIds;
    if (role !== 'guru' && selectedAnnouncement.createdById === user.uid) { 
        finalTargetClassIds = selectedAnnouncement.targetClassIds || []; 
        if (selectedAnnouncement.createdById !== user.uid && role === 'admin') { 
            // Admin is editing someone else's (potentially a teacher's) announcement
        } else if (role === 'admin') { 
            finalTargetClassIds = []; 
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
      
      // Optionally, create a notification for update as well
      // For simplicity, I'm skipping notification creation on edit for now
      // but you can add similar logic as in handleAddAnnouncementSubmit if needed.

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
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md"><CardContent className="pt-6 flex items-center justify-center p-8"><Loader2 className="w-8 h-8 mr-2 animate-spin text-primary" />Memuat...</CardContent></Card>
      </div>
    );
  }

  const renderFormFields = (formInstance: typeof addAnnouncementForm | typeof editAnnouncementForm, dialogType: 'add' | 'edit') => (
    <>
      <div>
        <Label htmlFor={`${dialogType}-announcement-title`}>Judul Pengumuman</Label>
        <Input id={`${dialogType}-announcement-title`} {...formInstance.register("title")} className="mt-1" />
        {(formInstance.formState.errors as any).title && <p className="text-sm text-destructive mt-1">{(formInstance.formState.errors as any).title.message}</p>}
      </div>
      <div>
        <Label htmlFor={`${dialogType}-announcement-content`}>Isi Pengumuman</Label>
        <Textarea id={`${dialogType}-announcement-content`} {...formInstance.register("content")} className="mt-1 min-h-[150px]" />
        {(formInstance.formState.errors as any).content && <p className="text-sm text-destructive mt-1">{(formInstance.formState.errors as any).content.message}</p>}
      </div>

      {role === 'guru' ? (
        <>
          <div>
            <Label>Target Kelas</Label>
            {isLoadingTeacherClasses ? (
              <p className="text-sm text-muted-foreground mt-1">Memuat kelas...</p>
            ) : teacherClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-1">Tidak ada kelas yang diajar atau data kelas belum termuat.</p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
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
                        <FormLabel className="font-normal">
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
            <Label>Target Peran di Kelas Tersebut</Label>
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
      ) : ( // Admin or other roles with general targeting
        <div>
          <Label>Target Audiens</Label>
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
          <p className="text-muted-foreground">Informasi terbaru dan penting untuk Anda.</p>
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
                    {addAnnouncementForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Publikasikan
                  </Button>
                </DialogFooter>
              </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari pengumuman..." className="pl-8" />
            </div>
            <Select>
              <SelectTrigger className="w-full md:w-[180px]">
                <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Filter per Peran" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Peran</SelectItem>
                {ROLES.map(r => <SelectItem key={r} value={r}>{roleDisplayNames[r as keyof typeof roleDisplayNames]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
        </div>
      ) : announcements.length > 0 ? (
        announcements.map((announcement) => (
          <Card key={announcement.id} className="bg-card/70 backdrop-blur-sm border-border shadow-md hover:shadow-lg transition-shadow duration-300">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl">{announcement.title}</CardTitle>
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground mt-1 flex-wrap">
                    <span>{format(announcement.date.toDate(), "dd MMMM yyyy, HH:mm", { locale: indonesiaLocale })}</span>
                    <span>&bull;</span>
                    <span>Untuk: {announcement.targetAudience.map(r => roleDisplayNames[r as keyof typeof roleDisplayNames] || r).join(", ")}</span>
                    {announcement.targetClassIds && announcement.targetClassIds.length > 0 && (
                        <>
                         <span>&bull;</span>
                         <span>Kelas: {teacherClasses.filter(tc => announcement.targetClassIds?.includes(tc.id)).map(tc => tc.name).join(", ") || announcement.targetClassIds.join(", ")}</span>
                        </>
                    )}
                    {announcement.createdByName && <span>&bull; Oleh: {announcement.createdByName}</span>}
                  </div>
                </div>
                {canManageAnnouncements && (
                  <div className="flex space-x-2">
                    <Button variant="outline" size="icon" onClick={() => openEditDialog(announcement)} aria-label={`Edit ${announcement.title}`}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon" onClick={() => openDeleteDialog(announcement)} aria-label={`Hapus ${announcement.title}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      {selectedAnnouncement && selectedAnnouncement.id === announcement.id && (
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle><AlertDialogDescription>Tindakan ini akan menghapus pengumuman <span className="font-semibold">"{selectedAnnouncement?.title}"</span>.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setSelectedAnnouncement(null)}>Batal</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteAnnouncement(selectedAnnouncement.id, selectedAnnouncement.title)}>Ya, Hapus Pengumuman</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      )}
                    </AlertDialog>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground whitespace-pre-line line-clamp-3">{announcement.content}</p>
              <Button variant="link" asChild className="p-0 h-auto mt-2 text-primary">
                {/* TODO: Link to a full announcement page, currently not implemented */}
                <Link href={`/announcements`}>Baca Selengkapnya</Link>
              </Button>
            </CardContent>
          </Card>
        ))
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
                  {editAnnouncementForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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


    