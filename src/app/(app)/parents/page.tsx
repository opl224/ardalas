
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
import { UserCircle, PlusCircle, Edit, Trash2, Search, Filter as FilterIcon, LinkIcon as UidLinkIcon, MoreVertical, Eye, FileDown } from "lucide-react";
import LottieLoader from "@/components/ui/LottieLoader";
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
  limit,
  getDoc,
  deleteField,
  writeBatch,
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from 'date-fns';
import { id as indonesiaLocale } from 'date-fns/locale';
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
import { useSidebar } from "@/components/ui/sidebar";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';


interface StudentForDialog {
  id: string; // This is Auth UID of student
  name: string;
  classId?: string;
}

interface AuthUserMin {
  id: string; // This is Auth UID
  name: string;
  email: string;
}

interface ClassMin {
  id: string;
  name: string;
}

interface Parent {
  id: string; // Firestore document ID of the parent profile
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  gender?: "laki-laki" | "perempuan";
  agama?: string;
  studentId: string; // Auth UID of the linked student
  studentName: string; // Denormalized name of the student
  uid?: string; // Auth UID of the parent user (if linked from 'users' collection)
  createdAt?: Timestamp;
}

const GENDERS = ["laki-laki", "perempuan"] as const;
const AGAMA_OPTIONS = ["Islam", "Kristen Protestan", "Katolik", "Hindu", "Buddha", "Khonghucu", "Lainnya"] as const;

const parentFormSchema = z.object({
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }),
  email: z.string().email({ message: "Format email tidak valid." }).optional().or(z.literal("")),
  phone: z.string().min(9, { message: "Nomor telepon minimal 9 digit." }).optional().or(z.literal("")),
  address: z.string().trim().optional(),
  gender: z.enum(GENDERS, { required_error: "Pilih jenis kelamin." }),
  agama: z.string().optional(),
  studentId: z.string({ required_error: "Pilih murid terkait (UID)." }), // Student's Auth UID
  authUserId: z.string().optional(), // Parent's Auth UID
});
type ParentFormValues = z.infer<typeof parentFormSchema>;

const editParentFormSchema = parentFormSchema.extend({
  id: z.string(),
});
type EditParentFormValues = z.infer<typeof editParentFormSchema>;

const NO_AUTH_USER_SELECTED = "_NO_AUTH_USER_";
const ITEMS_PER_PAGE = 10;

