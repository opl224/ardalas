

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserCog, PlusCircle, Edit, Trash2, Eye, EyeOff, School, AlertCircle, Search, Filter as FilterIcon, ChevronDown, MoreVertical } from "lucide-react";
import { useState, useEffect, type ReactNode, useMemo, useCallback } from "react";
import { useForm, type SubmitHandler, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ROLES, Role, roleDisplayNames } from "@/config/roles";
import { useToast } from "@/hooks/use-toast";
import { db, firebaseConfig } from "@/lib/firebase/config";
import { createUserWithEmailAndPassword, getAuth, type FirebaseError } from "firebase/auth";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
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
  where,
  documentId,
  addDoc
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
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';
import { id as indonesiaLocale } from 'date-fns/locale';
import { useSidebar } from "@/components/ui/sidebar";


interface ClassMin {
  id: string;
  name: string;
  teacherId?: string;
  teacherName?: string; 
}

interface StudentMin {
    id: string;
    name: string;
    classId?: string;
    className?: string;
    parentName?: string;
    linkedParentId?: string;
}

interface User {
  id: string;
  uid: string;
  name: string;
  email: string | null;
  role: Role;
  assignedClassIds?: string[];
  classId?: string;
  className?: string;
  createdAt?: Timestamp;
}

interface TeacherProfile {
  id: string; // Document ID from 'teachers' collection
  name: string;
  email: string;
  uid?: string; // Auth UID, if linked
}


const baseUserSchema = z.object({
  role: z.enum(ROLES, { message: "Pilih peran yang valid." }),
  teacherProfileId: z.string().optional(),
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }).optional(),
  email: z.string().email({ message: "Format email tidak valid." }).optional(),
  assignedClassIds: z.array(z.string()).optional(),
  linkedStudentId: z.string().optional(),
  adminCode: z.string().optional(),
});

const addUserFormSchema = baseUserSchema.extend({
  password: z.string().min(6, { message: "Password minimal 6 karakter." }).optional(),
}).refine(data => {
    if (data.role === 'guru') {
      return !!data.teacherProfileId;
    }
    return true;
  }, {
    message: "Pilih profil guru yang valid.",
    path: ["teacherProfileId"],
})
.refine(data => {
    if (data.role === 'orangtua') {
      return !!data.linkedStudentId;
    }
    return true;
}, {
    message: "Pilih siswa yang akan dihubungkan.",
    path: ["linkedStudentId"],
})
.refine(data => {
    if (data.role !== 'guru') {
      return !!data.name;
    }
    return true;
}, { message: "Nama wajib diisi.", path: ["name"]})
.refine(data => {
    if (data.role !== 'guru') {
      return !!data.email;
    }
    return true;
}, { message: "Email wajib diisi.", path: ["email"]})
.refine(data => {
    return !!data.password;
}, { message: "Password wajib diisi.", path: ["password"] })
.refine(data => {
    if (data.role === 'admin') {
      return data.adminCode === '1234';
    }
    return true;
}, { message: "Kode konfirmasi admin tidak valid.", path: ["adminCode"] });


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
});
type EditUserFormValues = z.infer<typeof editUserFormSchema>;

const ITEMS_PER_PAGE = 10;

