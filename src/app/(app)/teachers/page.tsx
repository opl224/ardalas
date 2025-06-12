
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, PlusCircle, Edit, Trash2 } from "lucide-react";
import Image from "next/image";
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
  address?: string;
  phone?: string;
  gender?: "laki-laki" | "perempuan";
  createdAt?: Timestamp; 
}

const GENDERS = ["laki-laki", "perempuan"] as const;

const teacherFormSchema = z.object({
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }),
  email: z.string().email({ message: "Format email tidak valid." }),
  subject: z.string().min(2, { message: "Mata pelajaran minimal 2 karakter." }),
  address: z.string().trim().optional(),
  phone: z.string().trim().min(9, { message: "Nomor telepon minimal 9 digit." }).optional().or(z.literal('')),
  gender: z.enum(GENDERS, { required_error: "Pilih jenis kelamin." }),
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
      address: "",
      phone: "",
      gender: undefined,
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
        address: docSnap.data().address,
        phone: docSnap.data().phone,
        gender: docSnap.data().gender,
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
        address: selectedTeacher.address || "",
        phone: selectedTeacher.phone || "",
        gender: selectedTeacher.gender,
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
      addTeacherForm.reset({name: "", email: "", subject: "", address: "", phone: "", gender: undefined});
      fetchTeachers(); 
    } catch (error: any) {
      console.error("Error adding teacher:", error);
      let errorMessage = "Gagal menambahkan guru.";
      if (error.message && error.message.includes("Missing or insufficient permissions")) {
        errorMessage = "Anda tidak memiliki izin untuk menambahkan guru.";
      } else if (error.code === "already-exists" ) { 
        errorMessage = "Email guru sudah terdaftar."; 
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
        address: data.address,
        phone: data.phone,
        gender: data.gender,
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
      setSelectedTeacher(null); 
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

  const renderTeacherFormFields = (formInstance: typeof addTeacherForm | typeof editTeacherForm, formType: 'add' | 'edit') => (
    <>
      <div>
        <Label htmlFor={`${formType}-name`}>Nama Lengkap</Label>
        <Input id={`${formType}-name`} {...formInstance.register("name")} className="mt-1" />
        {formInstance.formState.errors.name && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.name.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-email`}>Email</Label>
        <Input id={`${formType}-email`} type="email" {...formInstance.register("email")} className="mt-1" />
        {formInstance.formState.errors.email && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.email.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-subject`}>Mata Pelajaran</Label>
        <Input id={`${formType}-subject`} {...formInstance.register("subject")} className="mt-1" />
        {formInstance.formState.errors.subject && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.subject.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-address`}>Alamat (Opsional)</Label>
        <Textarea id={`${formType}-address`} {...formInstance.register("address")} className="mt-1" />
        {formInstance.formState.errors.address && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.address.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-phone`}>Nomor Telepon (Opsional)</Label>
        <Input id={`${formType}-phone`} type="tel" {...formInstance.register("phone")} className="mt-1" />
        {formInstance.formState.errors.phone && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.phone.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-gender`}>Jenis Kelamin</Label>
        <Select
          onValueChange={(value) => formInstance.setValue("gender", value as "laki-laki" | "perempuan", { shouldValidate: true })}
          defaultValue={formInstance.getValues("gender")}
        >
          <SelectTrigger id={`${formType}-gender`} className="mt-1">
            <SelectValue placeholder="Pilih jenis kelamin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="laki-laki">Laki-laki</SelectItem>
            <SelectItem value="perempuan">Perempuan</SelectItem>
          </SelectContent>
        </Select>
        {formInstance.formState.errors.gender && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.gender.message}</p>
        )}
      </div>
    </>
  );


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
              addTeacherForm.reset({name: "", email: "", subject: "", address: "", phone: "", gender: undefined});
              addTeacherForm.clearErrors();
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusCircle className="mr-2 h-4 w-4" /> Tambah Guru
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Tambah Guru Baru</DialogTitle>
                <DialogDescription>
                  Isi detail guru untuk menambahkan data baru.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={addTeacherForm.handleSubmit(handleAddTeacherSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                {renderTeacherFormFields(addTeacherForm, 'add')}
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
                    <TableHead>Mapel</TableHead>
                    <TableHead>Alamat</TableHead>
                    <TableHead>Telepon</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teachers.map((teacher) => (
                    <TableRow key={teacher.id}>
                      <TableCell className="font-medium">{teacher.name}</TableCell>
                      <TableCell>{teacher.email}</TableCell>
                      <TableCell>{teacher.subject}</TableCell>
                      <TableCell>{teacher.address || "-"}</TableCell>
                      <TableCell>{teacher.phone || "-"}</TableCell>
                      <TableCell>
                        {teacher.gender === "laki-laki" ? 
                          <Image src="https://placehold.co/24x24.png" alt="Laki-laki" width={24} height={24} className="rounded-full" data-ai-hint="male avatar" /> :
                         teacher.gender === "perempuan" ? 
                          <Image src="https://placehold.co/24x24.png" alt="Perempuan" width={24} height={24} className="rounded-full" data-ai-hint="female avatar" /> : 
                         "-"}
                      </TableCell>
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
                          {selectedTeacher && selectedTeacher.id === teacher.id && ( 
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Data Guru</DialogTitle>
            <DialogDescription>
              Perbarui detail data guru.
            </DialogDescription>
          </DialogHeader>
          {selectedTeacher && (
            <form onSubmit={editTeacherForm.handleSubmit(handleEditTeacherSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <Input type="hidden" {...editTeacherForm.register("id")} />
              {renderTeacherFormFields(editTeacherForm, 'edit')}
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

    

    