export default function ParentsPage() {
  const { user: authUser, role: authRole, loading: authLoading } = useAuth();
  const [parents, setParents] = useState<Parent[]>([]);
  const [studentsForDialog, setStudentsForDialog] = useState<StudentForDialog[]>([]);
  const [authOrangtuaUsers, setAuthOrangtuaUsers] = useState<AuthUserMin[]>([]);
  const [allClassesForFilter, setAllClassesForFilter] = useState<ClassMin[]>([]); // For filter dropdown
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewParentDialogOpen, setIsViewParentDialogOpen] = useState(false);
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null);
  const [selectedParentForView, setSelectedParentForView] = useState<Parent | null>(null);
  const [teacherResponsibleClassIds, setTeacherResponsibleClassIds] = useState<string[] | null>(null);


  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);


  const { toast } = useToast();
  const { isMobile } = useSidebar();

  const addParentForm = useForm<ParentFormValues>({
    resolver: zodResolver(parentFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      address: "",
      gender: undefined,
      agama: undefined,
      studentId: undefined,
      authUserId: undefined,
    },
  });

  const editParentForm = useForm<EditParentFormValues>({
    resolver: zodResolver(editParentFormSchema),
  });

  const fetchPageData = useCallback(async () => {
    if (authLoading) return;
    setIsLoadingData(true);
    try {
      let responsibleClassIdsForGuru: string[] | null = null;
      let classesForDropdown: ClassMin[] = [];
      let fetchedStudentsForDialog: StudentForDialog[] = [];

      if (authRole === 'admin') {
        const classesSnapshot = await getDocs(query(collection(db, "classes"), orderBy("name", "asc")));
        classesForDropdown = classesSnapshot.docs.map(docSnap => ({ id: docSnap.id, name: docSnap.data().name }));
      } else if (authRole === 'guru' && authUser?.uid) {
        const teacherProfileQuery = query(collection(db, "teachers"), where("uid", "==", authUser.uid), limit(1));
        const teacherProfileSnapshot = await getDocs(teacherProfileQuery);
        if (!teacherProfileSnapshot.empty) {
          const teacherDocId = teacherProfileSnapshot.docs[0].id;
          const responsibleClassesQuery = query(collection(db, "classes"), where("teacherId", "==", teacherDocId), orderBy("name", "asc"));
          const responsibleClassesSnapshot = await getDocs(responsibleClassesQuery);
          classesForDropdown = responsibleClassesSnapshot.docs.map(docSnap => ({ id: docSnap.id, name: docSnap.data().name }));
          responsibleClassIdsForGuru = classesForDropdown.map(c => c.id);
        }
      }
      setAllClassesForFilter(classesForDropdown);
      setTeacherResponsibleClassIds(responsibleClassIdsForGuru);

      const usersCollectionRef = collection(db, "users");

      if (authRole === 'admin') {
        const studentsQuery = query(usersCollectionRef, where("role", "==", "siswa"), orderBy("name", "asc"));
        const studentsSnapshot = await getDocs(studentsQuery);
        fetchedStudentsForDialog = studentsSnapshot.docs.map(docSnap => ({
            id: docSnap.id, // Student's document ID is their UID
            name: docSnap.data().name,
            classId: docSnap.data().classId,
        }));
      } else if (authRole === 'guru' && responsibleClassIdsForGuru) {
        if (responsibleClassIdsForGuru.length === 0) {
          fetchedStudentsForDialog = [];
        } else {
          const studentClassIdChunks: string[][] = [];
          for (let i = 0; i < responsibleClassIdsForGuru.length; i += 30) {
              studentClassIdChunks.push(responsibleClassIdsForGuru.slice(i, i + 30));
          }
          const studentPromises = studentClassIdChunks.map(chunk =>
              getDocs(query(usersCollectionRef, where("role", "==", "siswa"), where("classId", "in", chunk), orderBy("name", "asc")))
          );
          const studentSnapshots = await Promise.all(studentPromises);
          fetchedStudentsForDialog = studentSnapshots.flatMap(snap => snap.docs.map(docSnap => ({
              id: docSnap.id, // Student's document ID is their UID
              name: docSnap.data().name,
              classId: docSnap.data().classId,
          })));
        }
      } else {
         const studentsQuery = query(usersCollectionRef, where("role", "==", "siswa"), orderBy("name", "asc"));
         const studentsSnapshot = await getDocs(studentsQuery);
         fetchedStudentsForDialog = studentsSnapshot.docs.map(docSnap => ({
            id: docSnap.id, // Student's document ID is their UID
            name: docSnap.data().name,
            classId: docSnap.data().classId,
        }));
      }
      setStudentsForDialog(fetchedStudentsForDialog);

      const authOrangtuaQueryInstance = query(usersCollectionRef, where("role", "==", "orangtua"), orderBy("name", "asc"));
      const authOrangtuaSnapshot = await getDocs(authOrangtuaQueryInstance);
      setAuthOrangtuaUsers(authOrangtuaSnapshot.docs.map(docSnap => ({
        id: docSnap.id, // Parent's document ID is their UID
        name: docSnap.data().name,
        email: docSnap.data().email,
      })));

      const parentsCollectionRef = collection(db, "parents");
      let parentsQuery;
      if (authRole === 'admin') {
        parentsQuery = query(parentsCollectionRef, orderBy("name", "asc"));
      } else if (authRole === 'guru') {
        const studentUidsOfTeacher = fetchedStudentsForDialog
          .map(s => s.id) // Student's doc ID is their UID
          .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0);

        if (studentUidsOfTeacher.length === 0) {
          setParents([]);
          setIsLoadingData(false);
          return;
        }
        const studentUidChunks: string[][] = [];
        for (let i = 0; i < studentUidsOfTeacher.length; i += 30) {
            studentUidChunks.push(studentUidsOfTeacher.slice(i, i + 30));
        }
        const parentPromises = studentUidChunks.map(chunk => {
            if (chunk.length > 0) { 
                return getDocs(query(parentsCollectionRef, where("studentId", "in", chunk), orderBy("name", "asc")));
            }
            return Promise.resolve({ docs: [] }); 
        });
        const parentSnapshots = await Promise.all(parentPromises);
        const fetchedParentsForGuru = parentSnapshots.flatMap(snap => snap.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data(),
        } as Parent)));
        setParents(fetchedParentsForGuru);
      } else {
        setParents([]); 
      }

      if (parentsQuery) { 
        const parentsSnapshot = await getDocs(parentsQuery);
        setParents(parentsSnapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data(),
        } as Parent)));
      }

    } catch (error: any) {
      console.error("Error fetching page data: ", error);
       if (error.code === 'failed-precondition' && error.message.includes('query requires an index')) {
         toast({ title: "Indeks Firestore Diperlukan", description: "Operasi ini memerlukan indeks kustom di Firestore. Hubungi administrator.", variant: "destructive", duration: 10000 });
      } else {
        toast({ title: "Gagal Memuat Data", variant: "destructive" });
      }
    } finally {
      setIsLoadingData(false);
    }
  }, [authLoading, authRole, authUser, toast]);

  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  useEffect(() => {
    if (selectedParent && isEditDialogOpen) {
      editParentForm.reset({
        id: selectedParent.id,
        name: selectedParent.name,
        email: selectedParent.email || "",
        phone: selectedParent.phone || "",
        address: selectedParent.address || "",
        gender: selectedParent.gender,
        agama: selectedParent.agama || "",
        studentId: selectedParent.studentId, // Student's UID
        authUserId: selectedParent.uid || undefined, // Parent's Auth UID
      });
    }
  }, [selectedParent, isEditDialogOpen, editParentForm]);

  const handleAddParentSubmit: SubmitHandler<ParentFormValues> = async (data) => {
    if (authRole !== 'admin' && authRole !== 'guru') {
      toast({ title: "Aksi Ditolak", description: "Anda tidak memiliki izin untuk menambahkan data.", variant: "destructive" });
      return;
    }
    addParentForm.clearErrors();
    const selectedStudent = studentsForDialog.find(s => s.id === data.studentId); // s.id is student's UID
    if (!selectedStudent) {
      toast({ title: "Error", description: "Murid tidak ditemukan.", variant: "destructive" });
      return;
    }

    try {
      const parentsCollectionRef = collection(db, "parents");
      const newParentDocRef = await addDoc(parentsCollectionRef, {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        gender: data.gender,
        agama: data.agama || null,
        studentId: data.studentId, // Student's UID
        studentName: selectedStudent.name,
        uid: data.authUserId === NO_AUTH_USER_SELECTED ? null : data.authUserId || null, // Parent's Auth UID
        createdAt: serverTimestamp(),
      });

      // Update student's user document
      const studentUserDocRef = doc(db, "users", data.studentId); // Student's UID is the doc ID
      await updateDoc(studentUserDocRef, {
        linkedParentId: newParentDocRef.id, // Firestore Doc ID of the parent profile
        parentName: data.name
      });

      toast({ title: "Data Orang Tua Ditambahkan", description: `${data.name} berhasil ditambahkan.` });
      setIsAddDialogOpen(false);
      addParentForm.reset({ name: "", email: "", phone: "", address: "", gender: undefined, agama: undefined, studentId: undefined, authUserId: undefined });
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
    if (authRole !== 'admin' && authRole !== 'guru') {
      toast({ title: "Aksi Ditolak", description: "Anda tidak memiliki izin untuk mengedit data.", variant: "destructive" });
      return;
    }
    if (!selectedParent) return;
    editParentForm.clearErrors();
    const selectedStudent = studentsForDialog.find(s => s.id === data.studentId); // s.id is student's UID
    if (!selectedStudent) {
      toast({ title: "Error", description: "Murid tidak ditemukan.", variant: "destructive" });
      return;
    }

    const batch = writeBatch(db);

    // Update parent profile document
    const parentDocRef = doc(db, "parents", data.id);
    batch.update(parentDocRef, {
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      gender: data.gender,
      agama: data.agama || null,
      studentId: data.studentId, // Student's UID
      studentName: selectedStudent.name,
      uid: data.authUserId === NO_AUTH_USER_SELECTED ? null : data.authUserId || null, // Parent's Auth UID
    });

    // Handle student link changes
    // If the student link changed from the original selectedParent
    if (selectedParent.studentId && selectedParent.studentId !== data.studentId) {
      // Clear link from old student
      const oldStudentUserDocRef = doc(db, "users", selectedParent.studentId);
      batch.update(oldStudentUserDocRef, {
        linkedParentId: deleteField(),
        parentName: deleteField()
      });
    }

    // Update (or set) link for the new/current student
    const studentUserDocRef = doc(db, "users", data.studentId); // data.studentId is the student's UID
    batch.update(studentUserDocRef, {
      linkedParentId: data.id, // Firestore Doc ID of the parent profile
      parentName: data.name
    });
    
    try {
      await batch.commit();
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
    if (authRole !== 'admin' && authRole !== 'guru') {
      toast({ title: "Aksi Ditolak", description: "Anda tidak memiliki izin untuk menghapus data.", variant: "destructive" });
      return;
    }
    try {
      const parentDocRef = doc(db, "parents", parentId);
      const parentDocSnap = await getDoc(parentDocRef);

      const batch = writeBatch(db);

      if (parentDocSnap.exists()) {
          const parentData = parentDocSnap.data();
          if (parentData.studentId) { // studentId is the student's UID
              const studentUserDocRef = doc(db, "users", parentData.studentId);
              batch.update(studentUserDocRef, {
                  linkedParentId: deleteField(), 
                  parentName: deleteField()    
              });
          }
      }
      batch.delete(parentDocRef);
      await batch.commit();
      
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

  const openViewDialog = (parent: Parent) => {
    setSelectedParentForView(parent);
    setIsViewParentDialogOpen(true);
  };

  const openEditDialog = (parent: Parent) => {
    if (authRole !== 'admin' && authRole !== 'guru') {
      toast({ title: "Aksi Ditolak", description: "Anda tidak memiliki izin untuk mengedit data.", variant: "destructive" });
      return;
    }
    setSelectedParent(parent);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (parent: Parent) => {
    if (authRole !== 'admin' && authRole !== 'guru') {
      toast({ title: "Aksi Ditolak", description: "Anda tidak memiliki izin untuk menghapus data.", variant: "destructive" });
      return;
    }
    setSelectedParent(parent);
  };

  const displayedParents = useMemo(() => {
    let filtered = parents;

    if ((authRole === 'admin' || authRole === 'guru') && selectedClassFilter !== "all") {
      const studentUidsInSelectedClass = studentsForDialog
        .filter(student => student.classId === selectedClassFilter)
        .map(student => student.id); // student.id is student's UID
      filtered = filtered.filter(parent => studentUidsInSelectedClass.includes(parent.studentId));
    }

    if ((authRole === 'admin' || authRole === 'guru') && searchTerm) {
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
  }, [parents, studentsForDialog, searchTerm, selectedClassFilter, authRole]);
  
  const handleExport = async (formatType: 'pdf' | 'xlsx') => {
    if (displayedParents.length === 0) {
      toast({ title: "Tidak ada data untuk diekspor", variant: "info" });
      return;
    }
    setIsExporting(true);

    const fileName = `Data_Orang_Tua_${selectedClassFilter !== 'all' ? allClassesForFilter.find(c => c.id === selectedClassFilter)?.name?.replace(/\s+/g, '_') : 'Semua_Kelas'}_${format(new Date(), "yyyyMMdd")}`;
    const title = `Data Orang Tua - ${selectedClassFilter !== 'all' ? `Kelas Anak ${allClassesForFilter.find(c => c.id === selectedClassFilter)?.name}` : 'Semua Kelas'}`;

    const dataToExport = displayedParents.map((parent, index) => {
        const student = studentsForDialog.find(s => s.id === parent.studentId);
        const className = allClassesForFilter.find(c => c.id === student?.classId)?.name || '-';
        return {
            "No.": index + 1,
            "Nama Orang Tua": parent.name,
            "Email": parent.email || '-',
            "Telepon": parent.phone || '-',
            "Nama Anak": parent.studentName,
            "Kelas Anak": className
        };
    });

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
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data Orang Tua");
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

  const totalPages = Math.ceil(displayedParents.length / ITEMS_PER_PAGE);
  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ITEMS_PER_PAGE;
    return displayedParents.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, displayedParents]);

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
        <Label htmlFor={`${formType}-parent-address`}>Alamat (Opsional)</Label>
        <Textarea id={`${formType}-parent-address`} {...formInstance.register("address")} className="mt-1" />
        {formInstance.formState.errors.address && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.address.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-parent-gender`}>Jenis Kelamin</Label>
        <Controller
            name="gender"
            control={formInstance.control}
            render={({ field }) => (
                <Select
                    onValueChange={(value) => field.onChange(value as "laki-laki" | "perempuan")}
                    value={field.value || undefined}
                >
                <SelectTrigger id={`${formType}-parent-gender`} className="mt-1">
                    <SelectValue placeholder="Pilih jenis kelamin" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="laki-laki">Laki-laki</SelectItem>
                    <SelectItem value="perempuan">Perempuan</SelectItem>
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
                  .filter(authUserItem => authUserItem && typeof authUserItem.id === 'string' && authUserItem.id.length > 0)
                  .map((authUserItem) => (
                  <SelectItem key={authUserItem.id} value={authUserItem.id}>
                    {authUserItem.name} ({authUserItem.email})
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
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2 text-xl">
              <UserCircle className="h-6 w-6 text-primary" />
              <div className="flex flex-col items-start sm:flex-row sm:items-baseline sm:gap-x-1.5">
                <span className={cn(isMobile && "block")}>Daftar Orang Tua</span>
                {!isLoadingData && (
                  <span className={cn("text-base font-normal text-muted-foreground", isMobile ? "text-xs" : "sm:text-xl sm:font-semibold sm:text-foreground")}>
                    {`(${displayedParents.length} orang tua)`}
                  </span>
                )}
                {isLoadingData && (
                  <span className={cn("text-base font-normal text-muted-foreground", isMobile ? "text-xs" : "")}>
                    (Memuat...)
                  </span>
                )}
              </div>
            </CardTitle>
            {(authRole === 'admin' || authRole === 'guru') && (
              <div className="flex items-center gap-2 self-end md:self-auto">
                <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
                  setIsAddDialogOpen(isOpen);
                  if (!isOpen) {
                    addParentForm.reset({ name: "", email: "", phone: "", address: "", gender: undefined, agama: undefined, studentId: undefined, authUserId: undefined });
                    addParentForm.clearErrors();
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="w-full sm:w-auto">
                      <PlusCircle className="mr-2 h-4 w-4" /> {isMobile ? "Tambah" : "Tambah Orang Tua"}
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
                          {(addParentForm.formState.isSubmitting || isLoadingData) && <LottieLoader width={16} height={16} className="mr-2" />}
                          {(addParentForm.formState.isSubmitting || isLoadingData) ? "Menyimpan..." : "Simpan Data"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full sm:w-auto" disabled={isExporting}>
                        {isExporting ? <LottieLoader width={16} height={16} /> : <FileDown className="h-4 w-4" />}
                        <span className="ml-2">{isExporting ? 'Mengekspor...' : 'Ekspor'}</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleExport('xlsx')} disabled={isExporting}>
                        Excel (.xlsx)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExport('pdf')} disabled={isExporting}>
                        PDF (.pdf)
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(authRole === 'admin' || authRole === 'guru') && (
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
                disabled={isLoadingData || allClassesForFilter.length === 0}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <FilterIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Filter Kelas Anak" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kelas</SelectItem>
                  {isLoadingData && <SelectItem key="loading-classes-filter" value="loading-classes" disabled>Memuat kelas...</SelectItem>}
                  {!isLoadingData && allClassesForFilter.length === 0 && <SelectItem key="no-classes-filter" value="no-classes" disabled>Tidak ada kelas</SelectItem>}
                  {allClassesForFilter.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {isLoadingData ? (
             <div className="space-y-2 mt-4">
                {[...Array(ITEMS_PER_PAGE)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
             </div>
          ) : currentTableData.length > 0 ? (
            <>
            <div className="overflow-x-auto">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">No.</TableHead>
                    <TableHead className={cn(isMobile ? "w-1/2" : "w-1/4")}>Nama Orang Tua</TableHead>
                    {!isMobile && <TableHead className="w-[80px]">Gender</TableHead>}
                    {!isMobile && <TableHead className="w-1/4">Email</TableHead>}
                    <TableHead className={cn(isMobile ? "w-1/2" : "w-1/5")}>Nama Anak</TableHead>
                    {!isMobile && <TableHead className="w-1/5">UID Akun Tertaut</TableHead>}
                    {(authRole === 'admin' || authRole === 'guru') && <TableHead className={cn(isMobile ? "text-right px-1 w-12" : "text-center w-16")}>Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentTableData.map((parent, index) => (
                    <TableRow key={parent.id}>
                      <TableCell className="text-center">{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                      <TableCell className="font-medium truncate" title={parent.name}>{parent.name}</TableCell>
                       {!isMobile && (
                        <TableCell>
                          {parent.gender === "laki-laki" ? (
                            <Image src="/avatars/laki-laki.png" alt="Laki-laki" width={24} height={24} className="rounded-full" data-ai-hint="male avatar" />
                          ) : parent.gender === "perempuan" ? (
                            <Image src="/avatars/perempuan.png" alt="Perempuan" width={24} height={24} className="rounded-full" data-ai-hint="female avatar" />
                          ) : (
                            "-"
                          )}
                        </TableCell>
                       )}
                      {!isMobile && <TableCell className="truncate" title={parent.email}>{parent.email || "-"}</TableCell>}
                      <TableCell className="truncate" title={parent.studentName}>{parent.studentName || "-"}</TableCell>
                      {!isMobile && (
                        <TableCell className="font-mono text-xs truncate" title={parent.uid}>
                          {parent.uid ? (
                            <div className="flex items-center gap-1">
                              <UidLinkIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="truncate">{parent.uid}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">Belum tertaut</span>
                          )}
                        </TableCell>
                      )}
                      {(authRole === 'admin' || authRole === 'guru') && (
                        <TableCell className={cn(isMobile ? "text-right px-1" : "text-center")}>
                           <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Opsi untuk ${parent.name}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openViewDialog(parent)}>
                                <Eye className="mr-2 h-4 w-4" />
                                Lihat Detail
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(parent)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem
                                    onSelect={(e) => { e.preventDefault(); openDeleteDialog(parent); }}
                                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Hapus
                                  </DropdownMenuItem>
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
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
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
          ) : (
             <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
              {searchTerm || selectedClassFilter !== "all"
                ? "Tidak ada data orang tua yang cocok dengan filter atau pencarian."
                : (teacherResponsibleClassIds && teacherResponsibleClassIds.length === 0 && authRole === 'guru' )
                ? "Anda tidak menjadi wali kelas untuk kelas manapun, atau kelas yang anda asuh belum memiliki murid yang terdata orang tuanya."
                : "Tidak ada data orang tua untuk ditampilkan. Klik \"Tambah Orang Tua\" untuk membuat data baru."
              }
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isViewParentDialogOpen} onOpenChange={(isOpen) => {
          setIsViewParentDialogOpen(isOpen);
          if (!isOpen) { setSelectedParentForView(null); }
      }}>
        <DialogContent className="sm:max-w-xl">
            <DialogHeader>
                <DialogTitle>Detail Orang Tua: {selectedParentForView?.name}</DialogTitle>
                <DialogDescription>Informasi lengkap mengenai orang tua murid.</DialogDescription>
            </DialogHeader>
            {selectedParentForView && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 py-4 text-sm">
                    <div><Label className="text-muted-foreground">Nama Lengkap:</Label><p className="font-medium">{selectedParentForView.name}</p></div>
                    <div><Label className="text-muted-foreground">Jenis Kelamin:</Label><p className="font-medium capitalize">{selectedParentForView.gender || "-"}</p></div>
                    <div><Label className="text-muted-foreground">Agama:</Label><p className="font-medium">{selectedParentForView.agama || "-"}</p></div>
                    <div><Label className="text-muted-foreground">Email:</Label><p className="font-medium">{selectedParentForView.email || "-"}</p></div>
                    <div><Label className="text-muted-foreground">Nomor Telepon:</Label><p className="font-medium">{selectedParentForView.phone || "-"}</p></div>
                    <div className="sm:col-span-2"><Label className="text-muted-foreground">Alamat:</Label><p className="font-medium whitespace-pre-line">{selectedParentForView.address || "-"}</p></div>
                    <div><Label className="text-muted-foreground">Nama Anak Terhubung:</Label><p className="font-medium">{selectedParentForView.studentName || "-"}</p></div>
                    <div>
                        <Label className="text-muted-foreground">UID Akun Pengguna Tertaut:</Label>
                        {selectedParentForView.uid ? (
                            <p className="font-mono text-xs flex items-center gap-1">
                                <UidLinkIcon className="h-3.5 w-3.5 text-muted-foreground" /> {selectedParentForView.uid}
                            </p>
                        ) : (
                            <p className="italic text-muted-foreground">Belum ditautkan.</p>
                        )}
                    </div>
                     {selectedParentForView.createdAt && (
                       <div className="sm:col-span-2">
                          <Label className="text-muted-foreground">Tanggal Dibuat (Profil):</Label>
                          <p className="font-medium">{format(selectedParentForView.createdAt.toDate(), "dd MMMM yyyy, HH:mm", { locale: indonesiaLocale })}</p>
                       </div>
                    )}
                </div>
            )}
            <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Tutup</Button></DialogClose>
            </DialogFooter>
        </DialogContent>
      </Dialog>


      {(authRole === 'admin' || authRole === 'guru') && (
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
                    {(editParentForm.formState.isSubmitting || isLoadingData) && <LottieLoader width={16} height={16} className="mr-2" />}
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
