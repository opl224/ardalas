
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ClipboardCheck, PlusCircle, Edit, Trash2, CalendarIcon } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";
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

interface AssignmentData {
  id: string;
  title: string;
  subjectId: string;
  subjectName?: string; // Denormalized
  classId: string;
  className?: string; // Denormalized
  teacherId: string;
  teacherName?: string; // Denormalized
  dueDate: Timestamp; // Firestore Timestamp for due date
  description?: string;
  fileURL?: string; // Optional file URL
  createdAt?: Timestamp;
}

const assignmentFormSchema = z.object({
  title: z.string().min(3, { message: "Judul tugas minimal 3 karakter." }),
  subjectId: z.string({ required_error: "Pilih mata pelajaran." }),
  classId: z.string({ required_error: "Pilih kelas." }),
  teacherId: z.string({ required_error: "Pilih guru pemberi tugas." }),
  dueDate: z.date({ required_error: "Batas waktu harus diisi." }),
  description: z.string().optional(),
  fileURL: z.string().url({ message: "Format URL file tidak valid." }).optional().or(z.literal("")),
});
type AssignmentFormValues = z.infer<typeof assignmentFormSchema>;

const editAssignmentFormSchema = assignmentFormSchema.extend({
  id: z.string(),
});
type EditAssignmentFormValues = z.infer<typeof editAssignmentFormSchema>;

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<AssignmentData[]>([]);
  const [subjects, setSubjects] = useState<SubjectMin[]>([]);
  const [classes, setClasses] = useState<ClassMin[]>([]);
  const [teachers, setTeachers] = useState<TeacherMin[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentData | null>(null);

  const { toast } = useToast();

  const addAssignmentForm = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: {
      title: "",
      subjectId: undefined,
      classId: undefined,
      teacherId: undefined,
      dueDate: new Date(),
      description: "",
      fileURL: "",
    },
  });

  const editAssignmentForm = useForm<EditAssignmentFormValues>({
    resolver: zodResolver(editAssignmentFormSchema),
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
      toast({ title: "Gagal Memuat Data Pendukung", description: "Terjadi kesalahan.", variant: "destructive" });
    }
  };
  
  const fetchAssignments = async () => {
    setIsLoading(true);
    try {
      await fetchDropdownData();
      const assignmentsCollectionRef = collection(db, "assignments");
      const q = query(assignmentsCollectionRef, orderBy("dueDate", "desc"));
      const querySnapshot = await getDocs(q);

      const fetchedAssignments: AssignmentData[] = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title,
          subjectId: data.subjectId,
          subjectName: data.subjectName,
          classId: data.classId,
          className: data.className,
          teacherId: data.teacherId,
          teacherName: data.teacherName,
          dueDate: data.dueDate, // Firestore Timestamp
          description: data.description,
          fileURL: data.fileURL,
          createdAt: data.createdAt,
        };
      });
      setAssignments(fetchedAssignments);
    } catch (error) {
      console.error("Error fetching assignments: ", error);
      toast({ title: "Gagal Memuat Data Tugas", description: "Terjadi kesalahan.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  useEffect(() => {
    if (selectedAssignment && isEditDialogOpen) {
      editAssignmentForm.reset({
        id: selectedAssignment.id,
        title: selectedAssignment.title,
        subjectId: selectedAssignment.subjectId,
        classId: selectedAssignment.classId,
        teacherId: selectedAssignment.teacherId,
        dueDate: selectedAssignment.dueDate.toDate(), // Convert Firestore Timestamp to JS Date
        description: selectedAssignment.description || "",
        fileURL: selectedAssignment.fileURL || "",
      });
    }
  }, [selectedAssignment, isEditDialogOpen, editAssignmentForm]);

  const getDenormalizedNames = (data: AssignmentFormValues | EditAssignmentFormValues) => {
    const subject = subjects.find(s => s.id === data.subjectId);
    const aClass = classes.find(c => c.id === data.classId);
    const teacher = teachers.find(t => t.id === data.teacherId);
    return {
      subjectName: subject?.name,
      className: aClass?.name,
      teacherName: teacher?.name,
    };
  };

  const handleAddAssignmentSubmit: SubmitHandler<AssignmentFormValues> = async (data) => {
    addAssignmentForm.clearErrors();
    const { subjectName, className, teacherName } = getDenormalizedNames(data);
    
    if (!subjectName || !className || !teacherName) {
      toast({title: "Data Tidak Lengkap", description: "Pastikan subjek, kelas, dan guru valid.", variant: "destructive"});
      return;
    }

    try {
      await addDoc(collection(db, "assignments"), {
        ...data,
        dueDate: Timestamp.fromDate(data.dueDate),
        subjectName,
        className,
        teacherName,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Tugas Ditambahkan", description: "Tugas berhasil disimpan." });
      setIsAddDialogOpen(false);
      addAssignmentForm.reset({ dueDate: new Date(), title: "", subjectId: undefined, classId: undefined, teacherId: undefined, description: "", fileURL: "" });
      fetchAssignments();
    } catch (error: any) {
      console.error("Error adding assignment:", error);
      toast({ title: "Gagal Menambahkan Tugas", description: "Terjadi kesalahan.", variant: "destructive" });
    }
  };

  const handleEditAssignmentSubmit: SubmitHandler<EditAssignmentFormValues> = async (data) => {
    if (!selectedAssignment) return;
    editAssignmentForm.clearErrors();
    const { subjectName, className, teacherName } = getDenormalizedNames(data);

    if (!subjectName || !className || !teacherName) {
      toast({title: "Data Tidak Lengkap", description: "Pastikan subjek, kelas, dan guru valid.", variant: "destructive"});
      return;
    }

    try {
      const assignmentDocRef = doc(db, "assignments", data.id);
      await updateDoc(assignmentDocRef, {
        ...data, 
        dueDate: Timestamp.fromDate(data.dueDate),
        subjectName,
        className,
        teacherName,
      });
      toast({ title: "Tugas Diperbarui", description: "Tugas berhasil diperbarui." });
      setIsEditDialogOpen(false);
      setSelectedAssignment(null);
      fetchAssignments();
    } catch (error) {
      console.error("Error editing assignment:", error);
      toast({ title: "Gagal Memperbarui Tugas", description: "Terjadi kesalahan.", variant: "destructive" });
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    try {
      await deleteDoc(doc(db, "assignments", assignmentId));
      toast({ title: "Tugas Dihapus", description: "Tugas berhasil dihapus." });
      setSelectedAssignment(null);
      fetchAssignments();
    } catch (error) {
      console.error("Error deleting assignment:", error);
      toast({ title: "Gagal Menghapus Tugas", description: "Terjadi kesalahan.", variant: "destructive" });
    }
  };

  const openEditDialog = (assignment: AssignmentData) => {
    setSelectedAssignment(assignment);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (assignment: AssignmentData) => {
    setSelectedAssignment(assignment);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Tugas</h1>
        <p className="text-muted-foreground">Kelola pemberian tugas, pengumpulan, dan penilaian.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            <span>Daftar Tugas</span>
          </CardTitle>
          <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
            setIsAddDialogOpen(isOpen);
            if (!isOpen) { addAssignmentForm.reset({ dueDate: new Date(), title: "", subjectId: undefined, classId: undefined, teacherId: undefined, description: "", fileURL: "" }); addAssignmentForm.clearErrors(); }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => { if (subjects.length === 0 || classes.length === 0 || teachers.length === 0) fetchDropdownData(); }}>
                <PlusCircle className="mr-2 h-4 w-4" /> Tambah Tugas
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Tambah Tugas Baru</DialogTitle>
                <DialogDescription>
                  Isi detail tugas.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={addAssignmentForm.handleSubmit(handleAddAssignmentSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <div>
                  <Label htmlFor="add-assignment-title">Judul Tugas</Label>
                  <Input id="add-assignment-title" {...addAssignmentForm.register("title")} className="mt-1" />
                  {addAssignmentForm.formState.errors.title && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.title.message}</p>}
                </div>
                <div>
                  <Label htmlFor="add-assignment-subjectId">Mata Pelajaran</Label>
                  <Select onValueChange={(value) => addAssignmentForm.setValue("subjectId", value, { shouldValidate: true })} defaultValue={addAssignmentForm.getValues("subjectId")}>
                    <SelectTrigger id="add-assignment-subjectId" className="mt-1"><SelectValue placeholder="Pilih mata pelajaran" /></SelectTrigger>
                    <SelectContent>
                      {subjects.length === 0 && <SelectItem value="loading" disabled>Memuat...</SelectItem>}
                      {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {addAssignmentForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.subjectId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="add-assignment-classId">Kelas</Label>
                  <Select onValueChange={(value) => addAssignmentForm.setValue("classId", value, { shouldValidate: true })} defaultValue={addAssignmentForm.getValues("classId")}>
                    <SelectTrigger id="add-assignment-classId" className="mt-1"><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                    <SelectContent>
                      {classes.length === 0 && <SelectItem value="loading" disabled>Memuat...</SelectItem>}
                      {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {addAssignmentForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.classId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="add-assignment-teacherId">Guru Pemberi Tugas</Label>
                  <Select onValueChange={(value) => addAssignmentForm.setValue("teacherId", value, { shouldValidate: true })} defaultValue={addAssignmentForm.getValues("teacherId")}>
                    <SelectTrigger id="add-assignment-teacherId" className="mt-1"><SelectValue placeholder="Pilih guru" /></SelectTrigger>
                    <SelectContent>
                      {teachers.length === 0 && <SelectItem value="loading" disabled>Memuat...</SelectItem>}
                      {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {addAssignmentForm.formState.errors.teacherId && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.teacherId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="add-assignment-dueDate">Batas Waktu Pengumpulan</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className="w-full justify-start text-left font-normal mt-1"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {addAssignmentForm.watch("dueDate") ? format(addAssignmentForm.watch("dueDate"), "PPP", { locale: indonesiaLocale }) : <span>Pilih tanggal</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={addAssignmentForm.watch("dueDate")}
                        onSelect={(date) => addAssignmentForm.setValue("dueDate", date || new Date(), { shouldValidate: true })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {addAssignmentForm.formState.errors.dueDate && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.dueDate.message}</p>}
                </div>
                <div>
                  <Label htmlFor="add-assignment-description">Deskripsi Tugas</Label>
                  <Textarea id="add-assignment-description" {...addAssignmentForm.register("description")} className="mt-1" placeholder="Jelaskan detail tugas di sini..." />
                </div>
                 <div>
                  <Label htmlFor="add-assignment-fileURL">URL File Tugas (Opsional)</Label>
                  <Input id="add-assignment-fileURL" {...addAssignmentForm.register("fileURL")} className="mt-1" placeholder="https://contoh.com/file_tugas.pdf" />
                  {addAssignmentForm.formState.errors.fileURL && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.fileURL.message}</p>}
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                  <Button type="submit" disabled={addAssignmentForm.formState.isSubmitting}>{addAssignmentForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Tugas"}</Button>
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
          ) : assignments.length > 0 ? (
            <div className="overflow-x-auto mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Judul Tugas</TableHead>
                    <TableHead>Mata Pelajaran</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead>Guru</TableHead>
                    <TableHead>Batas Waktu</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell className="font-medium">{assignment.title}</TableCell>
                      <TableCell>{assignment.subjectName || assignment.subjectId}</TableCell>
                      <TableCell>{assignment.className || assignment.classId}</TableCell>
                      <TableCell>{assignment.teacherName || assignment.teacherId}</TableCell>
                      <TableCell>{format(assignment.dueDate.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale })}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="icon" onClick={() => openEditDialog(assignment)} aria-label={`Edit tugas ${assignment.title}`}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" onClick={() => openDeleteDialog(assignment)} aria-label={`Hapus tugas ${assignment.title}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          {selectedAssignment && selectedAssignment.id === assignment.id && (
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tindakan ini akan menghapus tugas <span className="font-semibold">{selectedAssignment?.title}</span>.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setSelectedAssignment(null)}>Batal</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteAssignment(selectedAssignment.id)}>Ya, Hapus Tugas</AlertDialogAction>
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
              Belum ada tugas yang ditambahkan.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
        setIsEditDialogOpen(isOpen);
        if (!isOpen) { setSelectedAssignment(null); editAssignmentForm.clearErrors(); }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Tugas</DialogTitle>
            <DialogDescription>Perbarui detail tugas.</DialogDescription>
          </DialogHeader>
          {selectedAssignment && (
            <form onSubmit={editAssignmentForm.handleSubmit(handleEditAssignmentSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <Input type="hidden" {...editAssignmentForm.register("id")} />
               <div>
                  <Label htmlFor="edit-assignment-title">Judul Tugas</Label>
                  <Input id="edit-assignment-title" {...editAssignmentForm.register("title")} className="mt-1" />
                  {editAssignmentForm.formState.errors.title && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.title.message}</p>}
                </div>
                <div>
                  <Label htmlFor="edit-assignment-subjectId">Mata Pelajaran</Label>
                  <Select onValueChange={(value) => editAssignmentForm.setValue("subjectId", value, { shouldValidate: true })} defaultValue={editAssignmentForm.getValues("subjectId")}>
                    <SelectTrigger id="edit-assignment-subjectId" className="mt-1"><SelectValue placeholder="Pilih mata pelajaran" /></SelectTrigger>
                    <SelectContent>
                      {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {editAssignmentForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.subjectId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="edit-assignment-classId">Kelas</Label>
                  <Select onValueChange={(value) => editAssignmentForm.setValue("classId", value, { shouldValidate: true })} defaultValue={editAssignmentForm.getValues("classId")}>
                    <SelectTrigger id="edit-assignment-classId" className="mt-1"><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                    <SelectContent>
                      {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {editAssignmentForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.classId.message}</p>}
                </div>
                 <div>
                  <Label htmlFor="edit-assignment-teacherId">Guru Pemberi Tugas</Label>
                  <Select onValueChange={(value) => editAssignmentForm.setValue("teacherId", value, { shouldValidate: true })} defaultValue={editAssignmentForm.getValues("teacherId")}>
                    <SelectTrigger id="edit-assignment-teacherId" className="mt-1"><SelectValue placeholder="Pilih guru" /></SelectTrigger>
                    <SelectContent>
                      {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {editAssignmentForm.formState.errors.teacherId && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.teacherId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="edit-assignment-dueDate">Batas Waktu Pengumpulan</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className="w-full justify-start text-left font-normal mt-1"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editAssignmentForm.watch("dueDate") ? format(editAssignmentForm.watch("dueDate"), "PPP", { locale: indonesiaLocale }) : <span>Pilih tanggal</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={editAssignmentForm.watch("dueDate")}
                        onSelect={(date) => editAssignmentForm.setValue("dueDate", date || new Date(), { shouldValidate: true })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {editAssignmentForm.formState.errors.dueDate && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.dueDate.message}</p>}
                </div>
                <div>
                  <Label htmlFor="edit-assignment-description">Deskripsi Tugas</Label>
                  <Textarea id="edit-assignment-description" {...editAssignmentForm.register("description")} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="edit-assignment-fileURL">URL File Tugas (Opsional)</Label>
                  <Input id="edit-assignment-fileURL" {...editAssignmentForm.register("fileURL")} className="mt-1" />
                  {editAssignmentForm.formState.errors.fileURL && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.fileURL.message}</p>}
                </div>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                <Button type="submit" disabled={editAssignmentForm.formState.isSubmitting}>{editAssignmentForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

