

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
import { useState, useEffect, type ReactNode, useMemo } from "react";
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
import { Switch } from "@/components/ui/switch";

const ADMIN_SECURITY_CODE = "1234";

interface ClassMin {
  id: string;
  name: string;
}

interface TeacherProfileMin {
    id: string; // Document ID from 'teachers' collection
    name: string;
    email: string;
    classIds: string[];
}

interface ParentProfileMin {
    id: string; // Document ID from 'parents' collection
    name: string;
    email: string | null;
    studentName: string;
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
  role: z.enum(ROLES, { required_error: "Pilih peran yang valid." }),
  name: z.string().min(1, { message: "Nama wajib diisi." }),
  email: z.string().email({ message: "Format email tidak valid." }).optional().or(z.literal("")),
  password: z.string().min(6, { message: "Password minimal 6 karakter." }),
  assignedClassIds: z.array(z.string()).optional(),
  classId: z.string().optional(),
  teacherProfileId: z.string().optional(),
  parentProfileId: z.string().optional(),
  adminSecurityCode: z.string().optional(),
  isSpecialistTeacher: z.boolean().optional(),
});

const addUserFormSchema = baseUserSchema.refine(data => {
    if (data.role === 'admin') return z.string().min(1, { message: "Nama wajib diisi." }).safeParse(data.name).success;
    return true;
}, { message: "Nama wajib diisi.", path: ["name"] })
.refine(data => {
    if (data.role === 'admin') return z.string().email({ message: "Email tidak valid." }).min(1, { message: "Email wajib diisi." }).safeParse(data.email).success;
    return true;
}, { message: "Email wajib diisi.", path: ["email"] })
.refine(data => {
    if (data.role === 'guru') return !!data.teacherProfileId;
    return true;
}, { message: "Pilih guru yang valid.", path: ["teacherProfileId"] })
.refine(data => {
    if (data.role === 'guru' && !data.isSpecialistTeacher) { // Only validate if not a specialist
        return data.assignedClassIds && data.assignedClassIds.length > 0;
    }
    return true;
}, { message: "Guru ini belum ditugaskan ke kelas manapun. Harap tugaskan di menu Guru/Pelajaran.", path: ["teacherProfileId"] })
.refine(data => {
    if (data.role === 'orangtua') return !!data.parentProfileId;
    return true;
}, { message: "Pilih profil orang tua.", path: ["parentProfileId"] })
.refine(data => {
    if (data.role === 'admin') return data.adminSecurityCode === ADMIN_SECURITY_CODE;
    return true;
}, { message: "Kode konfirmasi admin tidak valid.", path: ["adminSecurityCode"] });


type AddUserFormValues = z.infer<typeof addUserFormSchema>;

