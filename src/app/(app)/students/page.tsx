
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
import { Users, PlusCircle, Edit, Trash2, Search, Filter as FilterIcon, MoreVertical, Eye, CalendarIcon } from "lucide-react"; 
import Image from "next/image";
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
  documentId,
  limit
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext"; 
import { Textarea } from "@/components/ui/textarea";
import { format, startOfDay } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import LottieLoader from "@/components/ui/LottieLoader";
import { CalendarDatePicker } from "@/components/calendar-date-picker";
import { useSidebar } from "@/components/ui/sidebar";


interface ClassMin {
  id: string;
  name: string;
}

interface ParentMin {
  id: string;
  name: string;
}

interface Student {
  id: string; 
  name: string;
  nis?: string; 
  email?: string; 
  classId: string; 
  className?: string; 
  dateOfBirth?: Timestamp;
  gender?: "laki-laki" | "perempuan";
  address?: string;
  linkedParentId?: string;
  parentName?: string; 
  attendanceNumber?: number;
  createdAt?: Timestamp; 
}

const GENDERS = ["laki-laki", "perempuan"] as const;

const baseStudentFormSchema = z.object({
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }),
  nis: z.string().min(5, { message: "NIS minimal 5 karakter." }),
  email: z.string().email({ message: "Format email tidak valid." }).optional().or(z.literal("")),
  classId: z.string({ required_error: "Pilih kelas." }), 
  dateOfBirth: z.date().optional(),
  gender: z.enum(GENDERS).optional(),
  address: z.string().optional(),
  linkedParentId: z.string().optional(),
  attendanceNumber: z.coerce.number().positive("Nomor absen harus angka positif.").int("Nomor absen harus bilangan bulat.").optional().nullable(),
});

const studentFormSchema = baseStudentFormSchema;
type StudentFormValues = z.infer<typeof studentFormSchema>;

const editStudentFormSchema = baseStudentFormSchema.extend({
  id: z.string(),
});
type EditStudentFormValues = z.infer<typeof editStudentFormSchema>;

const ITEMS_PER_PAGE = 10;