export default function UserAdministrationPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [allClasses, setAllClasses] = useState<ClassMin[]>([]);
  const [unlinkedTeachers, setUnlinkedTeachers] = useState<TeacherProfile[]>([]);
  const [unlinkedStudents, setUnlinkedStudents] = useState<StudentMin[]>([]);

  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingInitialData, setIsLoadingInitialData] = useState(true);

  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [isViewUserDialogOpen, setIsViewUserDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role[]>([]);
  const [isRoleFilterPopoverOpen, setIsRoleFilterPopoverOpen] = useState(false);

  const { toast } = useToast();
  const { isMobile } = useSidebar();

  const addUserForm = useForm<AddUserFormValues>({
    resolver: zodResolver(addUserFormSchema),
    defaultValues: {
      role: "guru",
      assignedClassIds: [],
    },
  });

  const editUserForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: {
        assignedClassIds: [],
    }
  });

  const fetchInitialData = useCallback(async () => {
    setIsLoadingInitialData(true);
    try {
        const classesSnapshot = await getDocs(query(collection(db, "classes"), orderBy("name", "asc")));
        const classesData = classesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClassMin));
        setAllClasses(classesData);

        const teachersSnapshot = await getDocs(query(collection(db, "teachers"), orderBy("name")));
        const allTeacherProfiles = teachersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TeacherProfile));
        
        const usersSnapshot = await getDocs(query(collection(db, "users")));
        const allUsers = usersSnapshot.docs.map(doc => doc.data());
        
        const linkedTeacherUids = new Set(allUsers.filter(u => u.role === 'guru').map(u => u.uid));
        const teachersWithoutAccount = allTeacherProfiles.filter(teacher => !teacher.uid || !linkedTeacherUids.has(teacher.uid));
        setUnlinkedTeachers(teachersWithoutAccount);

        const allStudents = allUsers.filter(u => u.role === 'siswa').map(u => ({
            id: u.uid,
            name: u.name,
            classId: u.classId,
            className: u.className,
            parentName: u.parentName,
            linkedParentId: u.linkedParentId,
        } as StudentMin));

        const studentsWithoutParents = allStudents.filter(student => !student.linkedParentId);
        setUnlinkedStudents(studentsWithoutParents);

    } catch (error) {
        console.error("Error fetching initial data: ", error);
        toast({ title: "Gagal Memuat Data Pendukung", variant: "destructive" });
    } finally {
        setIsLoadingInitialData(false);
    }
  }, [toast]);


  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const usersCollectionRef = collection(db, "users");
      const q = query(usersCollectionRef, where("role", "in", ["admin", "orangtua"]), orderBy("name", "asc"));
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
    } catch (error) {
      console.error("Error fetching users: ", error);
      toast({ title: "Gagal Memuat Pengguna", variant: "destructive" });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
    fetchUsers();
  }, [fetchInitialData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter]);

  const watchAddUserRole = addUserForm.watch("role");
  const watchEditUserRole = editUserForm.watch("role");
  const watchTeacherProfileId = addUserForm.watch("teacherProfileId");


  useEffect(() => {
    if (watchAddUserRole === 'guru' && watchTeacherProfileId) {
        const teacher = unlinkedTeachers.find(t => t.id === watchTeacherProfileId);
        if (teacher) {
            addUserForm.setValue("name", teacher.name);
            addUserForm.setValue("email", teacher.email);

            const homeroomClasses = allClasses.filter(c => c.teacherId === teacher.id);
            const classIds = homeroomClasses.map(c => c.id);
            addUserForm.setValue("assignedClassIds", classIds);
            addUserForm.trigger("assignedClassIds");
        }
    } else if (watchAddUserRole !== 'guru') {
        if (!addUserForm.formState.dirtyFields.name) addUserForm.setValue("name", undefined);
        if (!addUserForm.formState.dirtyFields.email) addUserForm.setValue("email", undefined);
        addUserForm.setValue("assignedClassIds", []);
    }
    
    if (watchAddUserRole !== 'orangtua') {
      addUserForm.setValue("linkedStudentId", undefined);
    }
    
    if (watchAddUserRole !== 'admin') {
      addUserForm.setValue("adminCode", undefined);
    }


  }, [watchAddUserRole, watchTeacherProfileId, addUserForm, unlinkedTeachers, allClasses]);

  useEffect(() => {
    if (watchEditUserRole !== 'guru') {
      editUserForm.setValue("assignedClassIds", []);
    }
  }, [watchEditUserRole, editUserForm]);

  useEffect(() => {
    if (selectedUser && isEditUserDialogOpen) {
      editUserForm.reset({
        id: selectedUser.id,
        name: selectedUser.name,
        email: selectedUser.email,
        role: selectedUser.role,
        assignedClassIds: selectedUser.assignedClassIds || [],
      });
    }
  }, [selectedUser, isEditUserDialogOpen, editUserForm]);

  const handleAddUserSubmit: SubmitHandler<AddUserFormValues> = async (data) => {
    addUserForm.clearErrors();
    let secondaryApp: FirebaseApp | undefined;
    const finalName = data.name || unlinkedTeachers.find(t => t.id === data.teacherProfileId)?.name;
    const finalEmail = data.email || unlinkedTeachers.find(t => t.id === data.teacherProfileId)?.email;
    
    if (!finalName || !finalEmail || !data.password) {
        toast({ title: "Nama, Email, atau Password tidak valid", variant: "destructive" });
        return;
    }


    try {
      secondaryApp = initializeApp(firebaseConfig, `user-creation-app-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, finalEmail, data.password);
      const newAuthUser = userCredential.user;

      const userData: any = {
        uid: newAuthUser.uid,
        name: finalName,
        email: finalEmail,
        role: data.role,
        createdAt: serverTimestamp(),
      };

      if (data.role === 'guru') {
        userData.assignedClassIds = data.assignedClassIds || [];
        if(data.teacherProfileId) {
            const teacherDocRef = doc(db, "teachers", data.teacherProfileId);
            await updateDoc(teacherDocRef, { uid: newAuthUser.uid });
        }
      }
      
      if (data.role === 'orangtua' && data.linkedStudentId) {
          const studentDocRef = doc(db, "users", data.linkedStudentId);
          await updateDoc(studentDocRef, { linkedParentId: newAuthUser.uid });
          userData.linkedStudentId = data.linkedStudentId;
      }

      await setDoc(doc(db, "users", newAuthUser.uid), userData);

      toast({ title: "Pengguna Ditambahkan", description: `${finalName} berhasil ditambahkan.` });
      setIsAddUserDialogOpen(false);
      addUserForm.reset({ role: "guru", password: "", name: undefined, email: undefined, teacherProfileId: undefined, assignedClassIds: [], linkedStudentId: undefined });
      setShowPassword(false);
      fetchUsers();
      fetchInitialData(); 
    } catch (error) {
      const firebaseError = error as FirebaseError;
      console.error("Error adding user:", error);

      if (firebaseError.code === "auth/email-already-in-use") {
        const specificMessage = "Email ini sudah terdaftar oleh akun lain.";
        addUserForm.setError("email", { type: "manual", message: specificMessage });
        toast({ title: "Gagal: Email Sudah Terdaftar", description: specificMessage, variant: "destructive" });
      } else {
        toast({ title: "Gagal Menambahkan Pengguna", description: firebaseError.message, variant: "destructive" });
      }
    } finally {
        if (secondaryApp) {
            await deleteApp(secondaryApp);
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
      } else {
        updateData.assignedClassIds = deleteField();
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

  const openViewDialog = (user: User) => {
    setSelectedUser(user);
    setIsViewUserDialogOpen(true);
  };

  const openDeleteDialog = (user: User) => {
    setSelectedUser(user);
  };

  const renderAssignedClassesForTeacher = (assignedIds?: string[]) => {
    if (!assignedIds || assignedIds.length === 0) return "-";
    return assignedIds.map(id => allClasses.find(c => c.id === id)?.name || id).join(", ");
  }

  const renderClassAssignmentField = (formInstance: ReturnType<typeof useForm<any>>, currentRole: Role | undefined) => {
    if (currentRole === 'guru') {
      const selectedClasses = formInstance.watch("assignedClassIds") || [];
      const selectedClassNames = selectedClasses.map(id => allClasses.find(c => c.id === id)?.name).filter(Boolean);
      return (
        <div>
          <Label>Kelas Wali</Label>
          <div className="mt-1 p-2 border rounded-md bg-muted/50 min-h-[40px]">
            {isLoadingInitialData ? 'Memuat kelas...' : (selectedClassNames.length > 0 ? selectedClassNames.join(', ') : 'Tidak ada kelas wali.')}
          </div>
        </div>
      );
    } 
    return null;
  };

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearchTerm = searchTerm === "" ||
                                (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                                (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesRoleFilter = roleFilter.length === 0 || roleFilter.includes(user.role);
      return matchesSearchTerm && matchesRoleFilter;
    });
  }, [users, searchTerm, roleFilter]);

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ITEMS_PER_PAGE;
    return filteredUsers.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, filteredUsers]);

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
  
  const isGuruSelectedWithNoClasses = watchAddUserRole === 'guru' && watchTeacherProfileId && (addUserForm.getValues("assignedClassIds") || []).length === 0;
  
  const AddUserParentFields = () => {
    const linkedStudentId = addUserForm.watch('linkedStudentId');
    const selectedStudent = useMemo(() => {
        if (!linkedStudentId) return null;
        return unlinkedStudents.find(s => s.id === linkedStudentId) || null;
    }, [linkedStudentId]);

    const selectedClass = useMemo(() => {
        if (!selectedStudent || !selectedStudent.classId) return null;
        return allClasses.find(c => c.id === selectedStudent.classId) || null;
    }, [selectedStudent]);

    return (
        <>
            <div>
                <Label htmlFor="linkedStudentId">Tautkan ke Siswa<span className="text-destructive">*</span></Label>
                <Controller name="linkedStudentId" control={addUserForm.control} render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || ""} disabled={isLoadingInitialData}>
                        <SelectTrigger className="mt-1">
                            <SelectValue placeholder={isLoadingInitialData ? "Memuat..." : "Pilih Siswa"}/>
                        </SelectTrigger>
                        <SelectContent>
                            {isLoadingInitialData && <SelectItem value="loading" disabled>Memuat...</SelectItem>}
                            {unlinkedStudents.length === 0 && !isLoadingInitialData && <SelectItem value="no-students" disabled>Tidak ada siswa tanpa orang tua.</SelectItem>}
                            {unlinkedStudents.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.className || 'Tanpa Kelas'})</SelectItem>)}
                        </SelectContent>
                    </Select>
                )} />
                {addUserForm.formState.errors.linkedStudentId && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.linkedStudentId.message}</p>}
            </div>
            
            {selectedStudent && (
                <div className="space-y-2 mt-2 p-3 border rounded-md bg-muted/50 text-sm">
                    <h4 className="font-semibold text-muted-foreground">Info Siswa Terpilih:</h4>
                    <p><span className="font-medium">Nama:</span> {selectedStudent.name}</p>
                    <p><span className="font-medium">Kelas:</span> {selectedClass?.name || 'Belum ada kelas'}</p>
                    <p><span className="font-medium">Wali Kelas:</span> {selectedClass?.teacherName || 'Belum ada wali kelas'}</p>
                </div>
            )}
        </>
    );
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
                addUserForm.reset({ role: "guru", password: "", name: undefined, email: undefined, teacherProfileId: undefined, assignedClassIds: [], linkedStudentId: undefined });
                setShowPassword(false);
                addUserForm.clearErrors();
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={fetchInitialData}>
                <PlusCircle className="mr-2 h-4 w-4" /> {isMobile ? 'Tambah' : 'Tambah Pengguna'}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Tambah Pengguna Baru</DialogTitle>
                <DialogDescription>
                  Pilih peran untuk memulai. Untuk Guru, pilih dari profil yang ada. Untuk peran lain, isi detail secara manual.
                </DialogDescription>
              </DialogHeader>
              <Form {...addUserForm}>
              <form onSubmit={addUserForm.handleSubmit(handleAddUserSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <div>
                  <Label htmlFor="role">Peran<span className="text-destructive">*</span></Label>
                  <Controller name="role" control={addUserForm.control} render={({ field }) => (
                        <Select onValueChange={(value) => field.onChange(value as Role)} value={field.value}>
                            <SelectTrigger id="role" className="mt-1"><SelectValue placeholder="Pilih peran" /></SelectTrigger>
                            <SelectContent>{ROLES.map((roleItem) => (<SelectItem key={roleItem} value={roleItem}>{roleDisplayNames[roleItem]}</SelectItem>))}</SelectContent>
                        </Select>
                  )}/>
                  {addUserForm.formState.errors.role && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.role.message}</p>}
                </div>
                
                {watchAddUserRole === 'guru' ? (
                    <>
                         <div>
                          <Label htmlFor="teacherProfileId">Profil Guru<span className="text-destructive">*</span></Label>
                          <Controller name="teacherProfileId" control={addUserForm.control} render={({ field }) => (
                              <Select onValueChange={field.onChange} value={field.value || ""} disabled={isLoadingInitialData}>
                                  <SelectTrigger className="mt-1">
                                    <SelectValue placeholder={isLoadingInitialData ? "Memuat..." : "Pilih Profil Guru"}/>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {isLoadingInitialData && <SelectItem value="loading" disabled>Memuat...</SelectItem>}
                                    {unlinkedTeachers.length === 0 && !isLoadingInitialData && <SelectItem value="no-teachers" disabled>Tidak ada profil guru tanpa akun.</SelectItem>}
                                    {unlinkedTeachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.email})</SelectItem>)}
                                  </SelectContent>
                              </Select>
                          )} />
                          {addUserForm.formState.errors.teacherProfileId && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.teacherProfileId.message}</p>}
                        </div>

                         {isGuruSelectedWithNoClasses && (
                           <div className="mt-2 p-3 border border-dashed border-destructive rounded-md text-destructive text-sm flex items-center gap-2">
                            <AlertCircle className="h-5 w-5" />
                            <span>Guru ini belum menjadi wali kelas. Pengguna dapat dibuat, namun tidak ada kelas wali yang akan ditugaskan.</span>
                           </div>
                         )}
                        
                        <div>
                          <Label htmlFor="name-guru">Nama Lengkap</Label>
                          <Input id="name-guru" {...addUserForm.register("name")} className="mt-1 bg-muted/50" disabled />
                        </div>
                        <div>
                          <Label htmlFor="email-guru">Email</Label>
                          <Input id="email-guru" type="email" {...addUserForm.register("email")} className="mt-1 bg-muted/50" disabled />
                        </div>
                         {renderClassAssignmentField(addUserForm, watchAddUserRole)}
                    </>
                ) : (
                    <>
                        <div>
                          <Label htmlFor="name">{watchAddUserRole === 'orangtua' ? 'Nama Orang Tua' : 'Nama Lengkap'}<span className="text-destructive">*</span></Label>
                          <Input id="name" {...addUserForm.register("name")} className="mt-1" />
                          {addUserForm.formState.errors.name && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.name.message}</p>}
                        </div>
                        <div>
                          <Label htmlFor="email">Email<span className="text-destructive">*</span></Label>
                          <Input id="email" type="email" {...addUserForm.register("email")} className="mt-1" />
                          {addUserForm.formState.errors.email && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.email.message}</p>}
                        </div>
                    </>
                )}

                {watchAddUserRole === 'orangtua' && <AddUserParentFields />}
                
                {watchAddUserRole === 'admin' && (
                  <div>
                    <Label htmlFor="adminCode">Kode Konfirmasi Admin<span className="text-destructive">*</span></Label>
                    <Input id="adminCode" {...addUserForm.register("adminCode")} className="mt-1" placeholder="Masukkan kode"/>
                    {addUserForm.formState.errors.adminCode && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.adminCode.message}</p>}
                  </div>
                )}


                <div>
                  <Label htmlFor="password">Password<span className="text-destructive">*</span></Label>
                  <div className="relative mt-1">
                    <Input id="password" type={showPassword ? "text" : "password"} {...addUserForm.register("password")} className="hide-password-reveal-icon" />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </Button>
                  </div>
                  {addUserForm.formState.errors.password && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.password.message}</p>}
                </div>
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
          <div className="my-4 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-grow">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari berdasarkan nama atau email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-full"
              />
            </div>
            <div className="flex items-center">
            <Popover open={isRoleFilterPopoverOpen} onOpenChange={setIsRoleFilterPopoverOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-auto justify-start">
                    <FilterIcon className="mr-2 h-4 w-4" />
                    {roleFilter.length > 0
                        ? roleFilter.map(r => roleDisplayNames[r]).join(', ')
                        : "Filter Peran"}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                    <CommandInput placeholder="Filter peran..." />
                    <CommandList>
                        <CommandEmpty>Tidak ada peran ditemukan.</CommandEmpty>
                        <CommandGroup>
                        {ROLES.map((roleItem) => (
                            <CommandItem
                            key={roleItem}
                            onSelect={() => {
                                setRoleFilter(prev =>
                                prev.includes(roleItem)
                                    ? prev.filter(r => r !== roleItem)
                                    : [...prev, roleItem]
                                );
                            }}
                            >
                            <Checkbox
                                className="mr-2"
                                checked={roleFilter.includes(roleItem)}
                            />
                            <span>{roleDisplayNames[roleItem]}</span>
                            </CommandItem>
                        ))}
                        </CommandGroup>
                        {roleFilter.length > 0 && (
                        <>
                            <CommandGroup>
                                <CommandItem
                                    onSelect={() => setRoleFilter([])}
                                    className="justify-center text-center text-sm text-muted-foreground hover:text-foreground cursor-pointer"
                                >
                                    Hapus Filter
                                </CommandItem>
                            </CommandGroup>
                        </>
                        )}
                    </CommandList>
                    </Command>
                </PopoverContent>
                </Popover>
            </div>
          </div>

          {isLoadingUsers || isLoadingInitialData ? (
             <div className="space-y-2 mt-4"> {[...Array(ITEMS_PER_PAGE)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)} </div>
          ) : currentTableData.length > 0 ? (
            <>
            <div className="overflow-x-auto">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">No.</TableHead>
                    <TableHead className={cn(isMobile ? "w-1/2" : "w-1/4")}>Nama</TableHead>
                    {!isMobile && <TableHead className="w-1/4">Email</TableHead>}
                    <TableHead className={cn(isMobile ? "w-1/2" : "w-1/6")}>Peran</TableHead>
                    {!isMobile && <TableHead className="w-1/4">Kelas Ditugaskan/Dimiliki</TableHead>}
                    <TableHead className="text-center w-16">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentTableData.map((user, index) => (
                    <TableRow key={user.id}>
                       <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                      <TableCell className="font-medium truncate" title={user.name}>{user.name}</TableCell>
                      {!isMobile && <TableCell className="truncate" title={user.email || ""}>{user.email || "-"}</TableCell>}
                      <TableCell>{roleDisplayNames[user.role as keyof typeof roleDisplayNames] || user.role}</TableCell>
                      {!isMobile && (
                        <TableCell className="truncate" title={user.role === 'guru' ? renderAssignedClassesForTeacher(user.assignedClassIds) : ''}>
                          {user.role === 'guru' ? renderAssignedClassesForTeacher(user.assignedClassIds) : '-'}
                        </TableCell>
                      )}
                      <TableCell className="text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Opsi untuk ${user.name}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openViewDialog(user)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Lihat Detail
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditDialog(user)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    openDeleteDialog(user);
                                  }}
                                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Hapus
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              {selectedUser && selectedUser.id === user.id && (
                                <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>Apakah Kamu Yakin?</AlertDialogTitle><AlertDialogDescription>Tindakan ini akan menghapus data pengguna <span className="font-semibold">{selectedUser?.name}</span> dari database. Ini tidak menghapus akun dari Firebase Authentication.</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter><AlertDialogCancel onClick={() => setSelectedUser(null)}>Batal</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteUser(selectedUser.id, selectedUser.name)}>Ya, Hapus</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                              )}
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                            className={cn("cursor-pointer", currentPage === 1 ? "pointer-events-none opacity-50" : undefined)}
                        />
                        </PaginationItem>
                        {renderPageNumbers()}
                        <PaginationItem>
                        <PaginationNext
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            aria-disabled={currentPage === totalPages}
                            className={cn("cursor-pointer", currentPage === totalPages ? "pointer-events-none opacity-50" : undefined)}
                        />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            )}
            </>
          ) : ( <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
              {searchTerm || roleFilter.length > 0
                ? "Tidak ada pengguna yang cocok dengan filter atau pencarian."
                : "Tidak ada pengguna. Pastikan pengguna telah ditambahkan melalui fitur \"Tambah Pengguna\"."
              }
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isViewUserDialogOpen} onOpenChange={(isOpen) => {
          setIsViewUserDialogOpen(isOpen);
          if (!isOpen) { setSelectedUser(null); }
      }}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Detail Pengguna: {selectedUser?.name}</DialogTitle>
                <DialogDescription>Informasi lengkap mengenai pengguna.</DialogDescription>
            </DialogHeader>
            {selectedUser && (
                <div className="space-y-3 py-4 max-h-[70vh] overflow-y-auto pr-2">
                    <div><Label className="text-muted-foreground">Nama Lengkap:</Label><p className="font-medium">{selectedUser.name}</p></div>
                    <div><Label className="text-muted-foreground">Email:</Label><p className="font-medium">{selectedUser.email || " (Tidak Ada Akun Login)"}</p></div>
                    <div><Label className="text-muted-foreground">UID:</Label><p className="font-mono text-xs">{selectedUser.uid || " (Tidak Ada Akun Login)"}</p></div>
                    <div><Label className="text-muted-foreground">Peran:</Label><p className="font-medium">{roleDisplayNames[selectedUser.role as keyof typeof roleDisplayNames]}</p></div>
                    {selectedUser.role === 'guru' && (
                        <div>
                            <Label className="text-muted-foreground">Kelas Ditugaskan:</Label>
                            <p className="font-medium">{renderAssignedClassesForTeacher(selectedUser.assignedClassIds) || "Tidak ada kelas ditugaskan"}</p>
                        </div>
                    )}
                    {selectedUser.createdAt && (
                       <div>
                          <Label className="text-muted-foreground">Tanggal Dibuat:</Label>
                          <p className="font-medium">{format(selectedUser.createdAt.toDate(), "dd MMMM yyyy, HH:mm", { locale: indonesiaLocale })}</p>
                       </div>
                    )}
                </div>
            )}
            <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Tutup</Button></DialogClose>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditUserDialogOpen} onOpenChange={(isOpen) => {
          setIsEditUserDialogOpen(isOpen);
          if (!isOpen) { setSelectedUser(null); editUserForm.clearErrors(); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Pengguna</DialogTitle>
            <DialogDescription>Perbarui detail pengguna. Tetapkan kelas jika peran adalah Guru.</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <Form {...editUserForm}>
            <form onSubmit={editUserForm.handleSubmit(handleEditUserSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <Input type="hidden" {...editUserForm.register("id")} />
              <div>
                <Label htmlFor="edit-name">Nama Lengkap<span className="text-destructive">*</span></Label>
                <Input id="edit-name" {...editUserForm.register("name")} className="mt-1" />
                {editUserForm.formState.errors.name && <p className="text-sm text-destructive mt-1">{editUserForm.formState.errors.name.message}</p>}
              </div>
              <div>
                <Label htmlFor="edit-email">Email<span className="text-destructive">*</span></Label>
                <Input id="edit-email" type="email" {...editUserForm.register("email")} className="mt-1" />
                {editUserForm.formState.errors.email && <p className="text-sm text-destructive mt-1">{editUserForm.formState.errors.email.message}</p>}
              </div>
              <div>
                <Label htmlFor="edit-role">Peran<span className="text-destructive">*</span></Label>
                 <Controller
                    name="role"
                    control={editUserForm.control}
                    render={({ field }) => (
                        <Select onValueChange={(value) => {
                            field.onChange(value as Role);
                            editUserForm.trigger(["assignedClassIds"]);
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





