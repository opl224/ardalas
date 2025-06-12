
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BookCopy, PlusCircle, Edit, Trash2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase/config";
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
  orderBy
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";

// Minimal interfaces for dropdowns
interface SubjectMin { id: string; name: string; }
interface ClassMin { id: string; name: string; }
interface TeacherMin { id: string; name: string; }

interface LessonData {
  id: string;
  subjectId: string;
  subjectName?: string; // Denormalized
  classId: string;
  className?: string; // Denormalized
  teacherId: string;
  teacherName?: string; // Denormalized
  dayOfWeek: string; // e.g., "Senin", "Selasa"
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  topic?: string;
  materials?: string;
  createdAt?: Timestamp;
}

const DAYS_OF_WEEK = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM format

const lessonFormSchema = z.object({
  subjectId: z.string({ required_error: "Pilih mata pelajaran." }),
  classId: z.string({ required_error: "Pilih kelas." }),
  teacherId: z.string({ required_error: "Pilih guru." }),
  dayOfWeek: z.enum(DAYS_OF_WEEK, { required_error: "Pilih hari." }),
  startTime: z.string().regex(timeRegex, { message: "Format waktu mulai JJ:MM (e.g., 07:00)." }),
  endTime: z.string().regex(timeRegex, { message: "Format waktu selesai JJ:MM (e.g., 08:30)." }),
  topic: z.string().optional(),
  materials: z.string().optional(),
}).refine(data => {
    // Basic validation: endTime must be after startTime
    const [startH, startM] = data.startTime.split(':').map(Number);
    const [endH, endM] = data.endTime.split(':').map(Number);
    if (endH < startH || (endH === startH && endM <= startM)) {
        return false;
    }
    return true;
}, {
    message: "Waktu selesai harus setelah waktu mulai.",
    path: ["endTime"],
});

type LessonFormValues = z.infer<typeof lessonFormSchema>;

const editLessonFormSchema = lessonFormSchema.extend({
  id: z.string(),
});
type EditLessonFormValues = z.infer<typeof editLessonFormSchema>;

