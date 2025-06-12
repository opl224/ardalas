
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
import { School, PlusCircle, Edit, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
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

interface TeacherMin { // Minimal teacher interface for dropdown
  id: string;
  name: string;
}

interface ClassData {
  id: string; 
  name: string; // e.g., "Kelas 10A", "XI IPA 1"
  teacherId?: string; // ID of the homeroom teacher
  teacherName?: string; // Denormalized name for display
  createdAt?: Timestamp; 
}

const classFormSchema = z.object({
  name: z.string().min(3, { message: "Nama kelas minimal 3 karakter." }),
  teacherId: z.string().optional(), // Wali kelas is optional
});
type ClassFormValues = z.infer<typeof classFormSchema>;

const editClassFormSchema = classFormSchema.extend({
  id: z.string(),
});
type EditClassFormValues = z.infer<typeof editClassFormSchema>;

const NO_TEACHER_VALUE = "_NONE_";

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [teachers, setTeachers] = useState<TeacherMin[]>([]); // For teacher dropdown
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);

  const { toast } = useToast();

  const addClassForm = useForm<ClassFormValues>({
    resolver: zodResolver(classFormSchema),
    defaultValues: {
      name: "",
      teacherId: undefined,
    },
  });

  const editClassForm = useForm<EditClassFormValues>({
    resolver: zodResolver(editClassFormSchema),
  });

  const fetchTeachersForDropdown = async () => {
    try {
      const teachersCollectionRef = collection(db, "teachers");
      const q = query(teachersCollectionRef, orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const fetchedTeachers: TeacherMin[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name,
      }));
      setTeachers(fetchedTeachers);
    } catch (error) {
      console.error("Error fetching teachers for dropdown: ", error);
      toast({
        title: "Gagal Memuat Data Guru",
        description: "Terjadi kesalahan saat mengambil daftar guru untuk pilihan wali kelas.",
        variant: "destructive",
      });
    }
  };
  
  const fetchClasses = async () => {
    setIsLoading(true);
    try {
      await fetchTeachersForDropdown(); 
      const classesCollectionRef = collection(db, "classes");
      const q = query(classesCollectionRef, orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const fetchedClasses: ClassData[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name,
        teacherId: docSnap.data().teacherId,
        teacherName: docSnap.data().teacherName,
        createdAt: docSnap.data().createdAt,
      }));
      setClasses(fetchedClasses);
    } catch (error) {
      console.error("Error fetching classes: ", error);
      toast({
        title: "Gagal Memuat Data Kelas",
        description: "Terjadi kesalahan saat mengambil data kelas.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedClass && isEditDialogOpen) {
      editClassForm.reset({
        id: selectedClass.id,
        name: selectedClass.name,
        teacherId: selectedClass.teacherId || undefined, // Ensure undefined for no teacher
      });
    }
  }, [selectedClass, isEditDialogOpen, editClassForm]);

  const handleAddClassSubmit: SubmitHandler<ClassFormValues> = async (data) => {
    addClassForm.clearErrors();
    const selectedTeacher = data.teacherId ? teachers.find(t => t.id === data.teacherId) : undefined;
    
    try {
      const classesCollectionRef = collection(db, "classes");
      await addDoc(classesCollectionRef, {
        name: data.name,
        teacherId: data.teacherId || null, 
        teacherName: selectedTeacher?.name || null, 
        createdAt: serverTimestamp(),
      });
      
      toast({ title: "Kelas Ditambahkan", description: `${data.name} berhasil ditambahkan.` });
      setIsAddDialogOpen(false);
      addClassForm.reset();
      fetchClasses(); 
    } catch (error: any) {
      console.error("Error adding class:", error);
      toast({
        title: "Gagal Menambahkan Kelas",
        description: "Terjadi kesalahan.",
        variant: "destructive",
      });
    }
  };

  const handleEditClassSubmit: SubmitHandler<EditClassFormValues> = async (data) => {
    if (!selectedClass) return;
    editClassForm.clearErrors();
    const selectedTeacher = data.teacherId ? teachers.find(t => t.id === data.teacherId) : undefined;

    try {
      const classDocRef = doc(db, "classes", data.id);
      await updateDoc(classDocRef, {
        name: data.name,
        teacherId: data.teacherId || null,
        teacherName: selectedTeacher?.name || null,
      });
      
      toast({ title: "Data Kelas Diperbarui", description: `${data.name} berhasil diperbarui.` });
      setIsEditDialogOpen(false);
      setSelectedClass(null);
      fetchClasses();
    } catch (error) {
      console.error("Error editing class:", error);
      toast({
        title: "Gagal Memperbarui Data Kelas",
        description: "Terjadi kesalahan.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClass = async (classId: string, className?: string) => {
    try {
      await deleteDoc(doc(db, "classes", classId));
      toast({ title: "Data Kelas Dihapus", description: `${className || 'Kelas'} berhasil dihapus.` });
      setSelectedClass(null); 
      fetchClasses();
    } catch (error) {
      console.error("Error deleting class:", error);
      toast({
        title: "Gagal Menghapus Kelas",
        description: "Terjadi kesalahan.",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (classItem: ClassData) => {
    setSelectedClass(classItem);
    setIsEditDialogOpen(true);
  };
  
  const openDeleteDialog = (classItem: ClassData) => {
    setSelectedClass(classItem); 
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Kelas</h1>
        <p className="text-muted-foreground">Kelola daftar kelas, wali kelas, dan siswa per kelas.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <School className="h-6 w-6 text-primary" />
            <span>Daftar Kelas</span>
          </CardTitle>
          <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
            setIsAddDialogOpen(isOpen);
            if (!isOpen) {
              addClassForm.reset();
              addClassForm.clearErrors();
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => { if (teachers.length === 0) fetchTeachersForDropdown(); }}>
                <PlusCircle className="mr-2 h-4 w-4" /> Tambah Kelas
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Tambah Kelas Baru</DialogTitle>
                <DialogDescription>
                  Isi detail kelas dan pilih wali kelas jika ada.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={addClassForm.handleSubmit(handleAddClassSubmit)} className="space-y-4 py-4">
                <div>
                  <Label htmlFor="add-class-name">Nama Kelas</Label>
                  <Input id="add-class-name" {...addClassForm.register("name")} className="mt-1" placeholder="Contoh: 10A, XI IPA 1" />
                  {addClassForm.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">{addClassForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="add-class-teacherId">Wali Kelas (Opsional)</Label>
                  <Select
                    onValueChange={(value) => addClassForm.setValue("teacherId", value === NO_TEACHER_VALUE ? undefined : value, { shouldValidate: true })}
                    defaultValue={addClassForm.getValues("teacherId")}
                  >
                    <SelectTrigger id="add-class-teacherId" className="mt-1">
                      <SelectValue placeholder="Pilih wali kelas" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.length === 0 && <SelectItem value="loading" disabled>Memuat guru...</SelectItem>}
                      <SelectItem value={NO_TEACHER_VALUE}>Tidak Ada Wali Kelas</SelectItem>
                      {teachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {addClassForm.formState.errors.teacherId && (
                    <p className="text-sm text-destructive mt-1">{addClassForm.formState.errors.teacherId.message}</p>
                  )}
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                     <Button type="button" variant="outline">Batal</Button>
                  </DialogClose>
                  <Button type="submit" disabled={addClassForm.formState.isSubmitting}>
                    {addClassForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Kelas"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
             <div className="space-y-2 mt-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
             </div>
          ) : classes.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Kelas</TableHead>
                    <TableHead>Wali Kelas</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classes.map((classItem) => (
                    <TableRow key={classItem.id}>
                      <TableCell className="font-medium">{classItem.name}</TableCell>
                      <TableCell>{classItem.teacherName || "-"}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="icon" onClick={() => openEditDialog(classItem)} aria-label={`Edit ${classItem.name}`}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" onClick={() => openDeleteDialog(classItem)} aria-label={`Hapus ${classItem.name}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          {selectedClass && selectedClass.id === classItem.id && ( 
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tindakan ini akan menghapus kelas <span className="font-semibold">{selectedClass?.name}</span>. Data yang dihapus tidak dapat dikembalikan.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setSelectedClass(null)}>Batal</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteClass(selectedClass.id, selectedClass.name)}>
                                  Ya, Hapus Kelas
                                </AlertDialogAction>
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
              Tidak ada data kelas untuk ditampilkan. Klik "Tambah Kelas" untuk membuat data baru.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
          setIsEditDialogOpen(isOpen);
          if (!isOpen) {
            setSelectedClass(null);
            editClassForm.clearErrors();
          }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Data Kelas</DialogTitle>
            <DialogDescription>
              Perbarui detail data kelas.
            </DialogDescription>
          </DialogHeader>
          {selectedClass && (
            <form onSubmit={editClassForm.handleSubmit(handleEditClassSubmit)} className="space-y-4 py-4">
              <Input type="hidden" {...editClassForm.register("id")} />
              <div>
                <Label htmlFor="edit-class-name">Nama Kelas</Label>
                <Input id="edit-class-name" {...editClassForm.register("name")} className="mt-1" />
                {editClassForm.formState.errors.name && (
                  <p className="text-sm text-destructive mt-1">{editClassForm.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                  <Label htmlFor="edit-class-teacherId">Wali Kelas (Opsional)</Label>
                  <Select
                    onValueChange={(value) => editClassForm.setValue("teacherId", value === NO_TEACHER_VALUE ? undefined : value, { shouldValidate: true })}
                    defaultValue={editClassForm.getValues("teacherId") || undefined}
                  >
                    <SelectTrigger id="edit-class-teacherId" className="mt-1">
                      <SelectValue placeholder="Pilih wali kelas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TEACHER_VALUE}>Tidak Ada Wali Kelas</SelectItem>
                      {teachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {editClassForm.formState.errors.teacherId && (
                    <p className="text-sm text-destructive mt-1">{editClassForm.formState.errors.teacherId.message}</p>
                  )}
                </div>
              <DialogFooter>
                 <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={() => { setIsEditDialogOpen(false); setSelectedClass(null); }}>Batal</Button>
                 </DialogClose>
                <Button type="submit" disabled={editClassForm.formState.isSubmitting}>
                  {editClassForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

    
