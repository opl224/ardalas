
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
import { Users, PlusCircle, Edit, Trash2, Search, Filter as FilterIcon, MoreVertical, Eye, CalendarIcon, FileDown } from "lucide-react";
import Image from "next/image";
import { useState, useEffect, useMemo, type ReactNode, useCallback } from "react";
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
import { id as indonesiaLocale } from 'date-fns/locale';
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';


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
  agama?: string;
  address?: string;
  linkedParentId?: string;
  parentName?: string;
  attendanceNumber?: number;
  createdAt?: Timestamp;
}

const GENDERS = ["laki-laki", "perempuan"] as const;
const AGAMA_OPTIONS = ["Islam", "Kristen Protestan", "Katolik", "Hindu", "Buddha", "Khonghucu", "Lainnya"] as const;

const baseStudentFormSchema = z.object({
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }),
  nis: z.string().min(5, { message: "NIS minimal 5 karakter." }),
  email: z.string().email({ message: "Format email tidak valid." }).optional().or(z.literal("")),
  classId: z.string({ required_error: "Pilih kelas." }),
  dateOfBirth: z.date().optional(),
  gender: z.enum(GENDERS).optional(),
  agama: z.string().optional(),
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
  const [allClassesForFilter, setAllClassesForFilter] = useState<ClassMin[]>([]); // Used for filter dropdown
  const [allParents, setAllParents] = useState<ParentMin[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isLoadingInitialData, setIsLoadingInitialData] = useState(true);
  const [isAddStudentDialogOpen, setIsAddStudentDialogOpen] = useState(false);
  const [isEditStudentDialogOpen, setIsEditStudentDialogOpen] = useState(false);
  const [isViewStudentDialogOpen, setIsViewStudentDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedStudentForView, setSelectedStudentForView] = useState<Student | null>(null);
  const [teacherResponsibleClassIds, setTeacherResponsibleClassIds] = useState<string[] | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

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
      agama: undefined,
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
      agama: undefined,
      address: "",
      linkedParentId: undefined,
      attendanceNumber: undefined,
    }
  });

  const fetchInitialDropdownAndTeacherData = useCallback(async () => {
    if (authLoading) return;
    setIsLoadingInitialData(true);
    try {
      const promises = [];
      if (authRole === 'admin' || authRole === 'guru') {
        const parentsCollectionRef = collection(db, "parents");
        const qParents = query(parentsCollectionRef, orderBy("name", "asc"));
        promises.push(getDocs(qParents));
      } else {
        promises.push(Promise.resolve(null));
      }

      const [parentsSnapshot] = await Promise.all(promises);

      if (parentsSnapshot) {
        setAllParents(parentsSnapshot.docs.map(docSnap => ({ id: docSnap.id, name: docSnap.data().name })));
      }

      if (authRole === 'admin') {
        const classesSnapshot = await getDocs(query(collection(db, "classes"), orderBy("name", "asc")));
        setAllClassesForFilter(classesSnapshot.docs.map(docSnap => ({ id: docSnap.id, name: docSnap.data().name })));
        setTeacherResponsibleClassIds(null); // Admin sees all
      } else if (authRole === 'guru' && authUser?.uid) {
        const teacherProfileQuery = query(collection(db, "teachers"), where("uid", "==", authUser.uid), limit(1));
        const teacherProfileSnapshot = await getDocs(teacherProfileQuery);
        if (!teacherProfileSnapshot.empty) {
          const teacherDocId = teacherProfileSnapshot.docs[0].id;
          const responsibleClassesQuery = query(collection(db, "classes"), where("teacherId", "==", teacherDocId), orderBy("name", "asc"));
          const responsibleClassesSnapshot = await getDocs(responsibleClassesQuery);
          const responsibleClasses = responsibleClassesSnapshot.docs.map(docSnap => ({ id: docSnap.id, name: docSnap.data().name }));
          setAllClassesForFilter(responsibleClasses);
          setTeacherResponsibleClassIds(responsibleClasses.map(c => c.id));
        } else {
          setAllClassesForFilter([]);
          setTeacherResponsibleClassIds([]); // No classes if profile not found
        }
      } else if (authRole === 'siswa') {
        // Siswa might need class list if they could filter, but not for current design
        const classesSnapshot = await getDocs(query(collection(db, "classes"), orderBy("name", "asc")));
        setAllClassesForFilter(classesSnapshot.docs.map(docSnap => ({ id: docSnap.id, name: docSnap.data().name })));
        setTeacherResponsibleClassIds(null);
      } else {
        setAllClassesForFilter([]);
        setTeacherResponsibleClassIds(null);
      }
    } catch (error) {
      console.error("Error fetching initial dropdown/teacher data: ", error);
      toast({ title: "Gagal Memuat Data Pendukung", variant: "destructive" });
    } finally {
      setIsLoadingInitialData(false);
    }
  }, [authRole, authUser, authLoading, toast]);


  const fetchStudents = useCallback(async () => {
    if (authLoading || isLoadingInitialData) return; // Wait for initial data if needed
    setIsLoadingStudents(true);
    try {
      const usersCollectionRef = collection(db, "users");
      let q;

      if (authRole === 'siswa' && authUser?.classId) {
        q = query(usersCollectionRef, where("role", "==", "siswa"), where("classId", "==", authUser.classId), orderBy("attendanceNumber", "asc"), orderBy("name", "asc"));
      } else if (authRole === 'admin') {
        if (selectedClassFilter === "all") {
          q = query(usersCollectionRef, where("role", "==", "siswa"), orderBy("name", "asc"));
        } else {
          q = query(usersCollectionRef, where("role", "==", "siswa"), where("classId", "==", selectedClassFilter), orderBy("name", "asc"));
        }
      } else if (authRole === 'guru') {
        if (teacherResponsibleClassIds === null) { // Still loading teacher classes
          setIsLoadingStudents(false);
          return;
        }
        if (teacherResponsibleClassIds.length === 0) {
          setStudents([]);
          setIsLoadingStudents(false);
          return;
        }
        const classIdsToQuery = selectedClassFilter === "all" ? teacherResponsibleClassIds : [selectedClassFilter].filter(id => teacherResponsibleClassIds.includes(id));

        if (classIdsToQuery.length === 0 && selectedClassFilter !== "all") { // Guru selected a class they are not responsible for
            setStudents([]);
            setIsLoadingStudents(false);
            return;
        }
        if (classIdsToQuery.length === 0 && selectedClassFilter === "all" && teacherResponsibleClassIds.length > 0) {
            // This case should not happen if teacherResponsibleClassIds are correctly populated
            setStudents([]);
            setIsLoadingStudents(false);
            return;
        }
         if (classIdsToQuery.length > 0) {
          q = query(usersCollectionRef, where("role", "==", "siswa"), where("classId", "in", classIdsToQuery), orderBy("name", "asc"));
        } else {
          setStudents([]);
          setIsLoadingStudents(false);
          return;
        }

      } else {
        setStudents([]);
        setIsLoadingStudents(false);
        return;
      }

      const querySnapshot = await getDocs(q);
      const finalFetchedStudents = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      } as Student));
      setStudents(finalFetchedStudents);
    } catch (error: any) {
      console.error("Error fetching students: ", error);
      if (error.code === 'failed-precondition' && error.message.includes('query requires an index')) {
         toast({ title: "Indeks Firestore Diperlukan", description: "Operasi ini memerlukan indeks kustom di Firestore. Hubungi administrator.", variant: "destructive", duration: 10000 });
      } else {
        toast({ title: "Gagal Memuat Data Murid", variant: "destructive" });
      }
      setStudents([]);
    } finally {
      setIsLoadingStudents(false);
    }
  }, [authRole, authUser, authLoading, isLoadingInitialData, teacherResponsibleClassIds, selectedClassFilter, toast]);

  useEffect(() => {
    fetchInitialDropdownAndTeacherData();
  }, [fetchInitialDropdownAndTeacherData]);

  useEffect(() => {
    if (!isLoadingInitialData) {
        fetchStudents();
    }
  }, [fetchStudents, isLoadingInitialData, selectedClassFilter]);


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
        agama: selectedStudent.agama || "",
        address: selectedStudent.address || "",
        linkedParentId: selectedStudent.linkedParentId || undefined,
        attendanceNumber: selectedStudent.attendanceNumber ?? undefined,
      });
    }
  }, [selectedStudent, isEditStudentDialogOpen, editStudentForm]);

  const displayedStudents = useMemo(() => {
    let filtered = students;
    // Filtering by selectedClassFilter is handled in fetchStudents for admin/guru
    if ((authRole === 'admin' || authRole === 'guru') && searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(student =>
        student.name.toLowerCase().includes(lowerSearchTerm) ||
        (student.nis && student.nis.toLowerCase().includes(lowerSearchTerm)) ||
        (student.email && student.email.toLowerCase().includes(lowerSearchTerm))
      );
    }
    return filtered.sort((a, b) => {
      if (a.attendanceNumber != null && b.attendanceNumber != null) {
        return a.attendanceNumber - b.attendanceNumber;
      }
      if (a.attendanceNumber != null) return -1;
      if (b.attendanceNumber != null) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [students, searchTerm, authRole]);

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

    const selectedClassObj = allClassesForFilter.find(c => c.id === data.classId);
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
        agama: data.agama || null,
        address: data.address || null,
        linkedParentId: data.linkedParentId || null,
        parentName: selectedParent?.name || null,
        attendanceNumber: data.attendanceNumber != null && !isNaN(data.attendanceNumber) ? data.attendanceNumber : null,
      };

      await addDoc(collection(db, "users"), studentDataForUsersCollection);
      toast({ title: "Murid Ditambahkan ke Profil", description: `${data.name} berhasil ditambahkan ke daftar profil.` });
      setIsAddStudentDialogOpen(false);
      addStudentForm.reset({ name: "", nis: "", email: "", classId: undefined, dateOfBirth: undefined, gender: undefined, agama: undefined, address: "", linkedParentId: undefined, attendanceNumber: undefined });
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
    const selectedClass = allClassesForFilter.find(c => c.id === data.classId);
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
        agama: data.agama || null,
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

  const handleExport = async (formatType: 'pdf' | 'xlsx') => {
    if (displayedStudents.length === 0) {
      toast({ title: "Tidak ada data untuk diekspor", variant: "info" });
      return;
    }
    setIsExporting(true);

    const fileName = `Data_Siswa_${selectedClassFilter !== 'all' ? allClassesForFilter.find(c => c.id === selectedClassFilter)?.name?.replace(/\s+/g, '_') : 'Semua_Kelas'}_${format(new Date(), "yyyyMMdd")}`;
    const title = `Data Siswa - ${selectedClassFilter !== 'all' ? `Kelas ${allClassesForFilter.find(c => c.id === selectedClassFilter)?.name}` : 'Semua Kelas'}`;

    const dataToExport = displayedStudents.map((student, index) => ({
      "No.": index + 1,
      "Nama Siswa": student.name,
      "NIS": student.nis || '-',
      "Email": student.email || '-',
      "Kelas": student.className || '-',
      "Orang Tua": student.parentName || '-',
      "No. Absen": student.attendanceNumber ?? '-',
    }));

    try {
      if (formatType === 'pdf') {
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text(title, 14, 15);
        autoTable(doc, {
          startY: 22,
          head: [Object.keys(dataToExport[0])],
          body: dataToExport.map(Object.values),
          theme: 'grid',
        });
        doc.save(`${fileName}.pdf`);
      } else if (formatType === 'xlsx') {
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data Siswa");
        XLSX.writeFile(workbook, `${fileName}.xlsx`);
      }
      toast({ title: `Ekspor ${formatType.toUpperCase()} Berhasil`, description: `${fileName}.${formatType} telah diunduh.` });
    } catch (error) {
        console.error("Export error:", error);
        toast({ title: "Gagal Mengekspor Data", variant: "destructive" });
    } finally {
        setIsExporting(false);
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
    if ((allClassesForFilter.length === 0 && !isLoadingInitialData) || (allParents.length === 0 && !isLoadingInitialData)) {
      fetchInitialDropdownAndTeacherData();
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
              disabled={isLoadingInitialData}
            >
              <SelectTrigger id={`${formType}-student-classId`} className="mt-1">
                <SelectValue placeholder={isLoadingInitialData ? "Memuat kelas..." : "Pilih kelas"} />
              </SelectTrigger>
              <SelectContent>
                {isLoadingInitialData ? (
                  <SelectItem value="loading" disabled>Memuat kelas...</SelectItem>
                ) : allClassesForFilter.length === 0 ? (
                  <SelectItem value="no-classes" disabled>Tidak ada kelas tersedia</SelectItem>
                ) : (
                  allClassesForFilter.map((classItem) => (
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
                  date={field.value ? { from: field.value, to: field.value } : undefined}
                  onDateSelect={(range) => field.onChange(range?.from)}
                  numberOfMonths={1}
                  closeOnSelect={true}
                  yearsRange={50}
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
            <Label htmlFor={`${formType}-agama`}>Agama (Opsional)</Label>
            <Controller
              name="agama"
              control={formInstance.control}
              render={({ field }) => (
                <Select
                  onValueChange={(value) => field.onChange(value === "_NONE_" ? undefined : value)}
                  value={field.value || "_NONE_"}
                >
                  <SelectTrigger id={`${formType}-agama`} className="mt-1">
                    <SelectValue placeholder="Pilih agama" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_NONE_">Tidak ditentukan</SelectItem>
                    {AGAMA_OPTIONS.map((agama) => (
                      <SelectItem key={agama} value={agama}>
                        {agama}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
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
                  disabled={isLoadingInitialData}
                >
                  <SelectTrigger id={`${formType}-student-linkedParentId`} className="mt-1">
                    <SelectValue placeholder={isLoadingInitialData ? "Memuat orang tua..." : "Pilih orang tua"} />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingInitialData ? (
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
      ? `Daftar teman sekelas.`
      : "Informasi murid.");

  const showClassFilter = ((authRole === 'admin' || authRole === 'guru') && allClassesForFilter.length > 0);
  const isLoadingCombined = isLoadingStudents || authLoading || isLoadingInitialData;

  const getNoStudentsMessage = () => {
    if (authRole === 'siswa') return "Tidak ada siswa lain di kelas anda.";
    if (authRole === 'guru' && teacherResponsibleClassIds?.length === 0) return "Anda tidak ditugaskan sebagai wali kelas untuk kelas manapun, atau kelas yang anda asuh belum memiliki murid.";
    return "Tidak ada data murid untuk ditampilkan. Klik \"Tambah Murid\" untuk membuat data baru.";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">{pageTitle}</h1>
        <p className="text-muted-foreground">{pageDescription}</p>
      </div>
      <Dialog open={isAddStudentDialogOpen} onOpenChange={(isOpen) => {
        setIsAddStudentDialogOpen(isOpen);
        if (!isOpen) { addStudentForm.reset({ name: "", nis: "", email: "", classId: undefined, dateOfBirth: undefined, gender: undefined, agama: undefined, address: "", linkedParentId: undefined, attendanceNumber: undefined }); addStudentForm.clearErrors(); }
      }}>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardHeader className="pb-4">
              {/* Desktop Header */}
              <div className="hidden md:flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Users className="h-6 w-6 text-primary" />
                  <span>Daftar Murid ({displayedStudents.length})</span>
                </CardTitle>
                {(authRole === 'admin' || authRole === 'guru') && (
                  <div className="flex items-center gap-2">
                    <DialogTrigger asChild>
                      <Button size="sm"><PlusCircle className="mr-2 h-4 w-4" />Tambah Murid</Button>
                    </DialogTrigger>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" disabled={isExporting}>
                          {isExporting ? <LottieLoader width={16} height={16} /> : <FileDown className="h-4 w-4" />}
                          <span className="ml-2">{isExporting ? 'Mengekspor...' : 'Ekspor'}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleExport('xlsx')} disabled={isExporting}>Excel (.xlsx)</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExport('pdf')} disabled={isExporting}>PDF (.pdf)</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
              {/* Mobile Header */}
              <div className="md:hidden flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Users className="h-6 w-6 text-primary" />
                    <span>Daftar Murid ({displayedStudents.length})</span>
                  </CardTitle>
                  {(authRole === 'admin' || authRole === 'guru') && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" disabled={isExporting}>
                          {isExporting ? <LottieLoader width={16} height={16} /> : <FileDown className="h-4 w-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleExport('xlsx')} disabled={isExporting}>Excel (.xlsx)</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExport('pdf')} disabled={isExporting}>PDF (.pdf)</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {(authRole === 'admin' || authRole === 'guru') && (
                  <DialogTrigger asChild>
                    <Button size="sm" className="w-full"><PlusCircle className="mr-2 h-4 w-4" />Tambah Murid</Button>
                  </DialogTrigger>
                )}
              </div>
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
                    disabled={isLoadingInitialData || allClassesForFilter.length === 0}
                  >
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <FilterIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                      <SelectValue placeholder="Filter per Kelas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Kelas</SelectItem>
                      {allClassesForFilter.map((cls) => (
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
                <Table className="w-full table-fixed">
                  <TableHeader>
                    <TableRow>
                      {isMobile && (authRole === 'admin' || authRole === 'guru') ? (
                        <>
                          <TableHead className="w-10 px-2 text-center">No.</TableHead>
                          <TableHead className="px-2">Nama</TableHead>
                          <TableHead className="px-2">Kelas</TableHead>
                          <TableHead className="text-right w-12 px-1">Aksi</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead className="w-[50px]">No.</TableHead>
                          <TableHead className={cn((authRole === 'admin' || authRole === 'guru') ? "w-1/4" : "w-1/2")}>Nama</TableHead>
                          {(authRole === 'admin' || authRole === 'guru') && (
                            <>
                              <TableHead className="w-1/5">NIS</TableHead>
                              <TableHead className="w-1/4">Email</TableHead>
                            </>
                          )}
                          {authRole === 'siswa' && <TableHead className="w-2/12">No. Absen</TableHead>}
                          <TableHead className={cn("w-1/5", authRole === 'siswa' && "w-3/12")}>Kelas</TableHead>
                          {(authRole === 'admin' || authRole === 'guru') && (
                            <>
                              <TableHead className="w-[80px]">Gender</TableHead>
                              <TableHead className="text-center w-16">Aksi</TableHead>
                            </>
                          )}
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentTableData.map((student, index) => (
                      <TableRow key={student.id}>
                        {isMobile && (authRole === 'admin' || authRole === 'guru') ? (
                          <>
                            <TableCell className="text-center px-2">{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                            <TableCell className="font-medium truncate px-2" title={student.name}>{student.name}</TableCell>
                            <TableCell className="truncate px-2" title={student.className || student.classId}>{student.className || student.classId}</TableCell>
                            <TableCell className="text-right px-1">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Opsi untuk ${student.name}`}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => openViewStudentDialog(student)}><Eye className="mr-2 h-4 w-4" />Lihat Detail</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openEditDialog(student)}><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild><DropdownMenuItem onSelect={(e) => { e.preventDefault(); openDeleteDialog(student); }} className="text-destructive focus:bg-destructive/10 focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Hapus</DropdownMenuItem></AlertDialogTrigger>
                                      {selectedStudent && selectedStudent.id === student.id && (<AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Apakah Kamu Yakin?</AlertDialogTitle><AlertDialogDescription>Tindakan ini akan menghapus data murid <span className="font-semibold"> {selectedStudent?.name} </span> (NIS: {selectedStudent?.nis || 'N/A'}). Data yang dihapus tidak dapat dikembalikan.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setSelectedStudent(null)}>Batal</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteStudent(selectedStudent.id, selectedStudent.name)}>Ya, Hapus Data</AlertDialogAction></AlertDialogFooter></AlertDialogContent>)}
                                    </AlertDialog>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                            <TableCell className="font-medium truncate" title={student.name}>{student.name}</TableCell>
                            {(authRole === 'admin' || authRole === 'guru') && (
                              <>
                                <TableCell className="truncate" title={student.nis}>{student.nis || "-"}</TableCell>
                                <TableCell className="truncate" title={student.email}>{student.email || "-"}</TableCell>
                              </>
                            )}
                            {authRole === 'siswa' && <TableCell>{student.attendanceNumber ?? "-"}</TableCell>}
                            <TableCell className="truncate" title={student.className || student.classId}>{student.className || student.classId}</TableCell>
                            {(authRole === 'admin' || authRole === 'guru') && (
                              <>
                                <TableCell>
                                  {student.gender === "laki-laki" ? (
                                    <Image src="/avatars/laki-laki.png" alt="Laki-laki" width={24} height={24} className="rounded-full" data-ai-hint="male avatar" />
                                  ) : student.gender === "perempuan" ? (
                                    <Image src="/avatars/perempuan.png" alt="Perempuan" width={24} height={24} className="rounded-full" data-ai-hint="female avatar" />
                                  ) : (
                                    "-"
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Opsi untuk ${student.name}`}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => openViewStudentDialog(student)}><Eye className="mr-2 h-4 w-4" />Lihat Detail</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => openEditDialog(student)}><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild><DropdownMenuItem onSelect={(e) => { e.preventDefault(); openDeleteDialog(student); }} className="text-destructive focus:bg-destructive/10 focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Hapus</DropdownMenuItem></AlertDialogTrigger>
                                        {selectedStudent && selectedStudent.id === student.id && (<AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Apakah Kamu Yakin?</AlertDialogTitle><AlertDialogDescription>Tindakan ini akan menghapus data murid <span className="font-semibold"> {selectedStudent?.name} </span> (NIS: {selectedStudent?.nis || 'N/A'}). Data yang dihapus tidak dapat dikembalikan.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setSelectedStudent(null)}>Batal</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteStudent(selectedStudent.id, selectedStudent.name)}>Ya, Hapus Data</AlertDialogAction></AlertDialogFooter></AlertDialogContent>)}
                                      </AlertDialog>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </>
                            )}
                          </>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {totalPages > 1 && (
                  <Pagination className="mt-6"><PaginationContent><PaginationItem><PaginationPrevious onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} aria-disabled={currentPage === 1} className={cn("cursor-pointer", currentPage === 1 ? "pointer-events-none opacity-50" : undefined)}/></PaginationItem>{renderPageNumbers()}<PaginationItem><PaginationNext onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} aria-disabled={currentPage === totalPages} className={cn("cursor-pointer", currentPage === totalPages ? "pointer-events-none opacity-50" : undefined)}/></PaginationItem></PaginationContent></Pagination>
                )}
              </div>
            ) : (
              <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
                {searchTerm || selectedClassFilter !== "all"
                  ? "Tidak ada murid yang cocok dengan filter atau pencarian."
                  : getNoStudentsMessage()
                }
              </div>
            )}
          </CardContent>
        </Card>
        <DialogContent className="flex flex-col max-h-[90vh] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Murid Baru</DialogTitle>
            <DialogDescription>Buat profil murid baru. Ini belum membuat akun login.</DialogDescription>
          </DialogHeader>
          <form id="addStudentDialogForm" onSubmit={addStudentForm.handleSubmit(handleAddStudentSubmit)} className="flex flex-col overflow-hidden flex-1">
            <div className="space-y-4 py-4 pr-2 overflow-y-auto flex-1">{renderStudentFormFields(addStudentForm, 'add')}</div>
            <DialogFooter className="pt-4 border-t mt-auto">
              <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
              <Button type="submit" form="addStudentDialogForm" disabled={addStudentForm.formState.isSubmitting || isLoadingInitialData}>
                {(addStudentForm.formState.isSubmitting || isLoadingInitialData) && <LottieLoader width={16} height={16} className="mr-2" />}
                {(addStudentForm.formState.isSubmitting || isLoadingInitialData) ? "Menyimpan..." : "Simpan Data"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isViewStudentDialogOpen} onOpenChange={(isOpen) => {
          setIsViewStudentDialogOpen(isOpen);
          if (!isOpen) { setSelectedStudentForView(null); }
      }}>
        <DialogContent className="flex flex-col max-h-[90vh] sm:max-w-xl">
            <DialogHeader><DialogTitle>Detail Murid: {selectedStudentForView?.name}</DialogTitle><DialogDescription>Informasi lengkap mengenai murid.</DialogDescription></DialogHeader>
            {selectedStudentForView && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 py-4 text-sm overflow-y-auto flex-1 pr-2">
                    <div><Label className="text-muted-foreground">Nama Lengkap:</Label><p className="font-medium">{selectedStudentForView.name}</p></div>
                    <div><Label className="text-muted-foreground">NIS:</Label><p className="font-medium">{selectedStudentForView.nis || "-"}</p></div>
                    <div><Label className="text-muted-foreground">Email:</Label><p className="font-medium">{selectedStudentForView.email || "-"}</p></div>
                    <div><Label className="text-muted-foreground">Kelas:</Label><p className="font-medium">{selectedStudentForView.className || selectedStudentForView.classId}</p></div>
                    <div><Label className="text-muted-foreground">Tanggal Lahir:</Label><p className="font-medium">{selectedStudentForView.dateOfBirth ? format(selectedStudentForView.dateOfBirth.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale }) : "-"}</p></div>
                    <div><Label className="text-muted-foreground">Jenis Kelamin:</Label><p className="font-medium capitalize">{selectedStudentForView.gender || "-"}</p></div>
                    <div><Label className="text-muted-foreground">Agama:</Label><p className="font-medium">{selectedStudentForView.agama || "-"}</p></div>
                    <div className="sm:col-span-2"><Label className="text-muted-foreground">Alamat:</Label><p className="font-medium whitespace-pre-line">{selectedStudentForView.address || "-"}</p></div>
                    <div><Label className="text-muted-foreground">Nomor Absen:</Label><p className="font-medium">{selectedStudentForView.attendanceNumber != null ? selectedStudentForView.attendanceNumber : "-"}</p></div>
                    <div><Label className="text-muted-foreground">Orang Tua Terhubung:</Label><p className="font-medium">{selectedStudentForView.parentName || (selectedStudentForView.linkedParentId ? `${selectedStudentForView.linkedParentId} (Nama tidak tersedia)` : "-")}</p></div>
                    {selectedStudentForView.createdAt && (<div className="sm:col-span-2"><Label className="text-muted-foreground">Tanggal Daftar Profil:</Label><p className="font-medium">{format(selectedStudentForView.createdAt.toDate(), "dd MMMM yyyy, HH:mm", { locale: indonesiaLocale })}</p></div>)}
                </div>
            )}
            <DialogFooter className="pt-4 border-t mt-auto"><DialogClose asChild><Button type="button" variant="outline">Tutup</Button></DialogClose></DialogFooter>
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
            <DialogHeader><DialogTitle>Edit Data Murid</DialogTitle><DialogDescription>Perbarui detail data murid.</DialogDescription></DialogHeader>
            {selectedStudent && (
              <form id="editStudentDialogForm" onSubmit={editStudentForm.handleSubmit(handleEditStudentSubmit)} className="flex flex-col overflow-hidden flex-1">
                <Input type="hidden" {...editStudentForm.register("id")} />
                <div className="space-y-4 py-4 pr-2 overflow-y-auto flex-1">{renderStudentFormFields(editStudentForm, 'edit')}</div>
                <DialogFooter className="pt-4 border-t mt-auto">
                   <DialogClose asChild><Button type="button" variant="outline" onClick={() => { setIsEditStudentDialogOpen(false); setSelectedStudent(null); }}>Batal</Button></DialogClose>
                  <Button form="editStudentDialogForm" type="submit" disabled={editStudentForm.formState.isSubmitting || isLoadingInitialData}>
                    {(editStudentForm.formState.isSubmitting || isLoadingInitialData) && <LottieLoader width={16} height={16} className="mr-2" />}
                    {(editStudentForm.formState.isSubmitting || isLoadingInitialData) ? "Menyimpan..." : "Simpan Perubahan"}
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