export default function LessonsPage() {
  const [lessons, setLessons] = useState<LessonData[]>([]);
  const [subjects, setSubjects] = useState<SubjectMin[]>([]);
  const [classes, setClasses] = useState<ClassMin[]>([]);
  const [teachers, setTeachers] = useState<TeacherMin[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<LessonData | null>(null);

  const { toast } = useToast();

  const addLessonForm = useForm<LessonFormValues>({
    resolver: zodResolver(lessonFormSchema),
    defaultValues: {
      subjectId: undefined,
      classId: undefined,
      teacherId: undefined,
      dayOfWeek: undefined,
      startTime: "",
      endTime: "",
      topic: "",
      materials: "",
    },
  });

  const editLessonForm = useForm<EditLessonFormValues>({
    resolver: zodResolver(editLessonFormSchema),
  });

  const fetchDropdownData = async () => {
    try {
      const [subjectsSnapshot, classesSnapshot, teachersSnapshot] = await Promise.all([
        getDocs(query(collection(db, "subjects"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "classes"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "teachers"), orderBy("name", "asc"))),
      ]);
      setSubjects(subjectsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
      setClasses(classesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
      setTeachers(teachersSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    } catch (error) {
      console.error("Error fetching dropdown data: ", error);
      toast({ title: "Gagal Memuat Data Pendukung", description: "Terjadi kesalahan saat memuat data subjek, kelas, atau guru.", variant: "destructive" });
    }
  };
  
  const fetchLessons = async () => {
    setIsLoading(true);
    try {
      await fetchDropdownData(); // Ensure dropdowns are loaded
      const lessonsCollectionRef = collection(db, "lessons");
      // Consider ordering by dayOfWeek then startTime, though this requires composite index or careful client-side sort
      const q = query(lessonsCollectionRef, orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);

      const fetchedLessons: LessonData[] = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          subjectId: data.subjectId,
          subjectName: data.subjectName,
          classId: data.classId,
          className: data.className,
          teacherId: data.teacherId,
          teacherName: data.teacherName,
          dayOfWeek: data.dayOfWeek,
          startTime: data.startTime,
          endTime: data.endTime,
          topic: data.topic,
          materials: data.materials,
          createdAt: data.createdAt,
        };
      });
      setLessons(fetchedLessons);
    } catch (error) {
      console.error("Error fetching lessons: ", error);
      toast({ title: "Gagal Memuat Jadwal Pelajaran", description: "Terjadi kesalahan.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLessons();
  }, []);

  useEffect(() => {
    if (selectedLesson && isEditDialogOpen) {
      editLessonForm.reset({
        id: selectedLesson.id,
        subjectId: selectedLesson.subjectId,
        classId: selectedLesson.classId,
        teacherId: selectedLesson.teacherId,
        dayOfWeek: selectedLesson.dayOfWeek as typeof DAYS_OF_WEEK[number],
        startTime: selectedLesson.startTime,
        endTime: selectedLesson.endTime,
        topic: selectedLesson.topic || "",
        materials: selectedLesson.materials || "",
      });
    }
  }, [selectedLesson, isEditDialogOpen, editLessonForm]);

  const getDenormalizedNames = (data: LessonFormValues) => {
    const subject = subjects.find(s => s.id === data.subjectId);
    const aClass = classes.find(c => c.id === data.classId);
    const teacher = teachers.find(t => t.id === data.teacherId);
    return {
      subjectName: subject?.name,
      className: aClass?.name,
      teacherName: teacher?.name,
    };
  };

  const handleAddLessonSubmit: SubmitHandler<LessonFormValues> = async (data) => {
    addLessonForm.clearErrors();
    const { subjectName, className, teacherName } = getDenormalizedNames(data);
    
    if (!subjectName || !className || !teacherName) {
      toast({title: "Data Tidak Lengkap", description: "Pastikan subjek, kelas, dan guru valid.", variant: "destructive"});
      return;
    }

    try {
      await addDoc(collection(db, "lessons"), {
        ...data,
        subjectName,
        className,
        teacherName,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Pelajaran Ditambahkan", description: "Jadwal pelajaran berhasil disimpan." });
      setIsAddDialogOpen(false);
      addLessonForm.reset();
      fetchLessons();
    } catch (error: any) {
      console.error("Error adding lesson:", error);
      toast({ title: "Gagal Menambahkan Pelajaran", description: "Terjadi kesalahan.", variant: "destructive" });
    }
  };

  const handleEditLessonSubmit: SubmitHandler<EditLessonFormValues> = async (data) => {
    if (!selectedLesson) return;
    editLessonForm.clearErrors();
    const { subjectName, className, teacherName } = getDenormalizedNames(data);

    if (!subjectName || !className || !teacherName) {
      toast({title: "Data Tidak Lengkap", description: "Pastikan subjek, kelas, dan guru valid.", variant: "destructive"});
      return;
    }

    try {
      const lessonDocRef = doc(db, "lessons", data.id);
      await updateDoc(lessonDocRef, {
        ...data,
        subjectName,
        className,
        teacherName,
      });
      toast({ title: "Pelajaran Diperbarui", description: "Jadwal pelajaran berhasil diperbarui." });
      setIsEditDialogOpen(false);
      setSelectedLesson(null);
      fetchLessons();
    } catch (error) {
      console.error("Error editing lesson:", error);
      toast({ title: "Gagal Memperbarui Pelajaran", description: "Terjadi kesalahan.", variant: "destructive" });
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    try {
      await deleteDoc(doc(db, "lessons", lessonId));
      toast({ title: "Pelajaran Dihapus", description: "Jadwal pelajaran berhasil dihapus." });
      setSelectedLesson(null);
      fetchLessons();
    } catch (error) {
      console.error("Error deleting lesson:", error);
      toast({ title: "Gagal Menghapus Pelajaran", description: "Terjadi kesalahan.", variant: "destructive" });
    }
  };

  const openEditDialog = (lesson: LessonData) => {
    setSelectedLesson(lesson);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (lesson: LessonData) => {
    setSelectedLesson(lesson);
  };

  const sortedLessons = useMemo(() => {
    return [...lessons].sort((a, b) => {
      const dayIndexA = DAYS_OF_WEEK.indexOf(a.dayOfWeek as any);
      const dayIndexB = DAYS_OF_WEEK.indexOf(b.dayOfWeek as any);
      if (dayIndexA !== dayIndexB) return dayIndexA - dayIndexB;
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return (a.subjectName || "").localeCompare(b.subjectName || "");
    });
  }, [lessons]);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Pelajaran</h1>
        <p className="text-muted-foreground">Kelola jadwal pelajaran, materi ajar, dan silabus.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <BookCopy className="h-6 w-6 text-primary" />
            <span>Jadwal & Materi Pelajaran</span>
          </CardTitle>
          <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
            setIsAddDialogOpen(isOpen);
            if (!isOpen) { addLessonForm.reset(); addLessonForm.clearErrors(); }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => { if (subjects.length === 0 || classes.length === 0 || teachers.length === 0) fetchDropdownData(); }}>
                <PlusCircle className="mr-2 h-4 w-4" /> Tambah Pelajaran
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Tambah Jadwal Pelajaran Baru</DialogTitle>
                <DialogDescription>
                  Isi detail jadwal pelajaran.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={addLessonForm.handleSubmit(handleAddLessonSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <div>
                  <Label htmlFor="add-lesson-subjectId">Mata Pelajaran</Label>
                  <Select onValueChange={(value) => addLessonForm.setValue("subjectId", value, { shouldValidate: true })} defaultValue={addLessonForm.getValues("subjectId")}>
                    <SelectTrigger id="add-lesson-subjectId" className="mt-1"><SelectValue placeholder="Pilih mata pelajaran" /></SelectTrigger>
                    <SelectContent>
                      {subjects.length === 0 && <SelectItem value="loading" disabled>Memuat...</SelectItem>}
                      {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {addLessonForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.subjectId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="add-lesson-classId">Kelas</Label>
                  <Select onValueChange={(value) => addLessonForm.setValue("classId", value, { shouldValidate: true })} defaultValue={addLessonForm.getValues("classId")}>
                    <SelectTrigger id="add-lesson-classId" className="mt-1"><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                    <SelectContent>
                      {classes.length === 0 && <SelectItem value="loading" disabled>Memuat...</SelectItem>}
                      {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {addLessonForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.classId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="add-lesson-teacherId">Guru Pengajar</Label>
                  <Select onValueChange={(value) => addLessonForm.setValue("teacherId", value, { shouldValidate: true })} defaultValue={addLessonForm.getValues("teacherId")}>
                    <SelectTrigger id="add-lesson-teacherId" className="mt-1"><SelectValue placeholder="Pilih guru" /></SelectTrigger>
                    <SelectContent>
                      {teachers.length === 0 && <SelectItem value="loading" disabled>Memuat...</SelectItem>}
                      {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {addLessonForm.formState.errors.teacherId && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.teacherId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="add-lesson-dayOfWeek">Hari</Label>
                  <Select onValueChange={(value) => addLessonForm.setValue("dayOfWeek", value as any, { shouldValidate: true })} defaultValue={addLessonForm.getValues("dayOfWeek")}>
                    <SelectTrigger id="add-lesson-dayOfWeek" className="mt-1"><SelectValue placeholder="Pilih hari" /></SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map(day => <SelectItem key={day} value={day}>{day}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {addLessonForm.formState.errors.dayOfWeek && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.dayOfWeek.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="add-lesson-startTime">Waktu Mulai</Label>
                        <Input id="add-lesson-startTime" type="time" {...addLessonForm.register("startTime")} className="mt-1" />
                        {addLessonForm.formState.errors.startTime && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.startTime.message}</p>}
                    </div>
                    <div>
                        <Label htmlFor="add-lesson-endTime">Waktu Selesai</Label>
                        <Input id="add-lesson-endTime" type="time" {...addLessonForm.register("endTime")} className="mt-1" />
                        {addLessonForm.formState.errors.endTime && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.endTime.message}</p>}
                    </div>
                </div>
                <div>
                  <Label htmlFor="add-lesson-topic">Topik (Opsional)</Label>
                  <Input id="add-lesson-topic" {...addLessonForm.register("topic")} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="add-lesson-materials">Materi (Opsional)</Label>
                  <Textarea id="add-lesson-materials" {...addLessonForm.register("materials")} className="mt-1" placeholder="Deskripsi singkat materi atau link..." />
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                  <Button type="submit" disabled={addLessonForm.formState.isSubmitting}>{addLessonForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Jadwal"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2 mt-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : sortedLessons.length > 0 ? (
            <div className="overflow-x-auto mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mata Pelajaran</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead>Guru</TableHead>
                    <TableHead>Hari</TableHead>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Topik</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedLessons.map((lesson) => (
                    <TableRow key={lesson.id}>
                      <TableCell className="font-medium">{lesson.subjectName || lesson.subjectId}</TableCell>
                      <TableCell>{lesson.className || lesson.classId}</TableCell>
                      <TableCell>{lesson.teacherName || lesson.teacherId}</TableCell>
                      <TableCell>{lesson.dayOfWeek}</TableCell>
                      <TableCell>{lesson.startTime} - {lesson.endTime}</TableCell>
                      <TableCell>{lesson.topic || "-"}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="icon" onClick={() => openEditDialog(lesson)} aria-label={`Edit pelajaran ${lesson.subjectName}`}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" onClick={() => openDeleteDialog(lesson)} aria-label={`Hapus pelajaran ${lesson.subjectName}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          {selectedLesson && selectedLesson.id === lesson.id && (
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tindakan ini akan menghapus jadwal pelajaran <span className="font-semibold">{selectedLesson?.subjectName} ({selectedLesson?.className})</span> pada hari {selectedLesson?.dayOfWeek}.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setSelectedLesson(null)}>Batal</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteLesson(selectedLesson.id)}>Ya, Hapus Jadwal</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          )}
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
              Belum ada jadwal pelajaran yang ditambahkan.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
        setIsEditDialogOpen(isOpen);
        if (!isOpen) { setSelectedLesson(null); editLessonForm.clearErrors(); }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Jadwal Pelajaran</DialogTitle>
            <DialogDescription>Perbarui detail jadwal pelajaran.</DialogDescription>
          </DialogHeader>
          {selectedLesson && (
            <form onSubmit={editLessonForm.handleSubmit(handleEditLessonSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <Input type="hidden" {...editLessonForm.register("id")} />
              <div>
                <Label htmlFor="edit-lesson-subjectId">Mata Pelajaran</Label>
                <Select onValueChange={(value) => editLessonForm.setValue("subjectId", value, { shouldValidate: true })} defaultValue={editLessonForm.getValues("subjectId")}>
                  <SelectTrigger id="edit-lesson-subjectId" className="mt-1"><SelectValue placeholder="Pilih mata pelajaran" /></SelectTrigger>
                  <SelectContent>
                    {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {editLessonForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.subjectId.message}</p>}
              </div>
              <div>
                <Label htmlFor="edit-lesson-classId">Kelas</Label>
                <Select onValueChange={(value) => editLessonForm.setValue("classId", value, { shouldValidate: true })} defaultValue={editLessonForm.getValues("classId")}>
                  <SelectTrigger id="edit-lesson-classId" className="mt-1"><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                  <SelectContent>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {editLessonForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.classId.message}</p>}
              </div>
               <div>
                <Label htmlFor="edit-lesson-teacherId">Guru Pengajar</Label>
                <Select onValueChange={(value) => editLessonForm.setValue("teacherId", value, { shouldValidate: true })} defaultValue={editLessonForm.getValues("teacherId")}>
                  <SelectTrigger id="edit-lesson-teacherId" className="mt-1"><SelectValue placeholder="Pilih guru" /></SelectTrigger>
                  <SelectContent>
                    {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {editLessonForm.formState.errors.teacherId && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.teacherId.message}</p>}
              </div>
              <div>
                <Label htmlFor="edit-lesson-dayOfWeek">Hari</Label>
                <Select onValueChange={(value) => editLessonForm.setValue("dayOfWeek", value as any, { shouldValidate: true })} defaultValue={editLessonForm.getValues("dayOfWeek")}>
                  <SelectTrigger id="edit-lesson-dayOfWeek" className="mt-1"><SelectValue placeholder="Pilih hari" /></SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map(day => <SelectItem key={day} value={day}>{day}</SelectItem>)}
                  </SelectContent>
                </Select>
                {editLessonForm.formState.errors.dayOfWeek && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.dayOfWeek.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <Label htmlFor="edit-lesson-startTime">Waktu Mulai</Label>
                      <Input id="edit-lesson-startTime" type="time" {...editLessonForm.register("startTime")} className="mt-1" />
                      {editLessonForm.formState.errors.startTime && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.startTime.message}</p>}
                  </div>
                  <div>
                      <Label htmlFor="edit-lesson-endTime">Waktu Selesai</Label>
                      <Input id="edit-lesson-endTime" type="time" {...editLessonForm.register("endTime")} className="mt-1" />
                      {editLessonForm.formState.errors.endTime && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.endTime.message}</p>}
                  </div>
              </div>
              <div>
                <Label htmlFor="edit-lesson-topic">Topik (Opsional)</Label>
                <Input id="edit-lesson-topic" {...editLessonForm.register("topic")} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="edit-lesson-materials">Materi (Opsional)</Label>
                <Textarea id="edit-lesson-materials" {...editLessonForm.register("materials")} className="mt-1" />
              </div>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                <Button type="submit" disabled={editLessonForm.formState.isSubmitting}>{editLessonForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

