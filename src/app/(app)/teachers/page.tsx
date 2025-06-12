
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
import { Users, PlusCircle, Edit, Trash2 } from "lucide-react";
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

interface Teacher {
  id: string; 
  name: string;
  email: string;
  subject: string; // Mata pelajaran yang diajar
  createdAt?: Timestamp; 
}

const teacherFormSchema = z.object({
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }),
  email: z.string().email({ message: "Format email tidak valid." }),
  subject: z.string().min(2, { message: "Mata pelajaran minimal 2 karakter." }),
});
type TeacherFormValues = z.infer<typeof teacherFormSchema>;

const editTeacherFormSchema = teacherFormSchema.extend({
  id: z.string(),
});
type EditTeacherFormValues = z.infer<typeof editTeacherFormSchema>;

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(true);
  const [isAddTeacherDialogOpen, setIsAddTeacherDialogOpen] = useState(false);
  const [isEditTeacherDialogOpen, setIsEditTeacherDialogOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);

  const { toast } = useToast();

  const addTeacherForm = useForm<TeacherFormValues>({
    resolver: zodResolver(teacherFormSchema),
    defaultValues: {
      name: "",
      email: "",
      subject: "",
    },
  });

  const editTeacherForm = useForm<EditTeacherFormValues>({
    resolver: zodResolver(editTeacherFormSchema),
  });

  const fetchTeachers = async () => {
    setIsLoadingTeachers(true);
    try {
      const teachersCollectionRef = collection(db, "teachers");
      const q = query(teachersCollectionRef, orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const fetchedTeachers: Teacher[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name,
        email: docSnap.data().email,
        subject: docSnap.data().subject,
        createdAt: docSnap.data().createdAt,
      }));
      setTeachers(fetchedTeachers);
    } catch (error) {
      console.error("Error fetching teachers: ", error);
      toast({
        title: "Gagal Memuat Data Guru",
        description: "Terjadi kesalahan saat mengambil data guru.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTeachers(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  useEffect(() => {
    if (selectedTeacher && isEditTeacherDialogOpen) {
      editTeacherForm.reset({
        id: selectedTeacher.id,
        name: selectedTeacher.name,
        email: selectedTeacher.email,
        subject: selectedTeacher.subject,
      });
    }
  }, [selectedTeacher, isEditTeacherDialogOpen, editTeacherForm]);

  const handleAddTeacherSubmit: SubmitHandler<TeacherFormValues> = async (data) => {
    addTeacherForm.clearErrors();
    try {
      const teachersCollectionRef = collection(db, "teachers");
      await addDoc(teachersCollectionRef, {
        ...data,
        createdAt: serverTimestamp(),
      });
      
      toast({ title: "Guru Ditambahkan", description: `${data.name} berhasil ditambahkan.` });
      setIsAddTeacherDialogOpen(false);
      addTeacherForm.reset();
      fetchTeachers(); 
    } catch (error: any) {
      console.error("Error adding teacher:", error);
       // Check for specific Firestore errors if needed, e.g., permissions
      let errorMessage = "Gagal menambahkan guru.";
      if (error.message && error.message.includes("Missing or insufficient permissions")) {
        errorMessage = "Anda tidak memiliki izin untuk menambahkan guru.";
      } else if (error.code === "already-exists" ) { // Example for unique constraint if implemented via rules/functions
        errorMessage = "Email guru sudah terdaftar."; // This would need backend check
        addTeacherForm.setError("email", { type: "manual", message: errorMessage });
      }
      toast({
        title: "Gagal Menambahkan Guru",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleEditTeacherSubmit: SubmitHandler<EditTeacherFormValues> = async (data) => {
    if (!selectedTeacher) return;
    editTeacherForm.clearErrors();
    try {
      const teacherDocRef = doc(db, "teachers", data.id);
      await updateDoc(teacherDocRef, {
        name: data.name,
        email: data.email,
        subject: data.subject,
      });
      
      toast({ title: "Data Guru Diperbarui", description: `${data.name} berhasil diperbarui.` });
      setIsEditTeacherDialogOpen(false);
      setSelectedTeacher(null);
      fetchTeachers();
    } catch (error) {
      console.error("Error editing teacher:", error);
      toast({
        title: "Gagal Memperbarui Data Guru",
        description: "Terjadi kesalahan saat memperbarui data guru.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTeacher = async (teacherId: string, teacherName?: string) => {
    try {
      await deleteDoc(doc(db, "teachers", teacherId));
      toast({ title: "Data Guru Dihapus", description: `${teacherName || 'Guru'} berhasil dihapus.` });
      setSelectedTeacher(null); // Clear selection if any
      fetchTeachers();
    } catch (error) {
      console.error("Error deleting teacher:", error);
      toast({
        title: "Gagal Menghapus Guru",
        description: "Terjadi kesalahan saat menghapus data guru.",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setIsEditTeacherDialogOpen(true);
  };
  
  const openDeleteDialog = (teacher: Teacher) => {
    setSelectedTeacher(teacher); 
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Guru</h1>
        <p className="text-muted-foreground">Kelola data guru, jadwal mengajar, dan informasi terkait.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Users className="h-6 w-6 text-primary" />
            <span>Daftar Guru</span>
          </CardTitle>
          <Dialog open={isAddTeacherDialogOpen} onOpenChange={(isOpen) => {
            setIsAddTeacherDialogOpen(isOpen);
            if (!isOpen) {
              addTeacherForm.reset();
              addTeacherForm.clearErrors();
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusCircle className="mr-2 h-4 w-4" /> Tambah Guru
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Tambah Guru Baru</DialogTitle>
                <DialogDescription>
                  Isi detail guru untuk menambahkan data baru.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={addTeacherForm.handleSubmit(handleAddTeacherSubmit)} className="space-y-4 py-4">
                <div>
                  <Label htmlFor="add-name">Nama Lengkap</Label>
                  <Input id="add-name" {...addTeacherForm.register("name")} className="mt-1" />
                  {addTeacherForm.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">{addTeacherForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="add-email">Email</Label>
                  <Input id="add-email" type="email" {...addTeacherForm.register("email")} className="mt-1" />
                  {addTeacherForm.formState.errors.email && (
                    <p className="text-sm text-destructive mt-1">{addTeacherForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="add-subject">Mata Pelajaran</Label>
                  <Input id="add-subject" {...addTeacherForm.register("subject")} className="mt-1" />
                  {addTeacherForm.formState.errors.subject && (
                    <p className="text-sm text-destructive mt-1">{addTeacherForm.formState.errors.subject.message}</p>
                  )}
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                     <Button type="button" variant="outline">Batal</Button>
                  </DialogClose>
                  <Button type="submit" disabled={addTeacherForm.formState.isSubmitting}>
                    {addTeacherForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Guru"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoadingTeachers ? (
             <div className="space-y-2 mt-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
             </div>
          ) : teachers.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Mata Pelajaran</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teachers.map((teacher) => (
                    <TableRow key={teacher.id}>
                      <TableCell className="font-medium">{teacher.name}</TableCell>
                      <TableCell>{teacher.email}</TableCell>
                      <TableCell>{teacher.subject}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="icon" onClick={() => openEditDialog(teacher)} aria-label={`Edit ${teacher.name}`}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" onClick={() => openDeleteDialog(teacher)} aria-label={`Hapus ${teacher.name}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          {selectedTeacher && selectedTeacher.id === teacher.id && ( // Ensure correct dialog content
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tindakan ini akan menghapus data guru <span className="font-semibold"> {selectedTeacher?.name} </span> ({selectedTeacher?.email}). Data yang dihapus tidak dapat dikembalikan.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setSelectedTeacher(null)}>Batal</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteTeacher(selectedTeacher.id, selectedTeacher.name)}>
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
              Tidak ada data guru untuk ditampilkan. Klik "Tambah Guru" untuk membuat data baru.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditTeacherDialogOpen} onOpenChange={(isOpen) => {
          setIsEditTeacherDialogOpen(isOpen);
          if (!isOpen) {
            setSelectedTeacher(null);
            editTeacherForm.clearErrors();
          }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Data Guru</DialogTitle>
            <DialogDescription>
              Perbarui detail data guru.
            </DialogDescription>
          </DialogHeader>
          {selectedTeacher && (
            <form onSubmit={editTeacherForm.handleSubmit(handleEditTeacherSubmit)} className="space-y-4 py-4">
              <Input type="hidden" {...editTeacherForm.register("id")} />
              <div>
                <Label htmlFor="edit-name">Nama Lengkap</Label>
                <Input id="edit-name" {...editTeacherForm.register("name")} className="mt-1" />
                {editTeacherForm.formState.errors.name && (
                  <p className="text-sm text-destructive mt-1">{editTeacherForm.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" type="email" {...editTeacherForm.register("email")} className="mt-1" />
                {editTeacherForm.formState.errors.email && (
                  <p className="text-sm text-destructive mt-1">{editTeacherForm.formState.errors.email.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-subject">Mata Pelajaran</Label>
                <Input id="edit-subject" {...editTeacherForm.register("subject")} className="mt-1" />
                {editTeacherForm.formState.errors.subject && (
                  <p className="text-sm text-destructive mt-1">{editTeacherForm.formState.errors.subject.message}</p>
                )}
              </div>
              <DialogFooter>
                 <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={() => { setIsEditTeacherDialogOpen(false); setSelectedTeacher(null); }}>Batal</Button>
                 </DialogClose>
                <Button type="submit" disabled={editTeacherForm.formState.isSubmitting}>
                  {editTeacherForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

    