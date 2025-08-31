
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
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { FileText, PlusCircle, Edit, Trash2, CalendarIcon, MoreVertical, Search, Filter as FilterIcon, Eye, LogIn, BookCopy, Link as LinkExternalIcon } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm, type SubmitHandler, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";
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
  writeBatch,
  limit,
  documentId
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
import LottieLoader from "@/components/ui/LottieLoader";
import Link from "next/link";


// Minimal interfaces for dropdowns
interface SubjectMin { id: string; name: string; }
interface ClassMin { id: string; name: string; }
interface TeacherMin { id: string; name: string; uid: string;}


interface ExamData {
  id: string;
  title: string;
  subjectId: string;
  subjectName?: string; // Denormalized
  classId: string;
  className?: string; // Denormalized
  date: Timestamp; // Firestore Timestamp for date
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  description?: string;
  examLink?: string; // Link to the exam
  createdAt?: Timestamp;
  recordedById?: string; // UID of the user who created/recorded the exam
  recordedByName?: string; // Name of the user
}

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM format

const baseExamObjectSchema = z.object({
  title: z.string().min(3, { message: "Judul ujian minimal 3 karakter." }),
  subjectId: z.string({ required_error: "Pilih mata pelajaran." }),
  classId: z.string({ required_error: "Pilih kelas." }),
  date: z.date({ required_error: "Tanggal ujian harus diisi." }),
  startTime: z.string().regex(timeRegex, { message: "Format waktu mulai JJ:MM (e.g., 07:00)." }),
  endTime: z.string().regex(timeRegex, { message: "Format waktu selesai JJ:MM (e.g., 08:30)." }),
  description: z.string().optional(),
  examLink: z.string().url({ message: "Format URL link ujian tidak valid." }).optional().or(z.literal("")),
});

const examTimeRefinement = (data: { startTime: string; endTime: string; }) => {
  const [startH, startM] = data.startTime.split(':').map(Number);
  const [endH, endM] = data.endTime.split(':').map(Number);
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return false;
  if (endH < startH || (endH === startH && endM <= startM)) {
      return false;
  }
  return true;
};

const examFormSchema = baseExamObjectSchema.refine(examTimeRefinement, {
    message: "Waktu selesai harus setelah waktu mulai.",
    path: ["endTime"],
});
type ExamFormValues = z.infer<typeof examFormSchema>;

const editExamFormSchema = baseExamObjectSchema.extend({
  id: z.string(),
}).refine(examTimeRefinement, {
  message: "Waktu selesai harus setelah waktu mulai.",
  path: ["endTime"],
});
type EditExamFormValues = z.infer<typeof editExamFormSchema>;

const ITEMS_PER_PAGE = 10;

