
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
import { UserCircle, PlusCircle, Edit, Trash2, Search, Filter as FilterIcon, LinkIcon as UidLinkIcon } from "lucide-react";
import { useState, useEffect, useMemo, type ReactNode } from "react";
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
  where,
  documentId
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";

interface StudentForDialog {
  id: string; 
  name: string;
  classId?: string;
}

interface AuthUserMin { // For Auth users with role 'orangtua'
  id: string; // Firebase Auth UID
  name: string;
  email: string;
}

interface ClassMin {
  id: string;
  name: string;
}

interface Parent {
  id: string; 
  name: string;
  email?: string; 
  phone?: string;
  studentId: string; 
  studentName: string; 
  uid?: string; // Firebase Auth UID of the parent, if linked
  createdAt?: Timestamp; 
}

const parentFormSchema = z.object({
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }),
  email: z.string().email({ message: "Format email tidak valid." }).optional().or(z.literal("")),
  phone: z.string().min(9, { message: "Nomor telepon minimal 9 digit." }).optional().or(z.literal("")),
  studentId: z.string({ required_error: "Pilih murid terkait (UID)." }),
  authUserId: z.string().optional(), // UID of the parent's auth account
});
type ParentFormValues = z.infer<typeof parentFormSchema>;

const editParentFormSchema = parentFormSchema.extend({
  id: z.string(),
});
type EditParentFormValues = z.infer<typeof editParentFormSchema>;

const NO_AUTH_USER_SELECTED = "_NO_AUTH_USER_";

