
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
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { UserCog, PlusCircle, Edit, Trash2, Eye, EyeOff, School, AlertCircle } from "lucide-react";
import { useState, useEffect, type ReactNode, useMemo } from "react";
import { useForm, type SubmitHandler, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ROLES, Role, roleDisplayNames } from "@/config/roles";
import { useToast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase/config";
import { createUserWithEmailAndPassword, type FirebaseError } from "firebase/auth";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
  deleteField,
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface ClassMin {
  id: string;
  name: string;
}

interface User {
  id: string; 
  uid: string; 
  name: string;
  email: string;
  role: Role;
  assignedClassIds?: string[]; 
  classId?: string; 
  className?: string; 
  createdAt?: Timestamp; 
}

const baseUserSchema = z.object({
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }),
  email: z.string().email({ message: "Format email tidak valid." }),
  role: z.enum(ROLES, { message: "Pilih peran yang valid." }),
  assignedClassIds: z.array(z.string()).optional(),
  classId: z.string().optional(),
});

const addUserFormSchema = baseUserSchema.extend({
  password: z.string().min(6, { message: "Password minimal 6 karakter." }),
}).refine(data => {
    if (data.role === 'guru') {
      return data.assignedClassIds && data.assignedClassIds.length > 0;
    }
    return true;
  }, {
    message: "Guru harus memiliki setidaknya satu kelas yang ditugaskan.",
    path: ["assignedClassIds"],
}).refine(data => {
    if (data.role === 'siswa') {
      return !!data.classId;
    }
    return true;
  }, {
    message: "Siswa harus memiliki satu kelas yang ditetapkan.",
    path: ["classId"],
});
type AddUserFormValues = z.infer<typeof addUserFormSchema>;

const editUserFormSchema = baseUserSchema.extend({
  id: z.string(), 
}).refine(data => {
    if (data.role === 'guru') {
      return data.assignedClassIds && data.assignedClassIds.length > 0;
    }
    return true;
  }, {
    message: "Guru harus memiliki setidaknya satu kelas yang ditugaskan.",
    path: ["assignedClassIds"],
}).refine(data => {
    if (data.role === 'siswa') {
      return !!data.classId;
    }
    return true;
  }, {
    message: "Siswa harus memiliki satu kelas yang ditetapkan.",
    path: ["classId"],
});
type EditUserFormValues = z.infer<typeof editUserFormSchema>;

const ITEMS_PER_PAGE = 3;

