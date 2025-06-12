
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
import { Users, PlusCircle, Edit, Trash2 } from "lucide-react"; // Can use a different icon if desired, e.g. GraduationCap
import { useState, useEffect, type ReactNode } from "react";
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
import type { Metadata } from 'next';

// export const metadata: Metadata = { // Metadata should be defined in Server Components or layout files, not client.
//   title: 'Manajemen Murid - SDN',
//   description: 'Kelola data murid di SDN.',
// };

interface Student {
  id: string; 
  name: string;
  nis: string; // Nomor Induk Siswa
  email: string;
  kelas: string; // Kelas, e.g., "10A", "11B"
  createdAt?: Timestamp; 
}

const studentFormSchema = z.object({
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }),
  nis: z.string().min(5, { message: "NIS minimal 5 karakter." }),
  email: z.string().email({ message: "Format email tidak valid." }).optional().or(z.literal("")), // Email is optional
  kelas: z.string().min(1, { message: "Kelas tidak boleh kosong." }),
});
type StudentFormValues = z.infer<typeof studentFormSchema>;

const editStudentFormSchema = studentFormSchema.extend({
  id: z.string(),
});
type EditStudentFormValues = z.infer<typeof editStudentFormSchema>;

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isAddStudentDialogOpen, setIsAddStudentDialogOpen] = useState(false);
  const [isEditStudentDialogOpen, setIsEditStudentDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const { toast } = useToast();

  const addStudentForm = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      name: "",
      nis: "",
      email: "",
      kelas: "",
    },
  });

  const editStudentForm = useForm<EditStudentFormValues>({
    resolver: zodResolver(editStudentFormSchema),
  });

  const fetchStudents = async () => {
    setIsLoadingStudents(true);
    try {
      const studentsCollectionRef = collection(db, "students");
      const q = query(studentsCollectionRef, orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const fetchedStudents: Student[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name,
        nis: docSnap.data().nis,
        email: docSnap.data().email,
        kelas: docSnap.data().kelas,
        createdAt: docSnap.data().createdAt,
      }));
      setStudents(fetchedStudents);
    } catch (error) {
      console.error("Error fetching students: ", error);
      toast({
        title: "Gagal Memuat Data Murid",
        description: "Terjadi kesalahan saat mengambil data murid.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingStudents(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  useEffect(() => {
    if (selectedStudent && isEditStudentDialogOpen) {
      editStudentForm.reset({
        id: selectedStudent.id,
        name: selectedStudent.name,
        nis: selectedStudent.nis,
        email: selectedStudent.email || "",
        kelas: selectedStudent.kelas,
      });
    }
  }, [selectedStudent, isEditStudentDialogOpen, editStudentForm]);

  const handleAddStudentSubmit: SubmitHandler<StudentFormValues> = async (data) => {
    addStudentForm.clearErrors();
    try {
      const studentsCollectionRef = collection(db, "students");
      await addDoc(studentsCollectionRef, {
        ...data,
        createdAt: serverTimestamp(),
      });
      
      toast({ title: "Murid Ditambahkan", description: `${data.name} berhasil ditambahkan.` });
      setIsAddStudentDialogOpen(false);
      addStudentForm.reset();
      fetchStudents(); 
    } catch (error: any) {
      console.error("Error adding student:", error);
      let errorMessage = "Gagal menambahkan murid.";
       if (error.message && error.message.includes("Missing or insufficient permissions")) {
        errorMessage = "Anda tidak memiliki izin untuk menambahkan murid.";
      }
      toast({
        title: "Gagal Menambahkan Murid",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleEditStudentSubmit: SubmitHandler<EditStudentFormValues> = async (data) => {
    if (!selectedStudent) return;
    editStudentForm.clearErrors();
    try {
      const studentDocRef = doc(db, "students", data.id);
      await updateDoc(studentDocRef, {
        name: data.name,
        nis: data.nis,
        email: data.email,
        kelas: data.kelas,
      });
      
      toast({ title: "Data Murid Diperbarui", description: `${data.name} berhasil diperbarui.` });
      setIsEditStudentDialogOpen(false);
      setSelectedStudent(null);
      fetchStudents();
    } catch (error) {
      console.error("Error editing student:", error);
      toast({
        title: "Gagal Memperbarui Data Murid",
        description: "Terjadi kesalahan saat memperbarui data murid.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteStudent = async (studentId: string, studentName?: string) => {
    try {
      await deleteDoc(doc(db, "students", studentId));
      toast({ title: "Data Murid Dihapus", description: `${studentName || 'Murid'} berhasil dihapus.` });
      setSelectedStudent(null); 
      fetchStudents();
    } catch (error) {
      console.error("Error deleting student:", error);
      toast({
        title: "Gagal Menghapus Murid",
        description: "Terjadi kesalahan saat menghapus data murid.",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (student: Student) => {
    setSelectedStudent(student);
    setIsEditStudentDialogOpen(true);
  };
  
  const openDeleteDialog = (student: Student) => {
    setSelectedStudent(student); 
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Murid</h1>
        <p className="text-muted-foreground">Kelola data murid, absensi, nilai, dan informasi terkait.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Users className="h-6 w-6 text-primary" />
            <span>Daftar Murid</span>
          </CardTitle>
          <Dialog open={isAddStudentDialogOpen} onOpenChange={(isOpen) => {
            setIsAddStudentDialogOpen(isOpen);
            if (!isOpen) {
              addStudentForm.reset();
              addStudentForm.clearErrors();
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusCircle className="mr-2 h-4 w-4" /> Tambah Murid
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Tambah Murid Baru</DialogTitle>
                <DialogDescription>
                  Isi detail murid untuk menambahkan data baru.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={addStudentForm.handleSubmit(handleAddStudentSubmit)} className="space-y-4 py-4">
                <div>
                  <Label htmlFor="add-student-name">Nama Lengkap</Label>
                  <Input id="add-student-name" {...addStudentForm.register("name")} className="mt-1" />
                  {addStudentForm.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">{addStudentForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="add-student-nis">NIS</Label>
                  <Input id="add-student-nis" {...addStudentForm.register("nis")} className="mt-1" />
                  {addStudentForm.formState.errors.nis && (
                    <p className="text-sm text-destructive mt-1">{addStudentForm.formState.errors.nis.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="add-student-email">Email (Opsional)</Label>
                  <Input id="add-student-email" type="email" {...addStudentForm.register("email")} className="mt-1" />
                  {addStudentForm.formState.errors.email && (
                    <p className="text-sm text-destructive mt-1">{addStudentForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="add-student-kelas">Kelas</Label>
                  <Input id="add-student-kelas" {...addStudentForm.register("kelas")} className="mt-1" placeholder="Contoh: 10A, XI IPA 1"/>
                  {addStudentForm.formState.errors.kelas && (
                    <p className="text-sm text-destructive mt-1">{addStudentForm.formState.errors.kelas.message}</p>
                  )}
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                     <Button type="button" variant="outline">Batal</Button>
                  </DialogClose>
                  <Button type="submit" disabled={addStudentForm.formState.isSubmitting}>
                    {addStudentForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Murid"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoadingStudents ? (
             <div className="space-y-2 mt-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
             </div>
          ) : students.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>NIS</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>{student.nis}</TableCell>
                      <TableCell>{student.email || "-"}</TableCell>
                      <TableCell>{student.kelas}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="icon" onClick={() => openEditDialog(student)} aria-label={`Edit ${student.name}`}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" onClick={() => openDeleteDialog(student)} aria-label={`Hapus ${student.name}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          {selectedStudent && selectedStudent.id === student.id && ( 
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tindakan ini akan menghapus data murid <span className="font-semibold"> {selectedStudent?.name} </span> (NIS: {selectedStudent?.nis}). Data yang dihapus tidak dapat dikembalikan.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setSelectedStudent(null)}>Batal</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteStudent(selectedStudent.id, selectedStudent.name)}>
                                  Ya, Hapus Data
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
              Tidak ada data murid untuk ditampilkan. Klik "Tambah Murid" untuk membuat data baru.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditStudentDialogOpen} onOpenChange={(isOpen) => {
          setIsEditStudentDialogOpen(isOpen);
          if (!isOpen) {
            setSelectedStudent(null);
            editStudentForm.clearErrors();
          }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Data Murid</DialogTitle>
            <DialogDescription>
              Perbarui detail data murid.
            </DialogDescription>
          </DialogHeader>
          {selectedStudent && (
            <form onSubmit={editStudentForm.handleSubmit(handleEditStudentSubmit)} className="space-y-4 py-4">
              <Input type="hidden" {...editStudentForm.register("id")} />
              <div>
                <Label htmlFor="edit-student-name">Nama Lengkap</Label>
                <Input id="edit-student-name" {...editStudentForm.register("name")} className="mt-1" />
                {editStudentForm.formState.errors.name && (
                  <p className="text-sm text-destructive mt-1">{editStudentForm.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-student-nis">NIS</Label>
                <Input id="edit-student-nis" {...editStudentForm.register("nis")} className="mt-1" />
                {editStudentForm.formState.errors.nis && (
                  <p className="text-sm text-destructive mt-1">{editStudentForm.formState.errors.nis.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-student-email">Email (Opsional)</Label>
                <Input id="edit-student-email" type="email" {...editStudentForm.register("email")} className="mt-1" />
                {editStudentForm.formState.errors.email && (
                  <p className="text-sm text-destructive mt-1">{editStudentForm.formState.errors.email.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-student-kelas">Kelas</Label>
                <Input id="edit-student-kelas" {...editStudentForm.register("kelas")} className="mt-1" />
                {editStudentForm.formState.errors.kelas && (
                  <p className="text-sm text-destructive mt-1">{editStudentForm.formState.errors.kelas.message}</p>
                )}
              </div>
              <DialogFooter>
                 <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={() => { setIsEditStudentDialogOpen(false); setSelectedStudent(null); }}>Batal</Button>
                 </DialogClose>
                <Button type="submit" disabled={editStudentForm.formState.isSubmitting}>
                  {editStudentForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

    