export default function StudentsPage() {
  const { user: authUser, role: authRole, loading: authLoading } = useAuth(); 
  const [students, setStudents] = useState<Student[]>([]);
  const [allClasses, setAllClasses] = useState<ClassMin[]>([]);
  const [allParents, setAllParents] = useState<ParentMin[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingParents, setIsLoadingParents] = useState(true);
  const [isAddStudentDialogOpen, setIsAddStudentDialogOpen] = useState(false);
  const [isEditStudentDialogOpen, setIsEditStudentDialogOpen] = useState(false);
  const [isViewStudentDialogOpen, setIsViewStudentDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedStudentForView, setSelectedStudentForView] = useState<Student | null>(null);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const { toast } = useToast();
  const { isMobile } = useSidebar();

  const addStudentForm = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      name: "",
      nis: "",
      email: "",
      classId: undefined,
      dateOfBirth: undefined,
      gender: undefined,
      address: "",
      linkedParentId: undefined,
      attendanceNumber: undefined,
    },
  });

  const editStudentForm = useForm<EditStudentFormValues>({
    resolver: zodResolver(editStudentFormSchema),
    defaultValues: { 
      name: "",
      nis: "",
      email: "",
      classId: undefined,
      dateOfBirth: undefined,
      gender: undefined,
      address: "",
      linkedParentId: undefined,
      attendanceNumber: undefined,
    }
  });

  const fetchPageInitialData = async () => {
    setIsLoadingClasses(true);
    setIsLoadingParents(true);
    try {
      const promises = [];
      
      if (authRole === 'admin' || authRole === 'guru') {
        const classesCollectionRef = collection(db, "classes");
        const qClasses = query(classesCollectionRef, orderBy("name", "asc"));
        promises.push(getDocs(qClasses));

        const parentsCollectionRef = collection(db, "parents");
        const qParents = query(parentsCollectionRef, orderBy("name", "asc"));
        promises.push(getDocs(qParents));
      } else {
        const classesCollectionRef = collection(db, "classes");
        const qClasses = query(classesCollectionRef, orderBy("name", "asc"));
        promises.push(getDocs(qClasses));
        promises.push(Promise.resolve(null)); 
      }
      
      const [classesSnapshot, parentsSnapshot] = await Promise.all(promises);

      if (classesSnapshot) {
        setAllClasses((classesSnapshot as any).docs.map((docSnap: any) => ({ id: docSnap.id, name: docSnap.data().name })));
      } else {
        setAllClasses([]);
      }
      setIsLoadingClasses(false);
      
      if (parentsSnapshot) {
        setAllParents((parentsSnapshot as any).docs.map((docSnap: any) => ({ id: docSnap.id, name: docSnap.data().name })));
      } else {
        setAllParents([]);
      }
      setIsLoadingParents(false);

    } catch (error) {
      console.error("Error fetching initial page data: ", error);
      toast({ title: "Gagal Memuat Data Pendukung", variant: "destructive" });
      setAllClasses([]);
      setAllParents([]);
      setIsLoadingClasses(false);
      setIsLoadingParents(false);
    }
  };


  const fetchStudents = async () => {
    if (authLoading) return;
    setIsLoadingStudents(true);
    try {
      const usersCollectionRef = collection(db, "users");
      let finalFetchedStudents: Student[] = [];

      if (authRole === 'siswa' && authUser?.classId) {
        const studentsQuery = query(usersCollectionRef, where("role", "==", "siswa"), where("classId", "==", authUser.classId), orderBy("name", "asc"));
        const querySnapshot = await getDocs(studentsQuery);
        finalFetchedStudents = querySnapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
        } as Student));
      } else if (authRole === 'admin' || authRole === 'guru') { 
        const studentsQuery = query(usersCollectionRef, where("role", "==", "siswa"), orderBy("name", "asc"));
        const querySnapshot = await getDocs(studentsQuery);
        finalFetchedStudents = querySnapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
        } as Student));
      }
      setStudents(finalFetchedStudents);
    } catch (error) {
      console.error("Error fetching students: ", error);
      toast({ title: "Gagal Memuat Data Murid", variant: "destructive" });
      setStudents([]);
    } finally {
      setIsLoadingStudents(false);
    }
  };
  
  useEffect(() => {
    const initializePageData = async () => {
      if (!authLoading) {
        await fetchPageInitialData();
      }
    };
    initializePageData();
  }, [authRole, authUser, authLoading]);

  useEffect(() => {
    if (!authLoading && !isLoadingClasses && !isLoadingParents) { 
        fetchStudents();
    }
  }, [authLoading, isLoadingClasses, isLoadingParents, allClasses]);


  useEffect(() => {
    if (selectedStudent && isEditStudentDialogOpen) {
      editStudentForm.reset({
        id: selectedStudent.id,
        name: selectedStudent.name,
        nis: selectedStudent.nis || "",
        email: selectedStudent.email || "",
        classId: selectedStudent.classId,
        dateOfBirth: selectedStudent.dateOfBirth ? selectedStudent.dateOfBirth.toDate() : undefined,
        gender: selectedStudent.gender,
        address: selectedStudent.address || "",
        linkedParentId: selectedStudent.linkedParentId || undefined,
        attendanceNumber: selectedStudent.attendanceNumber ?? undefined,
      });
    }
  }, [selectedStudent, isEditStudentDialogOpen, editStudentForm]);
  
  const displayedStudents = useMemo(() => {
    let filtered = students;
    if ((authRole === 'admin' || authRole === 'guru') && selectedClassFilter !== "all") {
      filtered = filtered.filter(student => student.classId === selectedClassFilter);
    }
    if ((authRole === 'admin' || authRole === 'guru') && searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(student =>
        student.name.toLowerCase().includes(lowerSearchTerm) ||
        (student.nis && student.nis.toLowerCase().includes(lowerSearchTerm)) ||
        (student.email && student.email.toLowerCase().includes(lowerSearchTerm))
      );
    }
    return filtered;
  }, [students, searchTerm, selectedClassFilter, authRole]);

  const totalPages = Math.ceil(displayedStudents.length / ITEMS_PER_PAGE);
  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ITEMS_PER_PAGE;
    return displayedStudents.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, displayedStudents]);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedClassFilter]);


  const handleAddStudentSubmit: SubmitHandler<StudentFormValues> = async (data) => {
    if (authRole !== 'admin' && authRole !== 'guru') { 
        toast({ title: "Aksi Ditolak", description: "Hanya admin atau guru yang dapat menambahkan murid.", variant: "destructive"});
        return;
    }
    addStudentForm.clearErrors();
    
    const selectedClassObj = allClasses.find(c => c.id === data.classId);
    if (!selectedClassObj) {
        toast({ title: "Kelas tidak valid", description: "Silakan pilih kelas yang valid untuk murid.", variant: "destructive" });
        return;
    }
    const selectedParent = data.linkedParentId ? allParents.find(p => p.id === data.linkedParentId) : undefined;

    try {
      const studentDataForUsersCollection: any = {
        name: data.name,
        nis: data.nis,
        email: data.email || null,
        classId: selectedClassObj.id, 
        className: selectedClassObj.name, 
        role: 'siswa', 
        createdAt: serverTimestamp(),
        dateOfBirth: data.dateOfBirth ? Timestamp.fromDate(startOfDay(data.dateOfBirth)) : null,
        gender: data.gender || null,
        address: data.address || null,
        linkedParentId: data.linkedParentId || null,
        parentName: selectedParent?.name || null,
        attendanceNumber: data.attendanceNumber != null && !isNaN(data.attendanceNumber) ? data.attendanceNumber : null,
      };

      await addDoc(collection(db, "users"), studentDataForUsersCollection);
      toast({ title: "Murid Ditambahkan ke Profil", description: `${data.name} berhasil ditambahkan ke daftar profil.` });
      setIsAddStudentDialogOpen(false);
      addStudentForm.reset({ name: "", nis: "", email: "", classId: undefined, dateOfBirth: undefined, gender: undefined, address: "", linkedParentId: undefined, attendanceNumber: undefined });
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
     if (authRole !== 'admin' && authRole !== 'guru') { 
        toast({ title: "Aksi Ditolak", description: "Hanya admin atau guru yang dapat mengedit murid.", variant: "destructive"});
        return;
    }
    editStudentForm.clearErrors();
    const selectedClass = allClasses.find(c => c.id === data.classId);
    if (!selectedClass) {
        toast({ title: "Kelas tidak valid", variant: "destructive" });
        return;
    }
    const selectedParent = data.linkedParentId ? allParents.find(p => p.id === data.linkedParentId) : undefined;
    try {
      const studentDocRef = doc(db, "users", selectedStudent.id); 
      const updateData: any = {
        name: data.name,
        nis: data.nis,
        email: data.email || null,
        classId: data.classId,
        className: selectedClass.name, 
        dateOfBirth: data.dateOfBirth ? Timestamp.fromDate(startOfDay(data.dateOfBirth)) : null,
        gender: data.gender || null,
        address: data.address || null,
        linkedParentId: data.linkedParentId || null,
        parentName: selectedParent?.name || null,
        attendanceNumber: data.attendanceNumber != null && !isNaN(data.attendanceNumber) ? data.attendanceNumber : null,
      };
      
      await updateDoc(studentDocRef, updateData);
      
      toast({ title: "Data Murid Diperbarui", description: `${data.name} berhasil diperbarui.` });
      setIsEditStudentDialogOpen(false);
      setSelectedStudent(null);
      fetchStudents();
    } catch (error) {
      console.error("Error editing student:", error);
      toast({
        title: "Gagal Memperbarui Data Murid",
        variant: "destructive",
      });
    }
  };

  const handleDeleteStudent = async (studentId: string, studentName?: string) => {
    if (authRole !== 'admin' && authRole !== 'guru') {
        toast({ title: "Aksi Ditolak", description: "Hanya admin atau guru yang dapat menghapus murid.", variant: "destructive"});
        return;
    }
    try {
      await deleteDoc(doc(db, "users", studentId));
      toast({ title: "Data Murid Dihapus dari Profil", description: `${studentName || 'Murid'} berhasil dihapus dari daftar profil.` });
      setSelectedStudent(null); 
      fetchStudents();
    } catch (error) {
      console.error("Error deleting student:", error);
      toast({
        title: "Gagal Menghapus Murid",
        variant: "destructive",
      });
    }
  };

  const openViewStudentDialog = (student: Student) => {
    setSelectedStudentForView(student);
    setIsViewStudentDialogOpen(true);
  };

  const openEditDialog = (student: Student) => {
    if (authRole !== 'admin' && authRole !== 'guru') {
        toast({ title: "Aksi Ditolak", description: "Anda tidak memiliki izin untuk mengedit murid.", variant: "destructive"});
        return;
    }
    if ((allClasses.length === 0 && !isLoadingClasses) || (allParents.length === 0 && !isLoadingParents)) {
      fetchPageInitialData();
    }
    setSelectedStudent(student);
    setIsEditStudentDialogOpen(true);
  };
  
  const openDeleteDialog = (student: Student) => {
     if (authRole !== 'admin' && authRole !== 'guru') {
        toast({ title: "Aksi Ditolak", description: "Anda tidak memiliki izin untuk menghapus murid.", variant: "destructive"});
        return;
    }
    setSelectedStudent(student); 
  };
  
  const renderStudentFormFields = (formInstance: typeof addStudentForm | typeof editStudentForm, formType: 'add' | 'edit') => (
    <>
      <div>
        <Label htmlFor={`${formType}-student-name`}>Nama Lengkap</Label>
        <Input id={`${formType}-student-name`} {...formInstance.register("name")} className="mt-1" />
        {formInstance.formState.errors.name && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.name.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-student-nis`}>NIS</Label>
        <Input id={`${formType}-student-nis`} {...formInstance.register("nis")} className="mt-1" />
        {formInstance.formState.errors.nis && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.nis.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-student-email`}>Email (Opsional)</Label>
        <Input id={`${formType}-student-email`} type="email" {...formInstance.register("email")} className="mt-1" />
        {formInstance.formState.errors.email && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.email.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-student-classId`}>Kelas</Label>
        <Controller
          name="classId"
          control={formInstance.control}
          render={({ field }) => (
            <Select 
              onValueChange={field.onChange} 
              value={field.value || undefined} 
              disabled={isLoadingClasses}
            >
              <SelectTrigger id={`${formType}-student-classId`} className="mt-1">
                <SelectValue placeholder={isLoadingClasses ? "Memuat kelas..." : "Pilih kelas"} />
              </SelectTrigger>
              <SelectContent>
                {isLoadingClasses ? (
                  <SelectItem value="loading" disabled>Memuat kelas...</SelectItem>
                ) : allClasses.length === 0 ? (
                  <SelectItem value="no-classes" disabled>Tidak ada kelas tersedia</SelectItem>
                ) : (
                  allClasses.map((classItem) => (
                    <SelectItem key={classItem.id} value={classItem.id}>
                      {classItem.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
        />
        {formInstance.formState.errors.classId && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.classId.message}</p>
        )}
      </div>
      {(authRole === 'admin' || authRole === 'guru') && (
        <>
          <div>
            <Label htmlFor={`${formType}-student-dateOfBirth`}>Tanggal Lahir (Opsional)</Label>
            <Controller
              control={formInstance.control}
              name="dateOfBirth"
              render={({ field }) => (
                <CalendarDatePicker
                  id={`${formType}-student-dateOfBirth-picker`}
                  date={{ from: field.value, to: field.value }}
                  onDateSelect={(range) => field.onChange(range.from)}
                  numberOfMonths={1}
                  closeOnSelect={true}
                  yearsRange={30} 
                  className="mt-1 w-full"
                  variant="outline" 
                />
              )}
            />
            {formInstance.formState.errors.dateOfBirth && (
              <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.dateOfBirth.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor={`${formType}-student-gender`}>Jenis Kelamin (Opsional)</Label>
            <Controller
              name="gender"
              control={formInstance.control}
              render={({ field }) => (
                <Select
                  onValueChange={(value) => field.onChange(value as typeof GENDERS[number] | undefined)}
                  value={field.value || undefined}
                >
                  <SelectTrigger id={`${formType}-student-gender`} className="mt-1">
                    <SelectValue placeholder="Pilih jenis kelamin" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map(genderValue => (
                        <SelectItem key={genderValue} value={genderValue}>
                            {genderValue.charAt(0).toUpperCase() + genderValue.slice(1)}
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {formInstance.formState.errors.gender && (
              <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.gender.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor={`${formType}-student-address`}>Alamat (Opsional)</Label>
            <Textarea
              id={`${formType}-student-address`}
              {...formInstance.register("address")}
              className="mt-1"
              placeholder="Masukkan alamat lengkap murid"
            />
            {formInstance.formState.errors.address && (
              <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.address.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor={`${formType}-student-linkedParentId`}>Orang Tua Terhubung (Opsional)</Label>
            <Controller
              name="linkedParentId"
              control={formInstance.control}
              render={({ field }) => (
                <Select
                  onValueChange={(value) => field.onChange(value === "_NONE_" ? undefined : value)}
                  value={field.value || "_NONE_"}
                  disabled={isLoadingParents}
                >
                  <SelectTrigger id={`${formType}-student-linkedParentId`} className="mt-1">
                    <SelectValue placeholder={isLoadingParents ? "Memuat orang tua..." : "Pilih orang tua"} />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingParents ? (
                      <SelectItem value="loading_parents" disabled>Memuat orang tua...</SelectItem>
                    ) : (
                      <>
                        <SelectItem value="_NONE_">Tidak Ada / Kosongkan</SelectItem>
                        {allParents.map((parent) => (
                          <SelectItem key={parent.id} value={parent.id}>
                            {parent.name}
                          </SelectItem>
                        ))}
                        {allParents.length === 0 && <SelectItem value="no_parents" disabled>Belum ada data orang tua.</SelectItem>}
                      </>
                    )}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div>
            <Label htmlFor={`${formType}-student-attendanceNumber`}>Nomor Absen (Opsional)</Label>
            <Input
              id={`${formType}-student-attendanceNumber`}
              type="number"
              {...formInstance.register("attendanceNumber", { setValueAs: (v) => (v === "" ? null : Number(v)) })}
              className="mt-1"
              placeholder="Contoh: 15"
            />
            {formInstance.formState.errors.attendanceNumber && (
              <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.attendanceNumber.message}</p>
            )}
          </div>
        </>
      )}
    </>
  );

  const pageTitle = (authRole === 'admin' || authRole === 'guru')
    ? "Manajemen Murid"
    : (authRole === 'siswa' && authUser?.className 
      ? `Daftar Siswa Kelas ${authUser.className}` 
      : "Daftar Murid"); 
  
  const pageDescription = (authRole === 'admin' || authRole === 'guru')
    ? "Kelola data murid, absensi, nilai, dan informasi terkait."
    : (authRole === 'siswa' && authUser?.className
      ? `Daftar teman sekelas Anda.`
      : "Informasi murid.");

  const showClassFilter = ((authRole === 'admin' || authRole === 'guru') && allClasses.length > 0);
  const isLoadingCombined = isLoadingStudents || authLoading || ((authRole === 'admin' || authRole === 'guru') && (isLoadingClasses || isLoadingParents));

  const getNoStudentsMessage = () => {
    if (authRole === 'siswa') return "Tidak ada siswa lain di kelas Anda.";
    return "Tidak ada data murid untuk ditampilkan. Klik \"Tambah Murid\" untuk membuat data baru.";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">{pageTitle}</h1>
        <p className="text-muted-foreground">{pageDescription}</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Users className="h-6 w-6 text-primary" />
            <div className="flex flex-col items-start sm:flex-row sm:items-baseline sm:gap-x-1.5">
               <span className={cn(isMobile && "block")}>Daftar Murid</span>
              {!isLoadingStudents && (
                <span className={cn("text-base font-normal text-muted-foreground", isMobile ? "text-xs" : "sm:text-xl sm:font-semibold sm:text-foreground")}>
                  {`(${displayedStudents.length} siswa)`}
                </span>
              )}
              {isLoadingStudents && (
                <span className={cn("text-base font-normal text-muted-foreground", isMobile ? "text-xs" : "")}>
                  (Memuat...)
                </span>
              )}
            </div>
          </CardTitle>
          { (authRole === 'admin' || authRole === 'guru') && ( 
            <Dialog 
              open={isAddStudentDialogOpen} 
              onOpenChange={(isOpen) => {
                setIsAddStudentDialogOpen(isOpen);
                if (!isOpen) {
                  addStudentForm.reset({ name: "", nis: "", email: "", classId: undefined, dateOfBirth: undefined, gender: undefined, address: "", linkedParentId: undefined, attendanceNumber: undefined });
                  addStudentForm.clearErrors();
                } else {
                   if ((allClasses.length === 0 && !isLoadingClasses) || (allParents.length === 0 && !isLoadingParents)) fetchPageInitialData();
                }
              }}
            >
              <DialogTrigger asChild>
                 <Button size="sm" disabled={(authRole === 'admin' || authRole === 'guru') && !allClasses.length && !isLoadingClasses && !isLoadingParents}>
                  <PlusCircle className="mr-2 h-4 w-4" /> {isMobile ? 'Tambah' : 'Tambah Murid'}
                </Button>
              </DialogTrigger>
              <DialogContent className="flex flex-col max-h-[90vh] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Tambah Murid Baru</DialogTitle>
                  <DialogDescription>
                    Isi detail murid untuk menambahkan data baru. Ini akan membuat profil di daftar murid.
                  </DialogDescription>
                </DialogHeader>
                <form 
                  id="addStudentDialogForm"
                  onSubmit={addStudentForm.handleSubmit(handleAddStudentSubmit)} 
                  className="flex flex-col overflow-hidden flex-1"
                >
                  <div className="space-y-4 py-4 pr-2 overflow-y-auto flex-1">
                    {renderStudentFormFields(addStudentForm, 'add')}
                  </div>
                  <DialogFooter className="pt-4 border-t mt-auto">
                    <DialogClose asChild>
                       <Button type="button" variant="outline">Batal</Button>
                    </DialogClose>
                    <Button form="addStudentDialogForm" type="submit" disabled={addStudentForm.formState.isSubmitting || isLoadingClasses || isLoadingParents}>
                      {(addStudentForm.formState.isSubmitting || isLoadingClasses || isLoadingParents) && <LottieLoader width={16} height={16} className="mr-2" />}
                      {(addStudentForm.formState.isSubmitting || isLoadingClasses || isLoadingParents) ? "Menyimpan..." : "Simpan Murid"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {(authRole === 'admin' || authRole === 'guru') && (
            <div className="my-4 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, NIS, atau email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-full"
                />
              </div>
              {showClassFilter && (
                <Select
                  value={selectedClassFilter}
                  onValueChange={setSelectedClassFilter}
                  disabled={isLoadingClasses}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <FilterIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Filter per Kelas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Kelas</SelectItem>
                    {allClasses.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {isLoadingCombined ? (
             <div className="space-y-2 mt-4">
                {[...Array(ITEMS_PER_PAGE)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
             </div>
          ) : currentTableData.length > 0 ? (
            <div className="overflow-x-auto">
              <Table className={cn(isMobile && "table-fixed w-full")}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={cn(isMobile ? "w-10 px-2 text-center" : "w-[50px]")}>No.</TableHead>
                    <TableHead className={cn(isMobile ? "px-2" : "")}>Nama</TableHead>
                    {(authRole === 'admin' || authRole === 'guru') && (
                      <>
                        {!isMobile && <TableHead>NIS</TableHead>}
                        {!isMobile && <TableHead>Email</TableHead>}
                      </>
                    )}
                    {authRole === 'siswa' && <TableHead className={cn(isMobile && "px-2")}>No. Absen</TableHead>}
                     <TableHead className={cn(isMobile ? "px-2" : "")}>Kelas</TableHead>
                    {(authRole === 'admin' || authRole === 'guru') && (
                      <>
                        {!isMobile && <TableHead>Gender</TableHead>}
                        <TableHead className={cn(isMobile ? "text-right px-1 w-12" : "text-center w-16")}>Aksi</TableHead>
                      </>
                    )}
                    {authRole === 'siswa' && <TableHead className={cn("text-right px-1 w-12", isMobile && "w-auto text-left")}>Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentTableData.map((student, index) => (
                    <TableRow key={student.id}>
                      <TableCell className={cn(isMobile ? "px-2 text-center" : "")}>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                      <TableCell className={cn("font-medium truncate", isMobile ? "px-2" : "")} title={student.name}>{student.name}</TableCell>
                      
                      {(authRole === 'admin' || authRole === 'guru') && (
                        <>
                          {!isMobile && <TableCell className="truncate" title={student.nis}>{student.nis || "-"}</TableCell>}
                          {!isMobile && <TableCell className="truncate" title={student.email}>{student.email || "-"}</TableCell>}
                        </>
                      )}

                      {authRole === 'siswa' && (
                        <TableCell className={cn(isMobile && "px-2")}>{student.attendanceNumber ?? "-"}</TableCell>
                      )}

                      <TableCell className={cn("truncate", isMobile ? "px-2" : "")} title={student.className || student.classId}>{student.className || student.classId}</TableCell>
                      
                      {(authRole === 'admin' || authRole === 'guru') && !isMobile && (
                        <TableCell>
                          {student.gender === "laki-laki" ? (
                            <Image src="/avatars/laki-laki.png" alt="Laki-laki" width={24} height={24} className="rounded-full" data-ai-hint="male avatar" />
                          ) : student.gender === "perempuan" ? (
                            <Image src="/avatars/perempuan.png" alt="Perempuan" width={24} height={24} className="rounded-full" data-ai-hint="female avatar" />
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      )}

                      {(authRole === 'admin' || authRole === 'guru') ? (
                        <TableCell className={cn(isMobile ? "text-right px-1" : "text-center")}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Opsi untuk ${student.name}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openViewStudentDialog(student)}>
                                <Eye className="mr-2 h-4 w-4" />
                                Lihat Detail
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(student)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem
                                    onSelect={(e) => { e.preventDefault(); openDeleteDialog(student); }}
                                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Hapus
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                {selectedStudent && selectedStudent.id === student.id && ( 
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Tindakan ini akan menghapus data murid <span className="font-semibold"> {selectedStudent?.name} </span> (NIS: {selectedStudent?.nis || 'N/A'}). Data yang dihapus tidak dapat dikembalikan.
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
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      ) : authRole === 'siswa' ? (
                        <TableCell className={cn("text-right", isMobile ? "px-1 text-left" : "")}>
                           <Button variant="outline" size={isMobile ? "xs" : "icon"} onClick={() => openViewStudentDialog(student)} aria-label={`Lihat detail ${student.name}`}>
                                <Eye className="h-4 w-4" />
                                {isMobile && <span className="ml-1">Detail</span>}
                           </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
            </div>
          ) : (
             <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
              {searchTerm || selectedClassFilter !== "all"
                ? "Tidak ada murid yang cocok dengan filter atau pencarian Anda."
                : getNoStudentsMessage()
              }
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isViewStudentDialogOpen} onOpenChange={(isOpen) => {
          setIsViewStudentDialogOpen(isOpen);
          if (!isOpen) { setSelectedStudentForView(null); }
      }}>
        <DialogContent className="flex flex-col max-h-[90vh] sm:max-w-xl"> 
            <DialogHeader>
                <DialogTitle>Detail Murid: {selectedStudentForView?.name}</DialogTitle>
                <DialogDescription>Informasi lengkap mengenai murid.</DialogDescription>
            </DialogHeader>
            {selectedStudentForView && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 py-4 text-sm overflow-y-auto flex-1 pr-2">
                    <div><Label className="text-muted-foreground">Nama Lengkap:</Label><p className="font-medium">{selectedStudentForView.name}</p></div>
                    <div><Label className="text-muted-foreground">NIS:</Label><p className="font-medium">{selectedStudentForView.nis || "-"}</p></div>

                    <div><Label className="text-muted-foreground">Email:</Label><p className="font-medium">{selectedStudentForView.email || "-"}</p></div>
                    <div><Label className="text-muted-foreground">Kelas:</Label><p className="font-medium">{selectedStudentForView.className || selectedStudentForView.classId}</p></div>
                    
                    <div>
                        <Label className="text-muted-foreground">Tanggal Lahir:</Label>
                        <p className="font-medium">
                            {selectedStudentForView.dateOfBirth ? format(selectedStudentForView.dateOfBirth.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale }) : "-"}
                        </p>
                    </div>
                    <div><Label className="text-muted-foreground">Jenis Kelamin:</Label><p className="font-medium capitalize">{selectedStudentForView.gender || "-"}</p></div>
                    
                    <div className="sm:col-span-2"><Label className="text-muted-foreground">Alamat:</Label><p className="font-medium whitespace-pre-line">{selectedStudentForView.address || "-"}</p></div>
                    
                    <div>
                        <Label className="text-muted-foreground">Nomor Absen:</Label>
                        <p className="font-medium">{selectedStudentForView.attendanceNumber != null ? selectedStudentForView.attendanceNumber : "-"}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Orang Tua Terhubung:</Label>
                        <p className="font-medium">
                            {selectedStudentForView.parentName || (selectedStudentForView.linkedParentId ? `${selectedStudentForView.linkedParentId} (Nama tidak tersedia)` : "-")}
                        </p>
                    </div>
                    
                    {selectedStudentForView.createdAt && (
                       <div className="sm:col-span-2">
                          <Label className="text-muted-foreground">Tanggal Daftar Profil:</Label>
                          <p className="font-medium">{format(selectedStudentForView.createdAt.toDate(), "dd MMMM yyyy, HH:mm", { locale: indonesiaLocale })}</p>
                       </div>
                    )}
                </div>
            )}
            <DialogFooter className="pt-4 border-t mt-auto">
                <DialogClose asChild><Button type="button" variant="outline">Tutup</Button></DialogClose>
            </DialogFooter>
        </DialogContent>
      </Dialog>


      { (authRole === 'admin' || authRole === 'guru') && ( 
        <Dialog open={isEditStudentDialogOpen} onOpenChange={(isOpen) => {
            setIsEditStudentDialogOpen(isOpen);
            if (!isOpen) {
              setSelectedStudent(null);
              editStudentForm.clearErrors();
            }
        }}>
          <DialogContent className="flex flex-col max-h-[90vh] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Data Murid</DialogTitle>
              <DialogDescription>
                Perbarui detail data murid.
              </DialogDescription>
            </DialogHeader>
            {selectedStudent && (
              <form 
                id="editStudentDialogForm"
                onSubmit={editStudentForm.handleSubmit(handleEditStudentSubmit)} 
                className="flex flex-col overflow-hidden flex-1"
              >
                <Input type="hidden" {...editStudentForm.register("id")} />
                <div className="space-y-4 py-4 pr-2 overflow-y-auto flex-1">
                    {renderStudentFormFields(editStudentForm, 'edit')}
                </div>
                <DialogFooter className="pt-4 border-t mt-auto">
                   <DialogClose asChild>
                      <Button type="button" variant="outline" onClick={() => { setIsEditStudentDialogOpen(false); setSelectedStudent(null); }}>Batal</Button>
                   </DialogClose>
                  <Button form="editStudentDialogForm" type="submit" disabled={editStudentForm.formState.isSubmitting || isLoadingClasses || isLoadingParents}>
                    {(editStudentForm.formState.isSubmitting || isLoadingClasses || isLoadingParents) && <LottieLoader width={16} height={16} className="mr-2" />}
                    {(editStudentForm.formState.isSubmitting || isLoadingClasses || isLoadingParents) ? "Menyimpan..." : "Simpan Perubahan"}
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
    

    

    