export default function ParentsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const [parents, setParents] = useState<Parent[]>([]);
  const [studentsForDialog, setStudentsForDialog] = useState<StudentForDialog[]>([]); 
  const [authOrangtuaUsers, setAuthOrangtuaUsers] = useState<AuthUserMin[]>([]);
  const [allClasses, setAllClasses] = useState<ClassMin[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true); 
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("all");

  const { toast } = useToast();

  const addParentForm = useForm<ParentFormValues>({
    resolver: zodResolver(parentFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      studentId: undefined,
      authUserId: undefined,
    },
  });

  const editParentForm = useForm<EditParentFormValues>({
    resolver: zodResolver(editParentFormSchema),
  });

  const fetchPageData = async () => {
    if (authLoading && role !== 'admin') return; 
    setIsLoadingData(true);
    try {
      const promises = [];

      const usersCollectionRef = collection(db, "users");
      const studentsQueryInstance = query(usersCollectionRef, where("role", "==", "siswa"), orderBy("name", "asc"));
      promises.push(getDocs(studentsQueryInstance));

      const authOrangtuaQueryInstance = query(usersCollectionRef, where("role", "==", "orangtua"), orderBy("name", "asc"));
      promises.push(getDocs(authOrangtuaQueryInstance));
      
      if (role === 'admin') {
        const classesCollectionRef = collection(db, "classes");
        const classesQueryInstance = query(classesCollectionRef, orderBy("name", "asc"));
        promises.push(getDocs(classesQueryInstance));
      } else {
        promises.push(Promise.resolve(null)); 
      }
      
      const parentsCollectionRef = collection(db, "parents");
      const parentsQueryInstance = query(parentsCollectionRef, orderBy("name", "asc"));
      promises.push(getDocs(parentsQueryInstance));

      const [studentsSnapshot, authOrangtuaSnapshot, classesSnapshot, parentsSnapshot] = await Promise.all(promises);

      const fetchedStudentsRaw = (studentsSnapshot as any).docs.map((docSnap: any) => ({
        id: docSnap.data().uid, // Assuming student's doc id in 'users' is their auth UID
        name: docSnap.data().name,
        classId: docSnap.data().classId,
      }));
      const validFetchedStudents = fetchedStudentsRaw.filter(
        (student: any) => student.id && typeof student.id === 'string'
      );
      setStudentsForDialog(validFetchedStudents);

      setAuthOrangtuaUsers((authOrangtuaSnapshot as any).docs.map((docSnap: any) => ({
        id: docSnap.data().uid, // Auth UID from users collection
        name: docSnap.data().name,
        email: docSnap.data().email,
      })));


      if (role === 'admin' && classesSnapshot) {
        setAllClasses((classesSnapshot as any).docs.map((docSnap: any) => ({ id: docSnap.id, name: docSnap.data().name })));
      }
      
      const fetchedParents: Parent[] = (parentsSnapshot as any).docs.map((docSnap: any) => ({
        id: docSnap.id,
        name: docSnap.data().name,
        email: docSnap.data().email,
        phone: docSnap.data().phone,
        studentId: docSnap.data().studentId,
        studentName: docSnap.data().studentName,
        uid: docSnap.data().uid, // Fetch parent's auth UID if linked
        createdAt: docSnap.data().createdAt,
      }));
      setParents(fetchedParents);

    } catch (error) {
      console.error("Error fetching page data: ", error);
      toast({
        title: "Gagal Memuat Data",
        description: "Terjadi kesalahan saat mengambil data.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchPageData();
  }, [authLoading, role]);

  useEffect(() => {
    if (selectedParent && isEditDialogOpen) {
      editParentForm.reset({
        id: selectedParent.id,
        name: selectedParent.name,
        email: selectedParent.email || "",
        phone: selectedParent.phone || "",
        studentId: selectedParent.studentId,
        authUserId: selectedParent.uid || undefined,
      });
    }
  }, [selectedParent, isEditDialogOpen, editParentForm]);

  const handleAddParentSubmit: SubmitHandler<ParentFormValues> = async (data) => {
    addParentForm.clearErrors();
    const selectedStudent = studentsForDialog.find(s => s.id === data.studentId);
    if (!selectedStudent) {
      toast({ title: "Error", description: "Murid tidak ditemukan.", variant: "destructive" });
      return;
    }

    try {
      const parentsCollectionRef = collection(db, "parents");
      await addDoc(parentsCollectionRef, {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        studentId: data.studentId,
        studentName: selectedStudent.name, 
        uid: data.authUserId === NO_AUTH_USER_SELECTED ? null : data.authUserId || null, // Save parent's auth UID
        createdAt: serverTimestamp(),
      });
      
      toast({ title: "Data Orang Tua Ditambahkan", description: `${data.name} berhasil ditambahkan.` });
      setIsAddDialogOpen(false);
      addParentForm.reset({ name: "", email: "", phone: "", studentId: undefined, authUserId: undefined });
      fetchPageData(); 
    } catch (error: any) {
      console.error("Error adding parent:", error);
      toast({
        title: "Gagal Menambahkan Data Orang Tua",
        variant: "destructive",
      });
    }
  };

  const handleEditParentSubmit: SubmitHandler<EditParentFormValues> = async (data) => {
    if (!selectedParent) return;
    editParentForm.clearErrors();
    const selectedStudent = studentsForDialog.find(s => s.id === data.studentId);
    if (!selectedStudent) {
      toast({ title: "Error", description: "Murid tidak ditemukan.", variant: "destructive" });
      return;
    }

    try {
      const parentDocRef = doc(db, "parents", data.id);
      await updateDoc(parentDocRef, {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        studentId: data.studentId,
        studentName: selectedStudent.name, 
        uid: data.authUserId === NO_AUTH_USER_SELECTED ? null : data.authUserId || null, // Update parent's auth UID
      });
      
      toast({ title: "Data Orang Tua Diperbarui", description: `${data.name} berhasil diperbarui.` });
      setIsEditDialogOpen(false);
      setSelectedParent(null);
      fetchPageData();
    } catch (error) {
      console.error("Error editing parent:", error);
      toast({
        title: "Gagal Memperbarui Data Orang Tua",
        variant: "destructive",
      });
    }
  };

  const handleDeleteParent = async (parentId: string, parentName?: string) => {
    try {
      await deleteDoc(doc(db, "parents", parentId));
      toast({ title: "Data Orang Tua Dihapus", description: `${parentName || 'Data'} berhasil dihapus.` });
      setSelectedParent(null); 
      fetchPageData();
    } catch (error) {
      console.error("Error deleting parent:", error);
      toast({
        title: "Gagal Menghapus Data Orang Tua",
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
  
  const displayedParents = useMemo(() => {
    let filtered = parents;

    if (role === 'admin' && selectedClassFilter !== "all") {
      const studentUidsInSelectedClass = studentsForDialog
        .filter(student => student.classId === selectedClassFilter)
        .map(student => student.id);
      filtered = filtered.filter(parent => studentUidsInSelectedClass.includes(parent.studentId));
    }

    if (role === 'admin' && searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(parent =>
        parent.name.toLowerCase().includes(lowerSearchTerm) ||
        (parent.email && parent.email.toLowerCase().includes(lowerSearchTerm)) ||
        (parent.phone && parent.phone.includes(lowerSearchTerm)) ||
        parent.studentName.toLowerCase().includes(lowerSearchTerm) ||
        (parent.uid && parent.uid.toLowerCase().includes(lowerSearchTerm))
      );
    }
    return filtered;
  }, [parents, studentsForDialog, searchTerm, selectedClassFilter, role]);

  const renderParentFormFields = (formInstance: typeof addParentForm | typeof editParentForm, formType: 'add' | 'edit') => (
    <>
      <div>
        <Label htmlFor={`${formType}-parent-name`}>Nama Lengkap Orang Tua</Label>
        <Input id={`${formType}-parent-name`} {...formInstance.register("name")} className="mt-1" />
        {formInstance.formState.errors.name && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.name.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-parent-email`}>Email (Opsional)</Label>
        <Input id={`${formType}-parent-email`} type="email" {...formInstance.register("email")} className="mt-1" />
        {formInstance.formState.errors.email && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.email.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-parent-phone`}>Nomor Telepon (Opsional)</Label>
        <Input id={`${formType}-parent-phone`} type="tel" {...formInstance.register("phone")} className="mt-1" />
        {formInstance.formState.errors.phone && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.phone.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-parent-studentId`}>Anak (Murid)</Label>
        <Controller
          name="studentId"
          control={formInstance.control}
          render={({ field }) => (
              <Select 
                  onValueChange={field.onChange} 
                  value={field.value || undefined}
                  disabled={isLoadingData}
              >
              <SelectTrigger id={`${formType}-parent-studentId`} className="mt-1">
                <SelectValue placeholder={isLoadingData ? "Memuat murid..." : "Pilih murid"} />
              </SelectTrigger>
              <SelectContent>
                {isLoadingData ? (
                    <SelectItem key={`loading-students-item-${formType}`} value="loading-students" disabled>Memuat murid...</SelectItem>
                ) : studentsForDialog.length === 0 ? (
                    <SelectItem key={`no-students-item-${formType}`} value="no-students" disabled>Tidak ada murid terdaftar</SelectItem>
                ) : (
                  studentsForDialog.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
        />
        {formInstance.formState.errors.studentId && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.studentId.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-parent-authUserId`}>Akun Pengguna Orang Tua Tertaut (Opsional)</Label>
        <Controller
          name="authUserId"
          control={formInstance.control}
          render={({ field }) => (
            <Select
              onValueChange={(value) => field.onChange(value === NO_AUTH_USER_SELECTED ? undefined : value)}
              value={field.value || NO_AUTH_USER_SELECTED}
              disabled={isLoadingData}
            >
              <SelectTrigger id={`${formType}-parent-authUserId`} className="mt-1">
                <SelectValue placeholder={isLoadingData ? "Memuat akun..." : "Pilih akun pengguna orang tua"} />
              </SelectTrigger>
              <SelectContent>
                {isLoadingData && <SelectItem key={`loading-auth-users-${formType}`} value="loading" disabled>Memuat...</SelectItem>}
                <SelectItem key={`no-auth-user-option-${formType}`} value={NO_AUTH_USER_SELECTED}>Tidak ditautkan / Kosongkan</SelectItem>
                {authOrangtuaUsers
                  .filter(authUser => authUser && typeof authUser.id === 'string' && authUser.id.length > 0)
                  .map((authUser) => (
                  <SelectItem key={authUser.id} value={authUser.id}>
                    {authUser.name} ({authUser.email})
                  </SelectItem>
                ))}
                {!isLoadingData && authOrangtuaUsers.length === 0 && (
                  <SelectItem key={`no-auth-users-found-${formType}`} value="no-users" disabled>Tidak ada akun orang tua di User Admin.</SelectItem>
                )}
              </SelectContent>
            </Select>
          )}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Tautkan profil ini ke akun pengguna orang tua yang sudah terdaftar di Administrasi Pengguna (jika ada).
        </p>
        {formInstance.formState.errors.authUserId && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.authUserId.message}</p>
        )}
      </div>
    </>
  );


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
            <span>Daftar Orang Tua {isLoadingData ? '' : `(${displayedParents.length})`}</span>
          </CardTitle>
          {role === 'admin' && (
            <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
              setIsAddDialogOpen(isOpen);
              if (!isOpen) {
                addParentForm.reset({ name: "", email: "", phone: "", studentId: undefined, authUserId: undefined });
                addParentForm.clearErrors();
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <PlusCircle className="mr-2 h-4 w-4" /> Tambah Orang Tua
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Tambah Data Orang Tua Baru</DialogTitle>
                  <DialogDescription>
                    Isi detail orang tua dan pilih murid yang terkait.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={addParentForm.handleSubmit(handleAddParentSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                  {renderParentFormFields(addParentForm, 'add')}
                  <DialogFooter>
                    <DialogClose asChild>
                       <Button type="button" variant="outline">Batal</Button>
                    </DialogClose>
                    <Button type="submit" disabled={addParentForm.formState.isSubmitting || isLoadingData}>
                      {addParentForm.formState.isSubmitting || isLoadingData ? "Menyimpan..." : "Simpan Data"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {role === 'admin' && (
            <div className="my-4 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama orang tua/murid, email, telepon..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-full"
                />
              </div>
              <Select
                value={selectedClassFilter}
                onValueChange={setSelectedClassFilter}
                disabled={isLoadingData || allClasses.length === 0}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <FilterIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Filter Kelas Anak" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kelas</SelectItem>
                  {isLoadingData && <SelectItem key="loading-classes-filter" value="loading-classes" disabled>Memuat kelas...</SelectItem>}
                  {!isLoadingData && allClasses.length === 0 && <SelectItem key="no-classes-filter" value="no-classes" disabled>Tidak ada kelas</SelectItem>}
                  {allClasses.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {isLoadingData ? (
             <div className="space-y-2 mt-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
             </div>
          ) : displayedParents.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Orang Tua</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telepon</TableHead>
                    <TableHead>Nama Anak</TableHead>
                    <TableHead>UID Akun Tertaut</TableHead>
                    {role === 'admin' && <TableHead className="text-right">Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedParents.map((parent) => (
                    <TableRow key={parent.id}>
                      <TableCell className="font-medium">{parent.name}</TableCell>
                      <TableCell>{parent.email || "-"}</TableCell>
                      <TableCell>{parent.phone || "-"}</TableCell>
                      <TableCell>{parent.studentName || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {parent.uid ? (
                          <div className="flex items-center gap-1">
                            <UidLinkIcon className="h-3 w-3 text-muted-foreground" /> 
                            {parent.uid.substring(0,10)}...
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">Belum tertaut</span>
                        )}
                      </TableCell>
                      {role === 'admin' && (
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
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
             <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
              {searchTerm || selectedClassFilter !== "all"
                ? "Tidak ada data orang tua yang cocok dengan filter atau pencarian Anda."
                : "Tidak ada data orang tua untuk ditampilkan. Klik \"Tambah Orang Tua\" untuk membuat data baru."
              }
            </div>
          )}
        </CardContent>
      </Card>

      {role === 'admin' && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
            setIsEditDialogOpen(isOpen);
            if (!isOpen) {
              setSelectedParent(null);
              editParentForm.clearErrors();
            }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Data Orang Tua</DialogTitle>
              <DialogDescription>
                Perbarui detail data orang tua.
              </DialogDescription>
            </DialogHeader>
            {selectedParent && (
              <form onSubmit={editParentForm.handleSubmit(handleEditParentSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <Input type="hidden" {...editParentForm.register("id")} />
                 {renderParentFormFields(editParentForm, 'edit')}
                <DialogFooter>
                   <DialogClose asChild>
                      <Button type="button" variant="outline" onClick={() => { setIsEditDialogOpen(false); setSelectedParent(null); }}>Batal</Button>
                   </DialogClose>
                  <Button type="submit" disabled={editParentForm.formState.isSubmitting || isLoadingData}>
                    {(editParentForm.formState.isSubmitting || isLoadingData) ? "Menyimpan..." : "Simpan Perubahan"}
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


    