export default function UserAdministrationPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [allClasses, setAllClasses] = useState<ClassMin[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const { toast } = useToast();

  const addUserForm = useForm<AddUserFormValues>({
    resolver: zodResolver(addUserFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "siswa",
      assignedClassIds: [],
      classId: undefined,
    },
  });

  const editUserForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: {
        assignedClassIds: [],
        classId: undefined,
    }
  });

  const fetchAllClasses = async () => {
    setIsLoadingClasses(true);
    try {
      const classesCollectionRef = collection(db, "classes");
      const q = query(classesCollectionRef, orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      setAllClasses(querySnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    } catch (error) {
      console.error("Error fetching classes: ", error);
      toast({ title: "Gagal Memuat Daftar Kelas", description: "Pastikan Anda memiliki koneksi internet dan coba lagi. Jika berlanjut, hubungi administrator.", variant: "destructive" });
    } finally {
      setIsLoadingClasses(false);
    }
  };

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const usersCollectionRef = collection(db, "users");
      const q = query(usersCollectionRef, orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const fetchedUsers: User[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id, 
        uid: docSnap.data().uid, 
        name: docSnap.data().name,
        email: docSnap.data().email,
        role: docSnap.data().role,
        assignedClassIds: docSnap.data().assignedClassIds || [],
        classId: docSnap.data().classId,
        className: docSnap.data().className,
        createdAt: docSnap.data().createdAt,
      }));
      setUsers(fetchedUsers);
      setCurrentPage(1); 
    } catch (error) {
      console.error("Error fetching users: ", error);
      toast({ title: "Gagal Memuat Pengguna", variant: "destructive" });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchAllClasses();
    fetchUsers();
  }, []);

  const watchAddUserRole = addUserForm.watch("role");
  const watchEditUserRole = editUserForm.watch("role");

  useEffect(() => {
    if (watchAddUserRole !== 'guru') {
      addUserForm.setValue("assignedClassIds", []);
    }
    if (watchAddUserRole !== 'siswa') {
      addUserForm.setValue("classId", undefined);
    }
     addUserForm.trigger(["assignedClassIds", "classId"]);
  }, [watchAddUserRole, addUserForm]);

  useEffect(() => {
    if (watchEditUserRole !== 'guru') {
      editUserForm.setValue("assignedClassIds", []);
    }
    if (watchEditUserRole !== 'siswa') {
      editUserForm.setValue("classId", undefined);
    }
    editUserForm.trigger(["assignedClassIds", "classId"]);
  }, [watchEditUserRole, editUserForm]);

  useEffect(() => {
    if (selectedUser && isEditUserDialogOpen) {
      editUserForm.reset({
        id: selectedUser.id, 
        name: selectedUser.name,
        email: selectedUser.email,
        role: selectedUser.role,
        assignedClassIds: selectedUser.assignedClassIds || [],
        classId: selectedUser.classId || undefined,
      });
    }
  }, [selectedUser, isEditUserDialogOpen, editUserForm]);

  const handleAddUserSubmit: SubmitHandler<AddUserFormValues> = async (data) => {
    addUserForm.clearErrors();
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const newAuthUser = userCredential.user;

      const userData: {
        uid: string;
        name: string;
        email: string;
        role: Role;
        createdAt: Timestamp;
        assignedClassIds?: string[];
        classId?: string;
        className?: string;
      } = {
        uid: newAuthUser.uid, 
        name: data.name,
        email: data.email,
        role: data.role,
        createdAt: serverTimestamp() as Timestamp,
      };

      if (data.role === 'guru' && data.assignedClassIds && data.assignedClassIds.length > 0) {
        userData.assignedClassIds = data.assignedClassIds;
      } else {
        delete userData.assignedClassIds; 
      }

      if (data.role === 'siswa' && data.classId) {
        const selectedClass = allClasses.find(c => c.id === data.classId);
        userData.classId = data.classId;
        userData.className = selectedClass?.name || "";
      } else {
        delete userData.classId;
        delete userData.className;
      }
      
      await setDoc(doc(db, "users", newAuthUser.uid), userData);
      
      toast({ title: "Pengguna Ditambahkan", description: `${data.name} berhasil ditambahkan.` });
      setIsAddUserDialogOpen(false);
      addUserForm.reset({ name: "", email: "", password: "", role: "siswa", assignedClassIds: [], classId: undefined });
      setShowPassword(false);
      fetchUsers();
    } catch (error) {
      const firebaseError = error as FirebaseError;
      console.error("Error adding user:", firebaseError); 

      if (firebaseError.code === "auth/email-already-in-use") {
        const specificMessage = "Email ini sudah terdaftar oleh akun lain.";
        addUserForm.setError("email", { type: "manual", message: specificMessage });
        toast({ 
            title: "Gagal Menambahkan Pengguna: Email Sudah Terdaftar", 
            description: specificMessage + " Gunakan email lain atau periksa apakah pengguna sudah ada di daftar.", 
            variant: "destructive" 
        });
      } else {
        let generalErrorMessage = "Gagal menambahkan pengguna. Silakan coba lagi.";
        if (firebaseError.message) {
            generalErrorMessage = firebaseError.message;
        }
        toast({ 
            title: "Gagal Menambahkan Pengguna", 
            description: generalErrorMessage, 
            variant: "destructive" 
        });
      }
    }
  };

  const handleEditUserSubmit: SubmitHandler<EditUserFormValues> = async (data) => {
    if (!selectedUser) return;
    editUserForm.clearErrors();
    try {
      const userDocRef = doc(db, "users", data.id); 
      const updateData: any = {
        name: data.name,
        email: data.email, 
        role: data.role,
      };

      if (data.role === 'guru') {
        updateData.assignedClassIds = data.assignedClassIds || [];
        updateData.classId = deleteField(); 
        updateData.className = deleteField(); 
      } else {
        updateData.assignedClassIds = deleteField();
      }

      if (data.role === 'siswa' && data.classId) {
        const selectedClass = allClasses.find(c => c.id === data.classId);
        updateData.classId = data.classId;
        updateData.className = selectedClass?.name || "";
        updateData.assignedClassIds = deleteField(); 
      } else if (data.role !== 'guru') { 
        updateData.classId = deleteField();
        updateData.className = deleteField();
      }
      
      await updateDoc(userDocRef, updateData);
      
      toast({ title: "Pengguna Diperbarui", description: `${data.name} berhasil diperbarui.` });
      setIsEditUserDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error("Error editing user:", error);
      toast({ title: "Gagal Memperbarui Pengguna", variant: "destructive" });
    }
  };

  const handleDeleteUser = async (userId: string, userName?: string) => {
    try {
      await deleteDoc(doc(db, "users", userId));
      toast({ title: "Pengguna Dihapus (dari Database)", description: `${userName || 'Pengguna'} berhasil dihapus.` });
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error("Error deleting user from Firestore:", error);
      toast({ title: "Gagal Menghapus Pengguna", variant: "destructive" });
    }
  };

  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setIsEditUserDialogOpen(true);
  };
  
  const openDeleteDialog = (user: User) => {
    setSelectedUser(user);
  };
  
  const renderAssignedClassesForTeacher = (assignedIds?: string[]) => {
    if (!assignedIds || assignedIds.length === 0) return "-";
    return assignedIds.map(id => allClasses.find(c => c.id === id)?.name || id).join(", ");
  }

  const renderClassAssignmentField = (formInstance: typeof addUserForm | typeof editUserForm, currentRole: Role | undefined) => {
    const noClassesAvailable = !isLoadingClasses && allClasses.length === 0;
    
    if (currentRole === 'guru') {
      return (
        <div>
          <Label>Kelas yang Ditugaskan</Label>
          {isLoadingClasses ? (
            <p className="text-sm text-muted-foreground mt-1">Memuat kelas...</p>
          ) : noClassesAvailable ? (
            <div className="mt-2 p-3 border border-dashed border-destructive rounded-md text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              <span>Tidak ada kelas yang dapat dipilih. Tambahkan data kelas melalui menu "Akademik &gt; Kelas" terlebih dahulu.</span>
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2 border p-3 rounded-md max-h-40 overflow-y-auto">
              {allClasses.map((cls) => (
                <FormField
                  key={cls.id}
                  control={formInstance.control}
                  name="assignedClassIds"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value?.includes(cls.id)}
                          onCheckedChange={(checked) => {
                            const currentValue = field.value || [];
                            return checked
                              ? field.onChange([...currentValue, cls.id])
                              : field.onChange(currentValue.filter((value) => value !== cls.id));
                          }}
                        />
                      </FormControl>
                      <FormLabel className="font-normal text-sm">
                        {cls.name}
                      </FormLabel>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          )}
          {(formInstance.formState.errors as any).assignedClassIds && (
            <p className="text-sm text-destructive mt-1">{(formInstance.formState.errors as any).assignedClassIds.message}</p>
          )}
        </div>
      );
    } else if (currentRole === 'siswa') {
      return (
         <div>
            <Label htmlFor="classId">Kelas Siswa</Label>
            {noClassesAvailable && (
                 <div className="mt-2 mb-2 p-3 border border-dashed border-destructive rounded-md text-destructive text-sm flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    <span>Tidak ada kelas yang dapat dipilih. Tambahkan data kelas melalui menu "Akademik &gt; Kelas" terlebih dahulu.</span>
                </div>
            )}
            <Controller
                name="classId"
                control={formInstance.control}
                render={({ field }) => (
                    <Select
                        onValueChange={(value) => { field.onChange(value); formInstance.trigger("classId");}}
                        value={field.value || undefined}
                        disabled={isLoadingClasses || noClassesAvailable}
                    >
                        <SelectTrigger id="classId" className="mt-1">
                            <SelectValue placeholder={isLoadingClasses ? "Memuat kelas..." : (noClassesAvailable ? "Tidak ada kelas tersedia." : "Pilih kelas")} />
                        </SelectTrigger>
                        <SelectContent>
                            {isLoadingClasses && <SelectItem value="loading" disabled>Memuat...</SelectItem>}
                            {allClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            {allClasses.length === 0 && !isLoadingClasses && <SelectItem value="no-classes" disabled>Tidak ada kelas tersedia. Harap tambahkan kelas terlebih dahulu.</SelectItem>}
                        </SelectContent>
                    </Select>
                )}
            />
            {(formInstance.formState.errors as any).classId && (
                <p className="text-sm text-destructive mt-1">{(formInstance.formState.errors as any).classId.message}</p>
            )}
        </div>
      );
    }
    return null;
  };

  const totalPages = Math.ceil(users.length / ITEMS_PER_PAGE);
  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ITEMS_PER_PAGE;
    return users.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, users]);

  const renderPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5; 
    let startPage, endPage;

    if (totalPages <= maxPagesToShow) {
      startPage = 1;
      endPage = totalPages;
    } else {
      if (currentPage <= Math.ceil(maxPagesToShow / 2)) {
        startPage = 1;
        endPage = maxPagesToShow;
      } else if (currentPage + Math.floor(maxPagesToShow / 2) >= totalPages) {
        startPage = totalPages - maxPagesToShow + 1;
        endPage = totalPages;
      } else {
        startPage = currentPage - Math.floor(maxPagesToShow / 2);
        endPage = currentPage + Math.floor(maxPagesToShow / 2);
      }
    }

    if (startPage > 1) {
      pageNumbers.push(<PaginationItem key="1"><PaginationLink onClick={() => setCurrentPage(1)}>1</PaginationLink></PaginationItem>);
      if (startPage > 2) {
        pageNumbers.push(<PaginationItem key="start-ellipsis"><PaginationEllipsis /></PaginationItem>);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(
        <PaginationItem key={i}>
          <PaginationLink onClick={() => setCurrentPage(i)} isActive={currentPage === i}>
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pageNumbers.push(<PaginationItem key="end-ellipsis"><PaginationEllipsis /></PaginationItem>);
      }
      pageNumbers.push(<PaginationItem key={totalPages}><PaginationLink onClick={() => setCurrentPage(totalPages)}>{totalPages}</PaginationLink></PaginationItem>);
    }
    return pageNumbers;
  };


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Administrasi Pengguna</h1>
        <p className="text-muted-foreground">Kelola akun pengguna, peran, dan penetapan kelas.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <UserCog className="h-6 w-6 text-primary" />
            <span>Manajemen Pengguna</span>
          </CardTitle>
          <Dialog open={isAddUserDialogOpen} onOpenChange={(isOpen) => {
            setIsAddUserDialogOpen(isOpen);
            if (!isOpen) { 
                addUserForm.reset({ name: "", email: "", password: "", role: "siswa", assignedClassIds: [], classId: undefined }); 
                setShowPassword(false); 
                addUserForm.clearErrors(); 
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => { if(allClasses.length === 0 && !isLoadingClasses) fetchAllClasses();}}>
                <PlusCircle className="mr-2 h-4 w-4" /> Tambah Pengguna
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Tambah Pengguna Baru</DialogTitle>
                <DialogDescription>
                  Isi detail pengguna. Tetapkan kelas jika peran adalah Guru atau Siswa.
                </DialogDescription>
              </DialogHeader>
              <Form {...addUserForm}>
              <form onSubmit={addUserForm.handleSubmit(handleAddUserSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <div>
                  <Label htmlFor="name">Nama Lengkap</Label>
                  <Input id="name" {...addUserForm.register("name")} className="mt-1" />
                  {addUserForm.formState.errors.name && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.name.message}</p>}
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...addUserForm.register("email")} className="mt-1" />
                  {addUserForm.formState.errors.email && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.email.message}</p>}
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <div className="relative mt-1">
                    <Input id="password" type={showPassword ? "text" : "password"} {...addUserForm.register("password")} />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </Button>
                  </div>
                  {addUserForm.formState.errors.password && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.password.message}</p>}
                </div>
                <div>
                  <Label htmlFor="role">Peran</Label>
                  <Controller
                    name="role"
                    control={addUserForm.control}
                    render={({ field }) => (
                        <Select onValueChange={(value) => { 
                            field.onChange(value as Role); 
                            addUserForm.trigger(["assignedClassIds", "classId"]); 
                        }} defaultValue={field.value}>
                            <SelectTrigger id="role" className="mt-1"><SelectValue placeholder="Pilih peran" /></SelectTrigger>
                            <SelectContent>
                            {ROLES.map((roleItem) => ( <SelectItem key={roleItem} value={roleItem}>{roleDisplayNames[roleItem]}</SelectItem> ))}
                            </SelectContent>
                        </Select>
                    )}
                  />
                  {addUserForm.formState.errors.role && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.role.message}</p>}
                </div>
                
                {renderClassAssignmentField(addUserForm, watchAddUserRole)}

                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                  <Button type="submit" disabled={addUserForm.formState.isSubmitting}>{addUserForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Pengguna"}</Button>
                </DialogFooter>
              </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoadingUsers || isLoadingClasses ? (
             <div className="space-y-2 mt-4"> {[...Array(ITEMS_PER_PAGE)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)} </div>
          ) : users.length > 0 ? (
            <>
            <div className="overflow-x-auto">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/4">Nama</TableHead>
                    <TableHead className="w-1/4">Email</TableHead>
                    <TableHead className="w-1/6">Peran</TableHead>
                    <TableHead className="w-1/4">Kelas Ditugaskan/Dimiliki</TableHead>
                    <TableHead className="text-right w-[120px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentTableData.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium truncate max-w-xs" title={user.name}>{user.name}</TableCell>
                      <TableCell className="truncate max-w-sm" title={user.email}>{user.email}</TableCell>
                      <TableCell>{roleDisplayNames[user.role] || user.role}</TableCell>
                      <TableCell className="truncate max-w-sm" title={user.role === 'guru' ? renderAssignedClassesForTeacher(user.assignedClassIds) : user.role === 'siswa' ? (user.className || user.classId || '-') : "-"}>
                        {user.role === 'guru' ? renderAssignedClassesForTeacher(user.assignedClassIds) : 
                         user.role === 'siswa' ? (user.className || user.classId || '-') :
                         "-"}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="icon" onClick={() => openEditDialog(user)} aria-label={`Edit ${user.name}`}><Edit className="h-4 w-4" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="destructive" size="icon" onClick={() => openDeleteDialog(user)} aria-label={`Hapus ${user.name}`}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                          {selectedUser && selectedUser.id === user.id && (
                            <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle><AlertDialogDescription>Tindakan ini akan menghapus data pengguna <span className="font-semibold">{selectedUser?.name}</span> dari database. Ini tidak menghapus akun dari Firebase Authentication.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel onClick={() => setSelectedUser(null)}>Batal</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteUser(selectedUser.id, selectedUser.name)}>Ya, Hapus</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          )}
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
                <Pagination className="mt-6">
                    <PaginationContent>
                        <PaginationItem>
                        <PaginationPrevious 
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                            aria-disabled={currentPage === 1}
                            className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined}
                        />
                        </PaginationItem>
                        {renderPageNumbers()}
                        <PaginationItem>
                        <PaginationNext 
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                            aria-disabled={currentPage === totalPages}
                            className={currentPage === totalPages ? "pointer-events-none opacity-50" : undefined}
                        />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            )}
            </>
          ) : ( <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">Tidak ada pengguna. Pastikan pengguna telah ditambahkan melalui fitur "Tambah Pengguna" di aplikasi ini (yang akan membuat entri di database dan di Firebase Authentication), atau jika pengguna sudah ada di Firebase Authentication, pastikan ada entri yang sesuai di database Firestore pada koleksi 'users' dengan field `uid` yang sesuai.</div> )}
        </CardContent>
      </Card>

      <Dialog open={isEditUserDialogOpen} onOpenChange={(isOpen) => {
          setIsEditUserDialogOpen(isOpen);
          if (!isOpen) { setSelectedUser(null); editUserForm.clearErrors(); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Pengguna</DialogTitle>
            <DialogDescription>Perbarui detail pengguna. Tetapkan kelas jika peran adalah Guru atau Siswa.</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <Form {...editUserForm}>
            <form onSubmit={editUserForm.handleSubmit(handleEditUserSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <Input type="hidden" {...editUserForm.register("id")} />
              <div>
                <Label htmlFor="edit-name">Nama Lengkap</Label>
                <Input id="edit-name" {...editUserForm.register("name")} className="mt-1" />
                {editUserForm.formState.errors.name && <p className="text-sm text-destructive mt-1">{editUserForm.formState.errors.name.message}</p>}
              </div>
              <div>
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" type="email" {...editUserForm.register("email")} className="mt-1" />
                {editUserForm.formState.errors.email && <p className="text-sm text-destructive mt-1">{editUserForm.formState.errors.email.message}</p>}
              </div>
              <div>
                <Label htmlFor="edit-role">Peran</Label>
                 <Controller
                    name="role"
                    control={editUserForm.control}
                    render={({ field }) => (
                        <Select onValueChange={(value) => { 
                            field.onChange(value as Role); 
                            editUserForm.trigger(["assignedClassIds", "classId"]); 
                        }} value={field.value}>
                            <SelectTrigger id="edit-role" className="mt-1"><SelectValue placeholder="Pilih peran" /></SelectTrigger>
                            <SelectContent>
                            {ROLES.map((roleItem) => (<SelectItem key={roleItem} value={roleItem}>{roleDisplayNames[roleItem]}</SelectItem>))}
                            </SelectContent>
                        </Select>
                    )}
                  />
                {editUserForm.formState.errors.role && <p className="text-sm text-destructive mt-1">{editUserForm.formState.errors.role.message}</p>}
              </div>

              {renderClassAssignmentField(editUserForm, watchEditUserRole)}

              <DialogFooter>
                 <DialogClose asChild><Button type="button" variant="outline" onClick={() => { setIsEditUserDialogOpen(false); setSelectedUser(null); }}>Batal</Button></DialogClose>
                <Button type="submit" disabled={editUserForm.formState.isSubmitting}>{editUserForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}</Button>
              </DialogFooter>
            </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
    

    