export default function ExamsPage() {
  const { user: authUser, role, loading: authLoading } = useAuth();
  const [exams, setExams] = useState<ExamData[]>([]);
  const [allSubjects, setAllSubjects] = useState<SubjectMin[]>([]); 
  const [allClasses, setAllClasses] = useState<ClassMin[]>([]);   
  
  const [teacherSubjectsForForm, setTeacherSubjectsForForm] = useState<SubjectMin[]>([]); 
  const [teacherClassesForForm, setTeacherClassesForForm] = useState<ClassMin[]>([]);   
  const [isLoadingTeacherFormDropdownData, setIsLoadingTeacherFormDropdownData] = useState(false);
  const [teacherProfileId, setTeacherProfileId] = useState<string | null>(null);


  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<ExamData | null>(null);
  const [isViewDetailDialogOpen, setIsViewDetailDialogOpen] = useState(false);
  const [selectedExamForDetail, setSelectedExamForDetail] = useState<ExamData | null>(null);


  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const { toast } = useToast();
  const { isMobile } = useSidebar();


  const addExamForm = useForm<ExamFormValues>({
    resolver: zodResolver(examFormSchema),
    defaultValues: {
      title: "",
      subjectId: undefined,
      classId: undefined,
      date: new Date(),
      startTime: "",
      endTime: "",
      description: "",
      examLink: "",
    },
  });

  const editExamForm = useForm<EditExamFormValues>({
    resolver: zodResolver(editExamFormSchema),
  });

  const fetchAdminDropdownData = async () => {
    try {
      const [subjectsSnapshot, classesSnapshot] = await Promise.all([
        getDocs(query(collection(db, "subjects"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "classes"), orderBy("name", "asc"))),
      ]);
      setAllSubjects(subjectsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
      setAllClasses(classesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    } catch (error) {
      console.error("Error fetching admin dropdown data: ", error);
      toast({ title: "Gagal Memuat Data Pendukung Admin", variant: "destructive" });
    }
  };

  const fetchTeacherSpecificFormData = async () => {
    if (role !== "guru" || !authUser?.uid) return;
    setIsLoadingTeacherFormDropdownData(true);
    try {
      const teacherProfileQuery = query(collection(db, "teachers"), where("uid", "==", authUser.uid), limit(1));
      const teacherProfileSnapshot = await getDocs(teacherProfileQuery);

      if (teacherProfileSnapshot.empty) {
        toast({ title: "Profil Guru Tidak Ditemukan", variant: "warning" });
        setTeacherProfileId(null);
        setTeacherClassesForForm([]);
        setTeacherSubjectsForForm([]);
        return;
      }
      const currentTeacherProfileId = teacherProfileSnapshot.docs[0].id;
      setTeacherProfileId(currentTeacherProfileId);

      const lessonsQuery = query(collection(db, "lessons"), where("teacherId", "==", currentTeacherProfileId));
      const lessonsSnapshot = await getDocs(lessonsQuery);
      
      const uniqueClassIds = new Set<string>();
      const uniqueSubjectIds = new Set<string>();
      lessonsSnapshot.docs.forEach(doc => {
        uniqueClassIds.add(doc.data().classId);
        uniqueSubjectIds.add(doc.data().subjectId);
      });

      let fetchedClasses: ClassMin[] = [];
      if (uniqueClassIds.size > 0) {
        const classChunks = [];
        const classIdsArray = Array.from(uniqueClassIds);
        for (let i = 0; i < classIdsArray.length; i += 30) { classChunks.push(classIdsArray.slice(i, i + 30)); }
        const classPromises = classChunks.map(chunk => getDocs(query(collection(db, "classes"), where(documentId(), "in", chunk))));
        const classSnapshots = await Promise.all(classPromises);
        classSnapshots.forEach(snap => snap.docs.forEach(d => fetchedClasses.push({ id: d.id, name: d.data().name })));
        fetchedClasses.sort((a, b) => a.name.localeCompare(b.name));
      }
      setTeacherClassesForForm(fetchedClasses);

      let fetchedSubjects: SubjectMin[] = [];
      if (uniqueSubjectIds.size > 0) {
        const subjectChunks = [];
        const subjectIdsArray = Array.from(uniqueSubjectIds);
        for (let i = 0; i < subjectIdsArray.length; i += 30) { subjectChunks.push(subjectIdsArray.slice(i, i + 30)); }
        const subjectPromises = subjectChunks.map(chunk => getDocs(query(collection(db, "subjects"), where(documentId(), "in", chunk))));
        const subjectSnapshots = await Promise.all(subjectPromises);
        subjectSnapshots.forEach(snap => snap.docs.forEach(d => fetchedSubjects.push({ id: d.id, name: d.data().name })));
        fetchedSubjects.sort((a,b) => a.name.localeCompare(b.name));
      }
      setTeacherSubjectsForForm(fetchedSubjects);

    } catch (error) {
      console.error("Error fetching teacher specific form data: ", error);
      toast({ title: "Gagal Memuat Data Form Guru", variant: "destructive" });
    } finally {
      setIsLoadingTeacherFormDropdownData(false);
    }
  };

  const fetchExams = async () => {
    setIsLoading(true);
    try {
      if (role === "admin") { 
        await fetchAdminDropdownData();
      } else if (role === "guru" && (allSubjects.length === 0 || allClasses.length === 0)) {
        // This ensures dropdowns are populated if guru goes here directly or if admin data wasn't needed before.
        await fetchAdminDropdownData(); 
      }

      const examsCollectionRef = collection(db, "exams");
      let q = query(examsCollectionRef, orderBy("date", "desc"), orderBy("startTime", "asc"));

      if (role === "siswa" && authUser?.classId) {
          q = query(examsCollectionRef, where("classId", "==", authUser.classId), orderBy("date", "desc"), orderBy("startTime", "asc"));
      } else if (role === "orangtua" && authUser?.linkedStudentClassId) {
          q = query(examsCollectionRef, where("classId", "==", authUser.linkedStudentClassId), orderBy("date", "desc"), orderBy("startTime", "asc"));
      } else if (role === 'orangtua' && !authUser?.linkedStudentClassId) {
          setExams([]);
          setIsLoading(false);
          return;
      }
      
      const querySnapshot = await getDocs(q);
      const fetchedExams: ExamData[] = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title,
          subjectId: data.subjectId,
          subjectName: data.subjectName,
          classId: data.classId,
          className: data.className,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
          description: data.description,
          examLink: data.examLink,
          createdAt: data.createdAt,
          recordedById: data.recordedById,
          recordedByName: data.recordedByName,
        };
      });
      setExams(fetchedExams);
    } catch (error) {
      console.error("Error fetching exams: ", error);
      toast({ title: "Gagal Memuat Jadwal Ujian", description: "Terjadi kesalahan.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) { 
        fetchExams();
    }
  }, [authLoading, authUser, role]); 

  useEffect(() => {
    if (selectedExam && isEditDialogOpen) {
      if (role === 'guru') {
        fetchTeacherSpecificFormData(); 
      }
      editExamForm.reset({
        id: selectedExam.id,
        title: selectedExam.title,
        subjectId: selectedExam.subjectId,
        classId: selectedExam.classId,
        date: selectedExam.date.toDate(),
        startTime: selectedExam.startTime,
        endTime: selectedExam.endTime,
        description: selectedExam.description || "",
        examLink: selectedExam.examLink || "",
      });
    }
  }, [selectedExam, isEditDialogOpen, editExamForm, role]);


  const handleAddExamSubmit: SubmitHandler<ExamFormValues> = async (data) => {
    addExamForm.clearErrors();
    let subjectName, className;

    if (role === 'guru') {
        subjectName = teacherSubjectsForForm.find(s => s.id === data.subjectId)?.name;
        className = teacherClassesForForm.find(c => c.id === data.classId)?.name;
    } else { // Admin
        subjectName = allSubjects.find(s => s.id === data.subjectId)?.name;
        className = allClasses.find(c => c.id === data.classId)?.name;
    }
    
    if (!subjectName || !className) {
      toast({title: "Data Tidak Lengkap", description: "Pastikan subjek dan kelas valid.", variant: "destructive"});
      return;
    }
    if (!authUser) {
        toast({ title: "Aksi Gagal", description: "Pengguna tidak terautentikasi.", variant: "destructive" });
        return;
    }

    try {
      const examData = {
        ...data,
        date: Timestamp.fromDate(data.date),
        subjectName,
        className,
        examLink: data.examLink || null,
        createdAt: serverTimestamp(),
        recordedById: authUser.uid,
        recordedByName: authUser.displayName || authUser.email,
      };
      await addDoc(collection(db, "exams"), examData);
      toast({ title: "Ujian Ditambahkan", description: "Jadwal ujian berhasil disimpan." });

      const batch = writeBatch(db);
      const notificationBase = {
        title: `Jadwal Ujian: ${data.title.substring(0,25)}${data.title.length > 25 ? "..." : ""} (${subjectName})`,
        description: `Tanggal: ${format(data.date, "dd MMM yyyy", {locale: indonesiaLocale})}, Pukul ${data.startTime} - ${data.endTime}`,
        href: `/exams`,
        read: false,
        createdAt: serverTimestamp(),
        type: "new_exam",
      };

      const usersRef = collection(db, "users");
      const qStudents = query(usersRef, where("role", "==", "siswa"), where("classId", "==", data.classId));
      const studentsSnapshot = await getDocs(qStudents);

      studentsSnapshot.forEach((studentDoc) => {
        const studentNotificationRef = doc(collection(db, "notifications"));
        batch.set(studentNotificationRef, { ...notificationBase, userId: studentDoc.id });
      });

      const creatorNotificationRef = doc(collection(db, "notifications"));
      batch.set(creatorNotificationRef, { ...notificationBase, userId: authUser.uid, title: `Anda membuat jadwal ujian: ${data.title} (${subjectName})` });

      await batch.commit();

      setIsAddDialogOpen(false);
      addExamForm.reset({ date: new Date(), title: "", subjectId: undefined, classId: undefined, startTime: "", endTime: "", description: "", examLink: "" });
      fetchExams();
    } catch (error: any) {
      console.error("Error adding exam or notifications:", error);
      toast({ title: "Gagal Menambahkan Ujian", description: "Terjadi kesalahan.", variant: "destructive" });
    }
  };

  const handleEditExamSubmit: SubmitHandler<EditExamFormValues> = async (data) => {
    if (!selectedExam || !authUser) {
        toast({ title: "Aksi Gagal", description: "Data atau pengguna tidak valid.", variant: "destructive" });
        return;
    }
    editExamForm.clearErrors();
    let subjectName, className;

    if (role === 'guru') {
        subjectName = teacherSubjectsForForm.find(s => s.id === data.subjectId)?.name;
        className = teacherClassesForForm.find(c => c.id === data.classId)?.name;
    } else { // Admin
        subjectName = allSubjects.find(s => s.id === data.subjectId)?.name;
        className = allClasses.find(c => c.id === data.classId)?.name;
    }

    if (!subjectName || !className) {
      toast({title: "Data Tidak Lengkap", description: "Pastikan subjek dan kelas valid.", variant: "destructive"});
      return;
    }

    try {
      const examDocRef = doc(db, "exams", data.id);
      await updateDoc(examDocRef, {
        ...data,
        date: Timestamp.fromDate(data.date),
        subjectName,
        className,
        examLink: data.examLink || null,
      });
      toast({ title: "Ujian Diperbarui", description: "Jadwal ujian berhasil diperbarui." });
      setIsEditDialogOpen(false);
      setSelectedExam(null);
      fetchExams();
    } catch (error) {
      console.error("Error editing exam:", error);
      toast({ title: "Gagal Memperbarui Ujian", description: "Terjadi kesalahan.", variant: "destructive" });
    }
  };

  const handleDeleteExam = async (examId: string) => {
    try {
      await deleteDoc(doc(db, "exams", examId));
      toast({ title: "Ujian Dihapus", description: "Jadwal ujian berhasil dihapus." });
      setSelectedExam(null);
      fetchExams();
    } catch (error) {
      console.error("Error deleting exam:", error);
      toast({ title: "Gagal Menghapus Ujian", description: "Terjadi kesalahan.", variant: "destructive" });
    }
  };

  const openViewDetailDialog = (exam: ExamData) => {
    setSelectedExamForDetail(exam);
    setIsViewDetailDialogOpen(true);
  };

  const openEditDialog = (exam: ExamData) => {
    setSelectedExam(exam);
    if (role === 'guru') {
      fetchTeacherSpecificFormData(); 
    }
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (exam: ExamData) => {
    setSelectedExam(exam);
  };

  const canManageExams = role === "admin" || role === "guru";

  const uniqueSubjectNamesForFilter = useMemo(() => {
    const subjectNames = new Set<string>();
    exams.forEach(exam => {
        if (exam.subjectName) subjectNames.add(exam.subjectName);
    });
    return Array.from(subjectNames).sort();
  }, [exams]);

  const filteredAndSearchedExams = useMemo(() => {
    return exams.filter(exam => {
        const matchesSubject = selectedSubjectFilter === "all" || exam.subjectName === selectedSubjectFilter;
        const matchesSearchTerm = searchTerm === "" ||
            exam.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (exam.subjectName && exam.subjectName.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (exam.className && exam.className.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchesSubject && matchesSearchTerm;
    });
  }, [exams, searchTerm, selectedSubjectFilter]);

  const totalPages = Math.ceil(filteredAndSearchedExams.length / ITEMS_PER_PAGE);
  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ITEMS_PER_PAGE;
    return filteredAndSearchedExams.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, filteredAndSearchedExams]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedSubjectFilter]);

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

  const subjectsForCurrentForm = role === 'guru' ? teacherSubjectsForForm : allSubjects;
  const classesForCurrentForm = role === 'guru' ? teacherClassesForForm : allClasses;
  const isLoadingFormOptions = role === 'guru' ? isLoadingTeacherFormDropdownData : (isLoading || authLoading) ; 
  
  const renderExamFormFields = (formInstance: typeof addExamForm | typeof editExamForm, dialogType: 'add' | 'edit') => (
    <>
      <div>
        <Label htmlFor={`${dialogType}-exam-title`}>Judul Ujian</Label>
        <Input id={`${dialogType}-exam-title`} {...formInstance.register("title")} className="mt-1" />
        {formInstance.formState.errors.title && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.title.message}</p>}
      </div>
      <div>
        <Label htmlFor={`${dialogType}-exam-subjectId`}>Mata Pelajaran</Label>
        <Select onValueChange={(value) => formInstance.setValue("subjectId", value, { shouldValidate: true })} value={formInstance.getValues("subjectId") || undefined} disabled={isLoadingFormOptions}>
          <SelectTrigger id={`${dialogType}-exam-subjectId`} className="mt-1"><SelectValue placeholder={isLoadingFormOptions ? "Memuat..." : "Pilih mata pelajaran"} /></SelectTrigger>
          <SelectContent>
            {subjectsForCurrentForm.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            {subjectsForCurrentForm.length === 0 && !isLoadingFormOptions && <SelectItem value="no-data" disabled>Tidak ada mapel</SelectItem>}
          </SelectContent>
        </Select>
        {formInstance.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.subjectId.message}</p>}
      </div>
      <div>
        <Label htmlFor={`${dialogType}-exam-classId`}>Kelas</Label>
        <Select onValueChange={(value) => formInstance.setValue("classId", value, { shouldValidate: true })} value={formInstance.getValues("classId") || undefined} disabled={isLoadingFormOptions}>
          <SelectTrigger id={`${dialogType}-exam-classId`} className="mt-1"><SelectValue placeholder={isLoadingFormOptions ? "Memuat..." : "Pilih kelas"} /></SelectTrigger>
          <SelectContent>
            {classesForCurrentForm.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            {classesForCurrentForm.length === 0 && !isLoadingFormOptions && <SelectItem value="no-data" disabled>Tidak ada kelas</SelectItem>}
          </SelectContent>
        </Select>
        {formInstance.formState.errors.classId && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.classId.message}</p>}
      </div>
      <div>
        <Label htmlFor={`${dialogType}-exam-date`}>Tanggal Ujian</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={"outline"}
              className="w-full justify-start text-left font-normal mt-1"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {formInstance.watch("date") ? format(formInstance.watch("date"), "PPP", { locale: indonesiaLocale }) : <span>Pilih tanggal</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={formInstance.watch("date")}
              onSelect={(date) => formInstance.setValue("date", date || new Date(), { shouldValidate: true })}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        {formInstance.formState.errors.date && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.date.message}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
              <Label htmlFor={`${dialogType}-exam-startTime`}>Waktu Mulai</Label>
              <Input id={`${dialogType}-exam-startTime`} type="time" {...formInstance.register("startTime")} className="mt-1" />
              {formInstance.formState.errors.startTime && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.startTime.message}</p>}
          </div>
          <div>
              <Label htmlFor={`${dialogType}-exam-endTime`}>Waktu Selesai</Label>
              <Input id={`${dialogType}-exam-endTime`} type="time" {...formInstance.register("endTime")} className="mt-1" />
              {formInstance.formState.errors.endTime && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.endTime.message}</p>}
          </div>
      </div>
      <div>
        <Label htmlFor={`${dialogType}-exam-examLink`}>Link Ujian ()</Label>
        <Input id={`${dialogType}-exam-examLink`} {...formInstance.register("examLink")} className="mt-1" placeholder="https://contoh.com/link-ujian" />
        {formInstance.formState.errors.examLink && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.examLink.message}</p>}
      </div>
      <div>
        <Label htmlFor={`${dialogType}-exam-description`}>Deskripsi ()</Label>
        <Textarea id={`${dialogType}-exam-description`} {...formInstance.register("description")} className="mt-1" />
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
            <h1 className="text-3xl font-bold font-headline">Manajemen Ujian</h1>
            <p className="text-muted-foreground">Kelola jadwal ujian, input soal, dan pelaksanaan ujian.</p>
        </div>
        {/* Tombol Lihat Daftar Tugas dihapus untuk role siswa */}
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileText className="h-6 w-6 text-primary" />
            <span>Daftar Ujian</span>
          </CardTitle>
          {canManageExams && (
            <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
              setIsAddDialogOpen(isOpen);
              if (!isOpen) { addExamForm.reset({ date: new Date(), title: "", subjectId: undefined, classId: undefined, startTime: "", endTime: "", description: "", examLink: "" }); addExamForm.clearErrors(); }
              else if (role === 'guru') { fetchTeacherSpecificFormData(); }
              else if (role === 'admin' && (allSubjects.length === 0 || allClasses.length === 0)) { fetchAdminDropdownData(); }
            }}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={isLoadingFormOptions && role === 'guru'}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Tambah Ujian
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Tambah Jadwal Ujian Baru</DialogTitle>
                  <DialogDescription>
                    Isi detail jadwal ujian.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={addExamForm.handleSubmit(handleAddExamSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                  {renderExamFormFields(addExamForm, 'add')}
                  <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                    <Button type="submit" disabled={addExamForm.formState.isSubmitting || isLoadingFormOptions}>
                        {(addExamForm.formState.isSubmitting || isLoadingFormOptions) && <LottieLoader width={16} height={16} className="mr-2"/>}
                        {(addExamForm.formState.isSubmitting || isLoadingFormOptions) ? "Menyimpan..." : "Simpan Jadwal"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          { (role === "admin" || role === "guru") && (
            <div className="my-4 flex flex-col sm:flex-row gap-2">
                <div className="relative flex-grow">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cari ujian, mapel, atau kelas..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 w-full"
                    />
                </div>
                <Select
                    value={selectedSubjectFilter}
                    onValueChange={setSelectedSubjectFilter}
                    disabled={isLoading || uniqueSubjectNamesForFilter.length === 0}
                >
                    <SelectTrigger className="w-full sm:w-[200px]">
                        <FilterIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                        <SelectValue placeholder="Filter Mata Pelajaran" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Semua Mapel</SelectItem>
                        {uniqueSubjectNamesForFilter.map((subjectName) => (
                            <SelectItem key={subjectName} value={subjectName}>{subjectName}</SelectItem>
                        ))}
                         {uniqueSubjectNamesForFilter.length === 0 && !isLoading && <SelectItem value="no-subjects" disabled>Belum ada mapel terfilter</SelectItem>}
                    </SelectContent>
                </Select>
            </div>
          )}
          {isLoading || authLoading ? (
            <div className="space-y-2 mt-4">
              {[...Array(ITEMS_PER_PAGE)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : currentTableData.length > 0 ? (
            <>
            <div className="overflow-x-auto mt-4">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className={cn(isMobile ? "w-10 px-2 text-center" : "w-[50px]")}>No.</TableHead>
                    <TableHead className={cn(isMobile ? "w-2/5 px-2" : "min-w-[150px]")}>Mata Pelajaran</TableHead>
                    <TableHead className={cn(isMobile ? "w-2/5 px-2" : "min-w-[120px]")}>Tanggal</TableHead>
                    {!isMobile && (role === "admin" || role === "guru") && <TableHead className="min-w-[180px]">Judul Ujian</TableHead>}
                    {!isMobile && (role === "admin" || role === "guru") && <TableHead className="min-w-[100px]">Kelas</TableHead>}
                    {!isMobile && (role === "siswa" || role === "orangtua") && <TableHead className="min-w-[180px]">Judul Ujian</TableHead>}
                    {!isMobile && (role === "siswa" || role === "orangtua") && <TableHead className="min-w-[100px]">Kelas</TableHead>}
                    {!isMobile && <TableHead className="min-w-[120px]">Waktu</TableHead>}
                    <TableHead className={cn("text-right", isMobile ? "w-12 px-1" : "w-16")}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentTableData.map((exam, index) => (
                    <TableRow key={exam.id}>
                      <TableCell className={cn(isMobile ? "px-2 text-center" : "")}>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                      <TableCell className={cn("truncate", isMobile ? "px-2" : "font-medium")} title={exam.subjectName || exam.subjectId}>{exam.subjectName || exam.subjectId}</TableCell>
                      <TableCell className={cn(isMobile && "px-2 text-xs")}>
                          {format(exam.date.toDate(), isMobile ? "dd/MM/yy" : "dd MMM yyyy", { locale: indonesiaLocale })}
                          {isMobile && <span className="block text-muted-foreground">{exam.startTime} - {exam.endTime}</span>}
                      </TableCell>
                      {!isMobile && (role === "admin" || role === "guru") && <TableCell className="truncate" title={exam.title}>{exam.title}</TableCell>}
                      {!isMobile && (role === "admin" || role === "guru") && <TableCell className="truncate" title={exam.className || exam.classId}>{exam.className || exam.classId}</TableCell>}
                      {!isMobile && (role === "siswa" || role === "orangtua") && <TableCell className="font-medium truncate" title={exam.title}>{exam.title}</TableCell>}
                      {!isMobile && (role === "siswa" || role === "orangtua") && <TableCell className="truncate" title={exam.className || exam.classId}>{exam.className || exam.classId}</TableCell>}
                      {!isMobile && <TableCell>{exam.startTime} - {exam.endTime}</TableCell>}
                      <TableCell className={cn("text-right", isMobile ? "px-1" : "")}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`Opsi untuk ${exam.title}`}>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openViewDetailDialog(exam)}>
                                  <Eye className="mr-2 h-4 w-4" /> Lihat Detail
                                </DropdownMenuItem>
                                {role === "siswa" && exam.examLink && (
                                   <DropdownMenuItem asChild>
                                      <Link href={exam.examLink} target="_blank" rel="noopener noreferrer">
                                          <LogIn className="mr-2 h-4 w-4" /> Masuk Ujian
                                      </Link>
                                  </DropdownMenuItem>
                                )}
                                {canManageExams && (
                                  <>
                                    <DropdownMenuItem onClick={() => openEditDialog(exam)}>
                                      <Edit className="mr-2 h-4 w-4" /> Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <DropdownMenuItem
                                          onSelect={(e) => { e.preventDefault(); openDeleteDialog(exam); }}
                                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                        >
                                          <Trash2 className="mr-2 h-4 w-4" /> Hapus
                                        </DropdownMenuItem>
                                      </AlertDialogTrigger>
                                      {selectedExam && selectedExam.id === exam.id && (
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Apakah Kamu Yakin?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Tindakan ini akan menghapus jadwal ujian <span className="font-semibold">{selectedExam?.title}</span>.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel onClick={() => setSelectedExam(null)}>Batal</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDeleteExam(selectedExam.id)}>Ya, Hapus Jadwal</AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      )}
                                    </AlertDialog>
                                  </>
                                )}
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
          ) : (
            <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
              {searchTerm || selectedSubjectFilter !== "all"
                ? "Tidak ada ujian yang cocok dengan filter atau pencarian."
                : "Belum ada jadwal ujian yang ditambahkan."
              }
            </div>
          )}
        </CardContent>
      </Card>

       <Dialog open={isViewDetailDialogOpen} onOpenChange={(isOpen) => {
          setIsViewDetailDialogOpen(isOpen);
          if (!isOpen) setSelectedExamForDetail(null);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Detail Ujian: {selectedExamForDetail?.title}
            </DialogTitle>
            <DialogDescription>
              Informasi lengkap mengenai jadwal ujian ini.
            </DialogDescription>
          </DialogHeader>
          {selectedExamForDetail && (
            <div className="space-y-3 py-4 max-h-[60vh] overflow-y-auto pr-2 text-sm">
              <div><Label className="text-muted-foreground">Judul Ujian:</Label><p className="font-medium">{selectedExamForDetail.title}</p></div>
              <div><Label className="text-muted-foreground">Mata Pelajaran:</Label><p className="font-medium">{selectedExamForDetail.subjectName || selectedExamForDetail.subjectId}</p></div>
              <div><Label className="text-muted-foreground">Kelas:</Label><p className="font-medium">{selectedExamForDetail.className || selectedExamForDetail.classId}</p></div>
              <div><Label className="text-muted-foreground">Tanggal:</Label><p className="font-medium">{format(selectedExamForDetail.date.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale })}</p></div>
              <div><Label className="text-muted-foreground">Waktu Mulai:</Label><p className="font-medium">{selectedExamForDetail.startTime}</p></div>
              <div><Label className="text-muted-foreground">Waktu Selesai:</Label><p className="font-medium">{selectedExamForDetail.endTime}</p></div>
              {selectedExamForDetail.examLink && (
                <div>
                  <Label className="text-muted-foreground">Link Ujian:</Label>
                   <Button variant="link" asChild className="p-0 h-auto block text-sm">
                    <Link href={selectedExamForDetail.examLink} target="_blank" rel="noopener noreferrer">
                      <LinkExternalIcon className="inline-block mr-1 h-4 w-4" /> Buka Link Ujian
                    </Link>
                  </Button>
                </div>
              )}
              {selectedExamForDetail.description && (
                <div><Label className="text-muted-foreground">Deskripsi:</Label><p className="whitespace-pre-line">{selectedExamForDetail.description}</p></div>
              )}
              {selectedExamForDetail.recordedByName && (role === "admin" || role === "guru") && (
                <div><Label className="text-muted-foreground">Dicatat Oleh:</Label><p className="font-medium">{selectedExamForDetail.recordedByName}</p></div>
              )}
              {selectedExamForDetail.createdAt && (role === "admin" || role === "guru") && (
                <div><Label className="text-muted-foreground">Tanggal Dibuat:</Label><p className="font-medium">{format(selectedExamForDetail.createdAt.toDate(), "dd MMMM yyyy, HH:mm", { locale: indonesiaLocale })}</p></div>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Tutup</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canManageExams && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
          setIsEditDialogOpen(isOpen);
          if (!isOpen) { setSelectedExam(null); editExamForm.clearErrors(); }
        }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Jadwal Ujian</DialogTitle>
              <DialogDescription>Perbarui detail jadwal ujian.</DialogDescription>
            </DialogHeader>
            {selectedExam && (
              <form onSubmit={editExamForm.handleSubmit(handleEditExamSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <Input type="hidden" {...editExamForm.register("id")} />
                {renderExamFormFields(editExamForm, 'edit')}
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                  <Button type="submit" disabled={editExamForm.formState.isSubmitting || isLoadingFormOptions}>
                    {(editExamForm.formState.isSubmitting || isLoadingFormOptions) && <LottieLoader width={16} height={16} className="mr-2"/>}
                    {(editExamForm.formState.isSubmitting || isLoadingFormOptions) ? "Menyimpan..." : "Simpan Perubahan"}
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
