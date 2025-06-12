
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
import { BookOpen, PlusCircle, Edit, Trash2 } from "lucide-react";
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

interface Subject {
  id: string; 
  name: string;
  description?: string;
  createdAt?: Timestamp; 
}

const subjectFormSchema = z.object({
  name: z.string().min(3, { message: "Nama subjek minimal 3 karakter." }),
  description: z.string().optional(),
});
type SubjectFormValues = z.infer<typeof subjectFormSchema>;

const editSubjectFormSchema = subjectFormSchema.extend({
  id: z.string(),
});
type EditSubjectFormValues = z.infer<typeof editSubjectFormSchema>;

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);

  const { toast } = useToast();

  const addSubjectForm = useForm<SubjectFormValues>({
    resolver: zodResolver(subjectFormSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const editSubjectForm = useForm<EditSubjectFormValues>({
    resolver: zodResolver(editSubjectFormSchema),
  });

  const fetchSubjects = async () => {
    setIsLoading(true);
    try {
      const subjectsCollectionRef = collection(db, "subjects");
      const q = query(subjectsCollectionRef, orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const fetchedSubjects: Subject[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name,
        description: docSnap.data().description,
        createdAt: docSnap.data().createdAt,
      }));
      setSubjects(fetchedSubjects);
    } catch (error) {
      console.error("Error fetching subjects: ", error);
      toast({
        title: "Gagal Memuat Subjek",
        description: "Terjadi kesalahan saat mengambil data subjek.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, []);

  useEffect(() => {
    if (selectedSubject && isEditDialogOpen) {
      editSubjectForm.reset({
        id: selectedSubject.id,
        name: selectedSubject.name,
        description: selectedSubject.description || "",
      });
    }
  }, [selectedSubject, isEditDialogOpen, editSubjectForm]);

  const handleAddSubjectSubmit: SubmitHandler<SubjectFormValues> = async (data) => {
    addSubjectForm.clearErrors();
    try {
      const subjectsCollectionRef = collection(db, "subjects");
      await addDoc(subjectsCollectionRef, {
        ...data,
        createdAt: serverTimestamp(),
      });
      
      toast({ title: "Subjek Ditambahkan", description: `${data.name} berhasil ditambahkan.` });
      setIsAddDialogOpen(false);
      addSubjectForm.reset();
      fetchSubjects(); 
    } catch (error: any) {
      console.error("Error adding subject:", error);
      toast({
        title: "Gagal Menambahkan Subjek",
        description: "Terjadi kesalahan.",
        variant: "destructive",
      });
    }
  };

  const handleEditSubjectSubmit: SubmitHandler<EditSubjectFormValues> = async (data) => {
    if (!selectedSubject) return;
    editSubjectForm.clearErrors();
    try {
      const subjectDocRef = doc(db, "subjects", data.id);
      await updateDoc(subjectDocRef, {
        name: data.name,
        description: data.description,
      });
      
      toast({ title: "Subjek Diperbarui", description: `${data.name} berhasil diperbarui.` });
      setIsEditDialogOpen(false);
      setSelectedSubject(null);
      fetchSubjects();
    } catch (error) {
      console.error("Error editing subject:", error);
      toast({
        title: "Gagal Memperbarui Subjek",
        description: "Terjadi kesalahan.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSubject = async (subjectId: string, subjectName?: string) => {
    try {
      await deleteDoc(doc(db, "subjects", subjectId));
      toast({ title: "Subjek Dihapus", description: `${subjectName || 'Subjek'} berhasil dihapus.` });
      setSelectedSubject(null); 
      fetchSubjects();
    } catch (error) {
      console.error("Error deleting subject:", error);
      toast({
        title: "Gagal Menghapus Subjek",
        description: "Terjadi kesalahan.",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (subject: Subject) => {
    setSelectedSubject(subject);
    setIsEditDialogOpen(true);
  };
  
  const openDeleteDialog = (subject: Subject) => {
    setSelectedSubject(subject); 
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Subjek Pelajaran</h1>
        <p className="text-muted-foreground">Kelola daftar subjek atau mata pelajaran yang diajarkan.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <BookOpen className="h-6 w-6 text-primary" />
            <span>Daftar Subjek</span>
          </CardTitle>
          <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
            setIsAddDialogOpen(isOpen);
            if (!isOpen) {
              addSubjectForm.reset();
              addSubjectForm.clearErrors();
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusCircle className="mr-2 h-4 w-4" /> Tambah Subjek
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Tambah Subjek Baru</DialogTitle>
                <DialogDescription>
                  Isi detail subjek pelajaran baru.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={addSubjectForm.handleSubmit(handleAddSubjectSubmit)} className="space-y-4 py-4">
                <div>
                  <Label htmlFor="add-subject-name">Nama Subjek</Label>
                  <Input id="add-subject-name" {...addSubjectForm.register("name")} className="mt-1" />
                  {addSubjectForm.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">{addSubjectForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="add-subject-description">Deskripsi (Opsional)</Label>
                  <Textarea id="add-subject-description" {...addSubjectForm.register("description")} className="mt-1" />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                     <Button type="button" variant="outline">Batal</Button>
                  </DialogClose>
                  <Button type="submit" disabled={addSubjectForm.formState.isSubmitting}>
                    {addSubjectForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Subjek"}
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
          ) : subjects.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Subjek</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subjects.map((subject) => (
                    <TableRow key={subject.id}>
                      <TableCell className="font-medium">{subject.name}</TableCell>
                      <TableCell>{subject.description || "-"}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="icon" onClick={() => openEditDialog(subject)} aria-label={`Edit ${subject.name}`}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" onClick={() => openDeleteDialog(subject)} aria-label={`Hapus ${subject.name}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          {selectedSubject && selectedSubject.id === subject.id && ( 
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tindakan ini akan menghapus subjek <span className="font-semibold">{selectedSubject?.name}</span>. Data yang dihapus tidak dapat dikembalikan.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setSelectedSubject(null)}>Batal</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteSubject(selectedSubject.id, selectedSubject.name)}>
                                  Ya, Hapus Subjek
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
              Tidak ada data subjek untuk ditampilkan. Klik "Tambah Subjek" untuk membuat data baru.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
          setIsEditDialogOpen(isOpen);
          if (!isOpen) {
            setSelectedSubject(null);
            editSubjectForm.clearErrors();
          }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Subjek</DialogTitle>
            <DialogDescription>
              Perbarui detail subjek pelajaran.
            </DialogDescription>
          </DialogHeader>
          {selectedSubject && (
            <form onSubmit={editSubjectForm.handleSubmit(handleEditSubjectSubmit)} className="space-y-4 py-4">
              <Input type="hidden" {...editSubjectForm.register("id")} />
              <div>
                <Label htmlFor="edit-subject-name">Nama Subjek</Label>
                <Input id="edit-subject-name" {...editSubjectForm.register("name")} className="mt-1" />
                {editSubjectForm.formState.errors.name && (
                  <p className="text-sm text-destructive mt-1">{editSubjectForm.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="edit-subject-description">Deskripsi (Opsional)</Label>
                <Textarea id="edit-subject-description" {...editSubjectForm.register("description")} className="mt-1" />
              </div>
              <DialogFooter>
                 <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={() => { setIsEditDialogOpen(false); setSelectedSubject(null); }}>Batal</Button>
                 </DialogClose>
                <Button type="submit" disabled={editSubjectForm.formState.isSubmitting}>
                  {editSubjectForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

    