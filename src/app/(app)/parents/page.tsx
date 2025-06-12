
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
import { UserCircle, PlusCircle, Edit, Trash2 } from "lucide-react";
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

// Minimal Student interface for dropdown
interface Student {
  id: string;
  name: string;
}

interface Parent {
  id: string; 
  name: string;
  email?: string; 
  phone?: string;
  studentId: string;
  studentName: string; // Denormalized for easy display
  createdAt?: Timestamp; 
}

const parentFormSchema = z.object({
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }),
  email: z.string().email({ message: "Format email tidak valid." }).optional().or(z.literal("")),
  phone: z.string().min(9, { message: "Nomor telepon minimal 9 digit." }).optional().or(z.literal("")),
  studentId: z.string({ required_error: "Pilih murid terkait." }),
});
type ParentFormValues = z.infer<typeof parentFormSchema>;

const editParentFormSchema = parentFormSchema.extend({
  id: z.string(),
});
type EditParentFormValues = z.infer<typeof editParentFormSchema>;

export default function ParentsPage() {
  const [parents, setParents] = useState<Parent[]>([]);
  const [students, setStudents] = useState<Student[]>([]); // For student dropdown
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null);

  const { toast } = useToast();

  const addParentForm = useForm<ParentFormValues>({
    resolver: zodResolver(parentFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      studentId: undefined,
    },
  });

  const editParentForm = useForm<EditParentFormValues>({
    resolver: zodResolver(editParentFormSchema),
  });

  const fetchStudentsForDropdown = async () => {
    try {
      const studentsCollectionRef = collection(db, "students");
      const q = query(studentsCollectionRef, orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const fetchedStudents: Student[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name,
      }));
      setStudents(fetchedStudents);
    } catch (error) {
      console.error("Error fetching students for dropdown: ", error);
      toast({
        title: "Gagal Memuat Data Murid",
        description: "Terjadi kesalahan saat mengambil daftar murid.",
        variant: "destructive",
      });
    }
  };
  
  const fetchParents = async () => {
    setIsLoading(true);
    try {
      await fetchStudentsForDropdown(); // Fetch students first or concurrently
      const parentsCollectionRef = collection(db, "parents");
      const q = query(parentsCollectionRef, orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const fetchedParents: Parent[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name,
        email: docSnap.data().email,
        phone: docSnap.data().phone,
        studentId: docSnap.data().studentId,
        studentName: docSnap.data().studentName,
        createdAt: docSnap.data().createdAt,
      }));
      setParents(fetchedParents);
    } catch (error) {
      console.error("Error fetching parents: ", error);
      toast({
        title: "Gagal Memuat Data Orang Tua",
        description: "Terjadi kesalahan saat mengambil data orang tua.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchParents();
  }, []);

  useEffect(() => {
    if (selectedParent && isEditDialogOpen) {
      editParentForm.reset({
        id: selectedParent.id,
        name: selectedParent.name,
        email: selectedParent.email || "",
        phone: selectedParent.phone || "",
        studentId: selectedParent.studentId,
      });
    }
  }, [selectedParent, isEditDialogOpen, editParentForm]);

  const handleAddParentSubmit: SubmitHandler<ParentFormValues> = async (data) => {
    addParentForm.clearErrors();
    const selectedStudent = students.find(s => s.id === data.studentId);
    if (!selectedStudent) {
      toast({ title: "Error", description: "Murid tidak ditemukan.", variant: "destructive" });
      return;
    }

    try {
      const parentsCollectionRef = collection(db, "parents");
      await addDoc(parentsCollectionRef, {
        ...data,
        studentName: selectedStudent.name, // Store student name
        createdAt: serverTimestamp(),
      });
      
      toast({ title: "Data Orang Tua Ditambahkan", description: `${data.name} berhasil ditambahkan.` });
      setIsAddDialogOpen(false);
      addParentForm.reset();
      fetchParents(); 
    } catch (error: any) {
      console.error("Error adding parent:", error);
      toast({
        title: "Gagal Menambahkan Data Orang Tua",
        description: "Terjadi kesalahan.",
        variant: "destructive",
      });
    }
  };

  const handleEditParentSubmit: SubmitHandler<EditParentFormValues> = async (data) => {
    if (!selectedParent) return;
    editParentForm.clearErrors();
    const selectedStudent = students.find(s => s.id === data.studentId);
    if (!selectedStudent) {
      toast({ title: "Error", description: "Murid tidak ditemukan.", variant: "destructive" });
      return;
    }

    try {
      const parentDocRef = doc(db, "parents", data.id);
      await updateDoc(parentDocRef, {
        name: data.name,
        email: data.email,
        phone: data.phone,
        studentId: data.studentId,
        studentName: selectedStudent.name, // Update student name
      });
      
      toast({ title: "Data Orang Tua Diperbarui", description: `${data.name} berhasil diperbarui.` });
      setIsEditDialogOpen(false);
      setSelectedParent(null);
      fetchParents();
    } catch (error) {
      console.error("Error editing parent:", error);
      toast({
        title: "Gagal Memperbarui Data Orang Tua",
        description: "Terjadi kesalahan.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteParent = async (parentId: string, parentName?: string) => {
    try {
      await deleteDoc(doc(db, "parents", parentId));
      toast({ title: "Data Orang Tua Dihapus", description: `${parentName || 'Data'} berhasil dihapus.` });
      setSelectedParent(null); 
      fetchParents();
    } catch (error) {
      console.error("Error deleting parent:", error);
      toast({
        title: "Gagal Menghapus Data Orang Tua",
        description: "Terjadi kesalahan.",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (parent: Parent) => {
    setSelectedParent(parent);
    setIsEditDialogOpen(true);
  };
  
  const openDeleteDialog = (parent: Parent) => {
    setSelectedParent(parent); 
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Orang Tua</h1>
        <p className="text-muted-foreground">Kelola data orang tua dan hubungannya dengan murid.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <UserCircle className="h-6 w-6 text-primary" />
            <span>Daftar Orang Tua</span>
          </CardTitle>
          <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
            setIsAddDialogOpen(isOpen);
            if (!isOpen) {
              addParentForm.reset();
              addParentForm.clearErrors();
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => { if (students.length === 0) fetchStudentsForDropdown(); }}>
                <PlusCircle className="mr-2 h-4 w-4" /> Tambah Orang Tua
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Tambah Data Orang Tua Baru</DialogTitle>
                <DialogDescription>
                  Isi detail orang tua dan pilih murid yang terkait.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={addParentForm.handleSubmit(handleAddParentSubmit)} className="space-y-4 py-4">
                <div>
                  <Label htmlFor="add-parent-name">Nama Lengkap Orang Tua</Label>
                  <Input id="add-parent-name" {...addParentForm.register("name")} className="mt-1" />
                  {addParentForm.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">{addParentForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="add-parent-email">Email (Opsional)</Label>
                  <Input id="add-parent-email" type="email" {...addParentForm.register("email")} className="mt-1" />
                  {addParentForm.formState.errors.email && (
                    <p className="text-sm text-destructive mt-1">{addParentForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="add-parent-phone">Nomor Telepon (Opsional)</Label>
                  <Input id="add-parent-phone" type="tel" {...addParentForm.register("phone")} className="mt-1" />
                  {addParentForm.formState.errors.phone && (
                    <p className="text-sm text-destructive mt-1">{addParentForm.formState.errors.phone.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="add-parent-studentId">Anak (Murid)</Label>
                  <Select
                    onValueChange={(value) => addParentForm.setValue("studentId", value, { shouldValidate: true })}
                    defaultValue={addParentForm.getValues("studentId")}
                  >
                    <SelectTrigger id="add-parent-studentId" className="mt-1">
                      <SelectValue placeholder="Pilih murid" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.length === 0 && <SelectItem value="loading" disabled>Memuat murid...</SelectItem>}
                      {students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {addParentForm.formState.errors.studentId && (
                    <p className="text-sm text-destructive mt-1">{addParentForm.formState.errors.studentId.message}</p>
                  )}
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                     <Button type="button" variant="outline">Batal</Button>
                  </DialogClose>
                  <Button type="submit" disabled={addParentForm.formState.isSubmitting}>
                    {addParentForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Data"}
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
          ) : parents.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Orang Tua</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telepon</TableHead>
                    <TableHead>Nama Anak</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parents.map((parent) => (
                    <TableRow key={parent.id}>
                      <TableCell className="font-medium">{parent.name}</TableCell>
                      <TableCell>{parent.email || "-"}</TableCell>
                      <TableCell>{parent.phone || "-"}</TableCell>
                      <TableCell>{parent.studentName || "-"}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="icon" onClick={() => openEditDialog(parent)} aria-label={`Edit ${parent.name}`}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" onClick={() => openDeleteDialog(parent)} aria-label={`Hapus ${parent.name}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          {selectedParent && selectedParent.id === parent.id && ( 
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tindakan ini akan menghapus data orang tua <span className="font-semibold"> {selectedParent?.name}</span>. Data yang dihapus tidak dapat dikembalikan.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setSelectedParent(null)}>Batal</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteParent(selectedParent.id, selectedParent.name)}>
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
              Tidak ada data orang tua untuk ditampilkan. Klik "Tambah Orang Tua" untuk membuat data baru.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
          setIsEditDialogOpen(isOpen);
          if (!isOpen) {
            setSelectedParent(null);
            editParentForm.clearErrors();
          }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Data Orang Tua</DialogTitle>
            <DialogDescription>
              Perbarui detail data orang tua.
            </DialogDescription>
          </DialogHeader>
          {selectedParent && (
            <form onSubmit={editParentForm.handleSubmit(handleEditParentSubmit)} className="space-y-4 py-4">
              <Input type="hidden" {...editParentForm.register("id")} />
              <div>
                <Label htmlFor="edit-parent-name">Nama Lengkap Orang Tua</Label>
                <Input id="edit-parent-name" {...editParentForm.register("name")} className="mt-1" />
                {editParentForm.formState.errors.name && (
                  <p className="text-sm text-destructive mt-1">{editParentForm.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-parent-email">Email (Opsional)</Label>
                <Input id="edit-parent-email" type="email" {...editParentForm.register("email")} className="mt-1" />
                {editParentForm.formState.errors.email && (
                  <p className="text-sm text-destructive mt-1">{editParentForm.formState.errors.email.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-parent-phone">Nomor Telepon (Opsional)</Label>
                <Input id="edit-parent-phone" type="tel" {...editParentForm.register("phone")} className="mt-1" />
                {editParentForm.formState.errors.phone && (
                  <p className="text-sm text-destructive mt-1">{editParentForm.formState.errors.phone.message}</p>
                )}
              </div>
               <div>
                  <Label htmlFor="edit-parent-studentId">Anak (Murid)</Label>
                  <Select
                    onValueChange={(value) => editParentForm.setValue("studentId", value, { shouldValidate: true })}
                    defaultValue={editParentForm.getValues("studentId")}
                  >
                    <SelectTrigger id="edit-parent-studentId" className="mt-1">
                      <SelectValue placeholder="Pilih murid" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {editParentForm.formState.errors.studentId && (
                    <p className="text-sm text-destructive mt-1">{editParentForm.formState.errors.studentId.message}</p>
                  )}
                </div>
              <DialogFooter>
                 <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={() => { setIsEditDialogOpen(false); setSelectedParent(null); }}>Batal</Button>
                 </DialogClose>
                <Button type="submit" disabled={editParentForm.formState.isSubmitting}>
                  {editParentForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

    