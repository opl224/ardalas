
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
import { BookOpen, PlusCircle, Edit, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm, type SubmitHandler, Controller } from "react-hook-form";
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
  orderBy,
  where
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";

interface AuthUserMin {
  id: string; // Firebase Auth UID
  name: string;
  email: string;
}

interface Subject {
  id: string; 
  name: string;
  description?: string;
  teacherUid?: string; // UID of the responsible teacher from Auth
  teacherName?: string; // Denormalized name of the responsible teacher
  createdAt?: Timestamp; 
}

const subjectFormSchema = z.object({
  name: z.string().min(3, { message: "Nama subjek minimal 3 karakter." }),
  description: z.string().optional(),
  teacherUid: z.string().optional(), // To store the selected Firebase Auth UID
});
type SubjectFormValues = z.infer<typeof subjectFormSchema>;

const editSubjectFormSchema = subjectFormSchema.extend({
  id: z.string(),
});
type EditSubjectFormValues = z.infer<typeof editSubjectFormSchema>;

const NO_RESPONSIBLE_TEACHER = "_NONE_";

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [authGuruUsers, setAuthGuruUsers] = useState<AuthUserMin[]>([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(true);
  const [isLoadingAuthUsers, setIsLoadingAuthUsers] = useState(true); // Separate loading state for auth users
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const { user, role, loading: authLoading } = useAuth();

  const { toast } = useToast();

  const addSubjectForm = useForm<SubjectFormValues>({
    resolver: zodResolver(subjectFormSchema),
    defaultValues: {
      name: "",
      description: "",
      teacherUid: undefined,
    },
  });

  const editSubjectForm = useForm<EditSubjectFormValues>({
    resolver: zodResolver(editSubjectFormSchema),
  });

  const fetchAuthGuruUsers = async () => {
    if (role !== "admin") {
      setIsLoadingAuthUsers(false);
      return;
    }
    setIsLoadingAuthUsers(true);
    try {
      const usersCollectionRef = collection(db, "users");
      const q = query(usersCollectionRef, where("role", "==", "guru"), orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const fetchedUsers: AuthUserMin[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.data().uid, 
        name: docSnap.data().name,
        email: docSnap.data().email,
      }));
      setAuthGuruUsers(fetchedUsers);
    } catch (error) {
      console.error("Error fetching auth guru users: ", error);
      toast({
        title: "Gagal Memuat Akun Guru",
        variant: "destructive",
      });
    } finally {
      setIsLoadingAuthUsers(false);
    }
  };

  const fetchSubjects = async () => {
    if (authLoading) return;
    setIsLoadingSubjects(true);
    try {
      const subjectsCollectionRef = collection(db, "subjects");
      let q;
      if (role === "guru" && user?.uid) {
        q = query(subjectsCollectionRef, where("teacherUid", "==", user.uid), orderBy("name", "asc"));
      } else if (role === "admin") {
        q = query(subjectsCollectionRef, orderBy("name", "asc"));
      } else {
        setSubjects([]);
        setIsLoadingSubjects(false);
        return;
      }
      
      const querySnapshot = await getDocs(q);
      const fetchedSubjects: Subject[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name,
        description: docSnap.data().description,
        teacherUid: docSnap.data().teacherUid,
        teacherName: docSnap.data().teacherName,
        createdAt: docSnap.data().createdAt,
      }));
      setSubjects(fetchedSubjects);
    } catch (error) {
      console.error("Error fetching subjects: ", error);
      toast({
        title: "Gagal Memuat Subjek",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSubjects(false);
    }
  };

  useEffect(() => {
    if (role === "admin" && !authLoading) {
      fetchAuthGuruUsers();
    }
  }, [role, authLoading]);

  useEffect(() => {
    if (!authLoading && role) { // Fetch subjects once role is determined and auth is not loading
        fetchSubjects();
    }
  }, [role, user, authLoading]);


  useEffect(() => {
    if (selectedSubject && isEditDialogOpen && role === "admin") {
      // Ensure authGuruUsers are loaded before resetting form if not already
      if (authGuruUsers.length === 0 && !isLoadingAuthUsers) {
        fetchAuthGuruUsers();
      }
      editSubjectForm.reset({
        id: selectedSubject.id,
        name: selectedSubject.name,
        description: selectedSubject.description || "",
        teacherUid: selectedSubject.teacherUid || undefined,
      });
    }
  }, [selectedSubject, isEditDialogOpen, editSubjectForm, role, authGuruUsers, isLoadingAuthUsers]);

  const handleAddSubjectSubmit: SubmitHandler<SubjectFormValues> = async (data) => {
    if (role !== "admin") return;
    addSubjectForm.clearErrors();
    const selectedTeacher = authGuruUsers.find(userAuth => userAuth.id === data.teacherUid);

    try {
      const subjectsCollectionRef = collection(db, "subjects");
      await addDoc(subjectsCollectionRef, {
        name: data.name,
        description: data.description || null,
        teacherUid: data.teacherUid === NO_RESPONSIBLE_TEACHER ? null : data.teacherUid || null,
        teacherName: selectedTeacher?.name || null,
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
        variant: "destructive",
      });
    }
  };

  const handleEditSubjectSubmit: SubmitHandler<EditSubjectFormValues> = async (data) => {
    if (role !== "admin" || !selectedSubject) return;
    editSubjectForm.clearErrors();
    const selectedTeacher = authGuruUsers.find(userAuth => userAuth.id === data.teacherUid);

    try {
      const subjectDocRef = doc(db, "subjects", data.id);
      await updateDoc(subjectDocRef, {
        name: data.name,
        description: data.description || null,
        teacherUid: data.teacherUid === NO_RESPONSIBLE_TEACHER ? null : data.teacherUid || null,
        teacherName: selectedTeacher?.name || null,
      });
      
      toast({ title: "Subjek Diperbarui", description: `${data.name} berhasil diperbarui.` });
      setIsEditDialogOpen(false);
      setSelectedSubject(null);
      fetchSubjects();
    } catch (error) {
      console.error("Error editing subject:", error);
      toast({
        title: "Gagal Memperbarui Subjek",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSubject = async (subjectId: string, subjectName?: string) => {
    if (role !== "admin") return;
    try {
      await deleteDoc(doc(db, "subjects", subjectId));
      toast({ title: "Subjek Dihapus", description: `${subjectName || 'Subjek'} berhasil dihapus.` });
      setSelectedSubject(null); 
      fetchSubjects();
    } catch (error) {
      console.error("Error deleting subject:", error);
      toast({
        title: "Gagal Menghapus Subjek",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (subject: Subject) => {
    if (role !== "admin") return;
    // Ensure authGuruUsers are fetched if not already, for the form dropdown
    if (authGuruUsers.length === 0 && !isLoadingAuthUsers) {
        fetchAuthGuruUsers();
    }
    setSelectedSubject(subject);
    setIsEditDialogOpen(true);
  };
  
  const openDeleteDialog = (subject: Subject) => {
     if (role !== "admin") return;
    setSelectedSubject(subject); 
  };

  const renderSubjectFormFields = (formInstance: typeof addSubjectForm | typeof editSubjectForm, formType: 'add' | 'edit') => (
    <>
      <div>
        <Label htmlFor={`${formType}-subject-name`}>Nama Subjek</Label>
        <Input id={`${formType}-subject-name`} {...formInstance.register("name")} className="mt-1" />
        {formInstance.formState.errors.name && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.name.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-subject-description`}>Deskripsi (Opsional)</Label>
        <Textarea id={`${formType}-subject-description`} {...formInstance.register("description")} className="mt-1" />
      </div>
      {role === "admin" && (
        <div>
          <Label htmlFor={`${formType}-subject-teacherUid`}>Guru Penanggung Jawab (Opsional)</Label>
          <Controller
            name="teacherUid"
            control={formInstance.control}
            render={({ field }) => (
              <Select
                onValueChange={(value) => field.onChange(value === NO_RESPONSIBLE_TEACHER ? undefined : value)}
                value={field.value || NO_RESPONSIBLE_TEACHER}
                disabled={isLoadingAuthUsers}
              >
                <SelectTrigger id={`${formType}-subject-teacherUid`} className="mt-1">
                  <SelectValue placeholder={isLoadingAuthUsers ? "Memuat guru..." : "Pilih guru"} />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingAuthUsers && <SelectItem value="loading-auth" disabled>Memuat...</SelectItem>}
                  <SelectItem value={NO_RESPONSIBLE_TEACHER}>Tidak Ada / Kosongkan</SelectItem>
                  {authGuruUsers
                    .filter(authUser => authUser && typeof authUser.id === 'string' && authUser.id.length > 0)
                    .map((authUser) => (
                    <SelectItem key={authUser.id} value={authUser.id}>
                      {authUser.name} ({authUser.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
           {formInstance.formState.errors.teacherUid && (
            <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.teacherUid.message}</p>
          )}
        </div>
      )}
    </>
  );

  const pageDescription = role === "guru"
    ? "Daftar subjek atau mata pelajaran yang menjadi tanggung jawab Anda."
    : "Kelola daftar subjek atau mata pelajaran yang diajarkan.";

  const showSkeleton = isLoadingSubjects || authLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Subjek Pelajaran</h1>
        <p className="text-muted-foreground">{pageDescription}</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <BookOpen className="h-6 w-6 text-primary" />
            <span>Daftar Subjek</span>
          </CardTitle>
          {role === "admin" && (
            <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
              setIsAddDialogOpen(isOpen);
              if (!isOpen) {
                addSubjectForm.reset();
                addSubjectForm.clearErrors();
              } else {
                if (authGuruUsers.length === 0 && !isLoadingAuthUsers) fetchAuthGuruUsers();
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <PlusCircle className="mr-2 h-4 w-4" /> Tambah Subjek
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Tambah Subjek Baru</DialogTitle>
                  <DialogDescription>
                    Isi detail subjek pelajaran baru.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={addSubjectForm.handleSubmit(handleAddSubjectSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                  {renderSubjectFormFields(addSubjectForm, 'add')}
                  <DialogFooter>
                    <DialogClose asChild>
                       <Button type="button" variant="outline">Batal</Button>
                    </DialogClose>
                    <Button type="submit" disabled={addSubjectForm.formState.isSubmitting || isLoadingAuthUsers}>
                      {addSubjectForm.formState.isSubmitting || isLoadingAuthUsers ? "Menyimpan..." : "Simpan Subjek"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {showSkeleton ? (
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
                    {(role === "admin" || role === "guru") && <TableHead>Guru Penanggung Jawab</TableHead>}
                    {role === "admin" && <TableHead className="text-right">Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subjects.map((subject) => (
                    <TableRow key={subject.id}>
                      <TableCell className="font-medium">{subject.name}</TableCell>
                      <TableCell>{subject.description || "-"}</TableCell>
                      {(role === "admin" || role === "guru") && <TableCell>{subject.teacherName || subject.teacherUid || "-"}</TableCell>}
                      {role === "admin" && (
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
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
             <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
              {role === "admin" ? 'Tidak ada data subjek untuk ditampilkan. Klik "Tambah Subjek" untuk membuat data baru.' : 'Tidak ada subjek yang ditugaskan kepada Anda.'}
            </div>
          )}
        </CardContent>
      </Card>

      {role === "admin" && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
            setIsEditDialogOpen(isOpen);
            if (!isOpen) {
              setSelectedSubject(null);
              editSubjectForm.clearErrors();
            }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Subjek</DialogTitle>
              <DialogDescription>
                Perbarui detail subjek pelajaran.
              </DialogDescription>
            </DialogHeader>
            {selectedSubject && (
              <form onSubmit={editSubjectForm.handleSubmit(handleEditSubjectSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <Input type="hidden" {...editSubjectForm.register("id")} />
                {renderSubjectFormFields(editSubjectForm, 'edit')}
                <DialogFooter>
                   <DialogClose asChild>
                      <Button type="button" variant="outline" onClick={() => { setIsEditDialogOpen(false); setSelectedSubject(null); }}>Batal</Button>
                   </DialogClose>
                  <Button type="submit" disabled={editSubjectForm.formState.isSubmitting || isLoadingAuthUsers}>
                    {editSubjectForm.formState.isSubmitting || isLoadingAuthUsers ? "Menyimpan..." : "Simpan Perubahan"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