const editUserFormSchema = z.object({
  id: z.string(),
  name: z.string().min(1, { message: "Nama wajib diisi." }),
  email: z.string().email({ message: "Format email tidak valid." }),
  role: z.enum(ROLES, { message: "Pilih peran yang valid." }),
  assignedClassIds: z.array(z.string()).optional(),
  classId: z.string().optional(),
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

const ITEMS_PER_PAGE = 10;

export default function UserAdministrationPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [allClasses, setAllClasses] = useState<ClassMin[]>([]);
  const [unlinkedTeachers, setUnlinkedTeachers] = useState<TeacherProfileMin[]>([]);
  const [unlinkedParents, setUnlinkedParents] = useState<ParentProfileMin[]>([]);

  const [isLoading, setIsLoading] = useState(true);

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
      name: "",
      email: "",
      password: "",
      role: "admin",
      assignedClassIds: [],
      classId: undefined,
      teacherProfileId: undefined,
      parentProfileId: undefined,
      adminSecurityCode: "",
      isSpecialistTeacher: false,
    },
  });

  const editUserForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: {
        assignedClassIds: [],
        classId: undefined,
    }
  });
  
  const fetchPageData = async () => {
    setIsLoading(true);
    try {
        const [usersSnapshot, classesSnapshot, teachersSnapshot, lessonsSnapshot, parentsSnapshot] = await Promise.all([
            getDocs(query(collection(db, "users"), orderBy("name", "asc"))),
            getDocs(query(collection(db, "classes"), orderBy("name", "asc"))),
            getDocs(query(collection(db, "teachers"), orderBy("name", "asc"))),
            getDocs(query(collection(db, "lessons"))),
            getDocs(query(collection(db, "parents"), orderBy("name", "asc")))
        ]);

        const fetchedUsers: User[] = usersSnapshot.docs.map(docSnap => ({
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

        const fetchedClasses = classesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
        setAllClasses(fetchedClasses);
        
        const classesMap = new Map(fetchedClasses.map(c => [c.id, c.name]));
        const teacherClassMap = new Map<string, Set<string>>();

        // Map classes from homeroom teacher
        classesSnapshot.forEach(classDoc => {
            const classData = classDoc.data();
            if (classData.teacherId) {
               if (!teacherClassMap.has(classData.teacherId)) teacherClassMap.set(classData.teacherId, new Set());
               teacherClassMap.get(classData.teacherId)!.add(classDoc.id);
            }
        });

        // Map classes from lessons taught
        lessonsSnapshot.docs.forEach(lessonDoc => {
            const lesson = lessonDoc.data();
            if (lesson.teacherId && lesson.classId) {
                if (!teacherClassMap.has(lesson.teacherId)) teacherClassMap.set(lesson.teacherId, new Set());
                teacherClassMap.get(lesson.teacherId)!.add(lesson.classId);
            }
        });
        
        const allTeacherProfiles = teachersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as (TeacherProfileMin & {uid?: string});
        
        const profilesWithClassIds = allTeacherProfiles.map(teacher => ({
            ...teacher,
            classIds: Array.from(teacherClassMap.get(teacher.id) || new Set()),
        }));

        setUnlinkedTeachers(profilesWithClassIds.filter(t => !t.uid));
        
        const allParentProfiles = parentsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as (ParentProfileMin & {uid?: string});
        setUnlinkedParents(allParentProfiles.filter(p => !p.uid));


    } catch (error) {
        console.error("Error fetching page data: ", error);
        toast({ title: "Gagal Memuat Data", variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  };


  useEffect(() => {
    fetchPageData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter]);

  const watchAddUserRole = addUserForm.watch("role");
  const watchEditUserRole = editUserForm.watch("role");
  const watchAddTeacherProfileId = addUserForm.watch("teacherProfileId");
  const watchAddParentProfileId = addUserForm.watch("parentProfileId");


  useEffect(() => {
    addUserForm.reset({
      role: addUserForm.getValues("role"),
      name: "",
      email: "",
      password: "",
      assignedClassIds: [],
      classId: undefined,
      teacherProfileId: undefined,
      parentProfileId: undefined,
      adminSecurityCode: "",
      isSpecialistTeacher: false,
    });
    addUserForm.clearErrors();
  }, [watchAddUserRole, addUserForm]);


  useEffect(() => {
    if (watchAddUserRole === 'guru' && watchAddTeacherProfileId) {
        const selectedTeacher = unlinkedTeachers.find(t => t.id === watchAddTeacherProfileId);
        if (selectedTeacher) {
            addUserForm.setValue("name", selectedTeacher.name);
            addUserForm.setValue("email", selectedTeacher.email);
            addUserForm.setValue("assignedClassIds", selectedTeacher.classIds);
        }
    }
  }, [watchAddTeacherProfileId, watchAddUserRole, unlinkedTeachers, addUserForm]);

  useEffect(() => {
    if (watchAddUserRole === 'orangtua' && watchAddParentProfileId) {
        const selectedParent = unlinkedParents.find(p => p.id === watchAddParentProfileId);
        if (selectedParent) {
            addUserForm.setValue("name", selectedParent.name);
            if (selectedParent.email) {
                addUserForm.setValue("email", selectedParent.email);
            }
        }
    }
  }, [watchAddParentProfileId, watchAddUserRole, unlinkedParents, addUserForm]);


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
    let secondaryApp: FirebaseApp | undefined;
    
    const finalEmail = data.email || `${data.name.toLowerCase().replace(/\s+/g, '.')}@sekolah.sch.id`;

    try {
      secondaryApp = initializeApp(firebaseConfig, `user-creation-app-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, finalEmail, data.password);
      const newAuthUser = userCredential.user;

      const userData: {
        uid: string;
        name: string;
        email: string;
        role: Role;
        createdAt: Timestamp;
        assignedClassIds?: string[];
      } = {
        uid: newAuthUser.uid,
        name: data.name,
        email: finalEmail,
        role: data.role,
        createdAt: serverTimestamp() as Timestamp,
      };

      if (data.role === 'guru') {
        userData.assignedClassIds = data.assignedClassIds || [];
        if(data.teacherProfileId){
            const teacherDocRef = doc(db, "teachers", data.teacherProfileId);
            await updateDoc(teacherDocRef, { uid: newAuthUser.uid });
        }
      } else if (data.role === 'orangtua') {
         if (data.parentProfileId) {
            const parentDocRef = doc(db, "parents", data.parentProfileId);
            await updateDoc(parentDocRef, { uid: newAuthUser.uid });
         }
      }

      await setDoc(doc(db, "users", newAuthUser.uid), userData);

      toast({ title: "Pengguna Ditambahkan", description: `${data.name} berhasil ditambahkan.` });
      setIsAddUserDialogOpen(false);
      addUserForm.reset({ name: "", email: "", password: "", role: "admin" });
      setShowPassword(false);
      fetchPageData(); // Refetch all data
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
      fetchPageData();
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
      fetchPageData();
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

  const renderClassAssignmentField = (formInstance: ReturnType<typeof useForm<EditUserFormValues>>, currentRole: Role | undefined) => {
    const noClassesAvailable = !isLoading && allClasses.length === 0;
    
    if (currentRole === 'guru') {
      return (
        <div>
          <Label>Kelas yang Ditugaskan <span className="text-destructive">*</span></Label>
           {isLoading ? (
            <p className="text-sm text-muted-foreground mt-1">Memuat kelas...</p>
          ) : noClassesAvailable ? (
            <div className="mt-2 p-3 border border-dashed border-destructive rounded-md text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              <span>Tidak ada kelas. Tambahkan di menu "Akademik &gt; Kelas".</span>
            </div>
          ) : (
            <FormField
              control={formInstance.control}
              name="assignedClassIds"
              render={({ field }) => (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between mt-1">
                      <span className="truncate">
                        {(field.value && field.value.length > 0)
                          ? field.value.map(id => allClasses.find(c => c.id === id)?.name).filter(Boolean).join(", ")
                          : "Pilih kelas..."}
                      </span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Cari kelas..." />
                      <CommandList>
                        <CommandEmpty>Tidak ada kelas ditemukan.</CommandEmpty>
                        <CommandGroup>
                          {allClasses.map((cls) => (
                            <CommandItem
                              key={cls.id}
                              value={cls.name}
                              onSelect={() => {
                                const currentValue = field.value || [];
                                const isSelected = currentValue.includes(cls.id);
                                if (isSelected) {
                                  field.onChange(currentValue.filter((id) => id !== cls.id));
                                } else {
                                  field.onChange([...currentValue, cls.id]);
                                }
                              }}
                            >
                              <Checkbox
                                className="mr-2"
                                checked={field.value?.includes(cls.id)}
                                onCheckedChange={(checked) => {
                                  const currentValue = field.value || [];
                                  return checked
                                    ? field.onChange([...currentValue, cls.id])
                                    : field.onChange(currentValue.filter((value) => value !== cls.id));
                                }}
                              />
                              {cls.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            />
          )}
          {(formInstance.formState.errors as any).assignedClassIds && (
            <p className="text-sm text-destructive mt-1">{(formInstance.formState.errors as any).assignedClassIds.message}</p>
          )}
        </div>
      );
    }
    return null;
  };

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearchTerm = searchTerm === "" ||
                                user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                user.email.toLowerCase().includes(searchTerm.toLowerCase());
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
                addUserForm.reset({ name: "", email: "", password: "", role: "admin" });
                setShowPassword(false);
                addUserForm.clearErrors();
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => { if(allClasses.length === 0 || unlinkedTeachers.length === 0) fetchPageData();}}>
                <PlusCircle className="mr-2 h-4 w-4" /> {isMobile ? 'Tambah' : 'Tambah Pengguna'}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Tambah Pengguna Baru</DialogTitle>
                <DialogDescription>
                  Pilih peran, lalu isi detail pengguna untuk membuat akun login.
                </DialogDescription>
              </DialogHeader>
              <Form {...addUserForm}>
              <form onSubmit={addUserForm.handleSubmit(handleAddUserSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <div>
                  <Label htmlFor="role">Peran <span className="text-destructive">*</span></Label>
                  <Controller
                    name="role"
                    control={addUserForm.control}
                    render={({ field }) => (
                        <Select onValueChange={(value) => field.onChange(value as Role)} defaultValue={field.value}>
                            <SelectTrigger id="role" className="mt-1"><SelectValue placeholder="Pilih peran" /></SelectTrigger>
                            <SelectContent>
                            {ROLES.map((roleItem) => ( <SelectItem key={roleItem} value={roleItem}>{roleDisplayNames[roleItem]}</SelectItem> ))}
                            </SelectContent>
                        </Select>
                    )}
                  />
                  {addUserForm.formState.errors.role && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.role.message}</p>}
                </div>
                
                {watchAddUserRole === 'guru' ? (
                    <>
                        <Controller
                            name="teacherProfileId"
                            control={addUserForm.control}
                            render={({ field }) => (
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <Label htmlFor="specialist-teacher-toggle" className="text-destructive">Nama Guru <span className="text-destructive">*</span></Label>
                                        <div className="flex items-center space-x-2">
                                            <Label htmlFor="specialist-teacher-toggle" className="text-xs text-muted-foreground">Guru Khusus</Label>
                                            <Switch
                                                id="specialist-teacher-toggle"
                                                checked={addUserForm.watch("isSpecialistTeacher")}
                                                onCheckedChange={(checked) => addUserForm.setValue("isSpecialistTeacher", checked)}
                                            />
                                        </div>
                                    </div>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger><SelectValue placeholder="Pilih guru" /></SelectTrigger>
                                        <SelectContent>
                                            {unlinkedTeachers.length === 0 ? (
                                                <SelectItem value="no-teachers" disabled>Tidak ada profil guru yang belum punya akun.</SelectItem>
                                            ) : (
                                                unlinkedTeachers.map(teacher => <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>)
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        />
                         {addUserForm.formState.errors.teacherProfileId && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.teacherProfileId.message}</p>}
                        
                        <div>
                            <Label>Email</Label>
                            <Input {...addUserForm.register("email")} className="mt-1 bg-muted" readOnly />
                        </div>
                        <div>
                            <Label>Kelas yang Ditugaskan</Label>
                            <Input 
                                value={addUserForm.watch('assignedClassIds')?.map(id => allClasses.find(c => c.id === id)?.name).filter(Boolean).join(', ') || 'Pilih guru untuk melihat kelas'}
                                className="mt-1 bg-muted h-auto" readOnly 
                            />
                        </div>
                    </>
                ) : watchAddUserRole === 'orangtua' ? (
                    <>
                       <Controller
                            name="parentProfileId"
                            control={addUserForm.control}
                            render={({ field }) => (
                                <div>
                                    <Label className="text-destructive">Nama Orang Tua <span className="text-destructive">*</span></Label>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih dari profil orang tua" /></SelectTrigger>
                                        <SelectContent>
                                            {unlinkedParents.length === 0 ? (
                                                <SelectItem value="no-parents" disabled>Tidak ada profil orang tua yang belum punya akun.</SelectItem>
                                            ) : (
                                                unlinkedParents.map(parent => <SelectItem key={parent.id} value={parent.id}>{parent.name}</SelectItem>)
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        />
                        {addUserForm.formState.errors.parentProfileId && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.parentProfileId.message}</p>}
                        <div>
                            <Label>Email</Label>
                            <Input {...addUserForm.register("email")} className="mt-1 bg-muted" readOnly placeholder="Pilih orang tua untuk melihat email"/>
                        </div>
                         <div>
                            <Label>Anak Terhubung</Label>
                            <Input 
                                value={unlinkedParents.find(p => p.id === watchAddParentProfileId)?.studentName || 'Pilih orang tua untuk melihat anak'}
                                className="mt-1 bg-muted" readOnly 
                            />
                        </div>
                    </>
                ) : (
                    <>
                      <div>
                        <Label htmlFor="name" className="text-destructive">Nama Lengkap <span className="text-destructive">*</span></Label>
                        <Input id="name" {...addUserForm.register("name")} className="mt-1" />
                        {addUserForm.formState.errors.name && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.name.message}</p>}
                      </div>
                      <div>
                        <Label htmlFor="email" className="text-destructive">Email <span className="text-destructive">*</span></Label>
                        <Input id="email" type="email" {...addUserForm.register("email")} className="mt-1" />
                        {addUserForm.formState.errors.email && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.email.message}</p>}
                      </div>
                      {watchAddUserRole === 'admin' && (
                        <div>
                            <Label htmlFor="adminSecurityCode" className="text-destructive">Kode Keamanan <span className="text-destructive">*</span></Label>
                            <Input id="adminSecurityCode" type="password" {...addUserForm.register("adminSecurityCode")} className="mt-1" />
                            {addUserForm.formState.errors.adminSecurityCode && <p className="text-sm text-destructive mt-1">{addUserForm.formState.errors.adminSecurityCode.message}</p>}
                        </div>
                      )}
                    </>
                )}


                <div>
                  <Label htmlFor="password" className="text-destructive">Password <span className="text-destructive">*</span></Label>
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

          {isLoading ? (
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
                      {!isMobile && <TableCell className="truncate" title={user.email}>{user.email}</TableCell>}
                      <TableCell>{roleDisplayNames[user.role as keyof typeof roleDisplayNames] || user.role}</TableCell>
                      {!isMobile && (
                        <TableCell className="truncate" title={user.role === 'guru' ? renderAssignedClassesForTeacher(user.assignedClassIds) : user.role === 'siswa' ? (user.className || user.classId || '-') : "-"}>
                          {user.role === 'guru' ? renderAssignedClassesForTeacher(user.assignedClassIds) :
                           user.role === 'siswa' ? (user.className || user.classId || '-') :
                           "-"}
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
                    <div><Label className="text-muted-foreground">Email:</Label><p className="font-medium">{selectedUser.email}</p></div>
                    <div><Label className="text-muted-foreground">UID:</Label><p className="font-mono text-xs">{selectedUser.uid}</p></div>
                    <div><Label className="text-muted-foreground">Peran:</Label><p className="font-medium">{roleDisplayNames[selectedUser.role as keyof typeof roleDisplayNames]}</p></div>
                    {selectedUser.role === 'guru' && (
                        <div>
                            <Label className="text-muted-foreground">Kelas Ditugaskan:</Label>
                            <p className="font-medium">{renderAssignedClassesForTeacher(selectedUser.assignedClassIds) || "Tidak ada kelas ditugaskan"}</p>
                        </div>
                    )}
                    {selectedUser.role === 'siswa' && (
                        <div>
                            <Label className="text-muted-foreground">Kelas Siswa:</Label>
                            <p className="font-medium">{selectedUser.className || selectedUser.classId || "Belum ada kelas"}</p>
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
            <DialogDescription>Perbarui detail pengguna. Tetapkan kelas jika peran adalah Guru atau Siswa.</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <Form {...editUserForm}>
            <form onSubmit={editUserForm.handleSubmit(handleEditUserSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <Input type="hidden" {...editUserForm.register("id")} />
              <div>
                <Label htmlFor="edit-name" className="text-destructive">Nama Lengkap <span className="text-destructive">*</span></Label>
                <Input id="edit-name" {...editUserForm.register("name")} className="mt-1" />
                {editUserForm.formState.errors.name && <p className="text-sm text-destructive mt-1">{editUserForm.formState.errors.name.message}</p>}
              </div>
              <div>
                <Label htmlFor="edit-email" className="text-destructive">Email <span className="text-destructive">*</span></Label>
                <Input id="edit-email" type="email" {...editUserForm.register("email")} className="mt-1" />
                {editUserForm.formState.errors.email && <p className="text-sm text-destructive mt-1">{editUserForm.formState.errors.email.message}</p>}
              </div>
              <div>
                <Label htmlFor="edit-role" className="text-destructive">Peran <span className="text-destructive">*</span></Label>
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



