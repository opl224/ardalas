
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription as ShadCardDescription } from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogDescription,
  DialogFooter, 
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription as AlertDialogDesc,
  AlertDialogFooter as AlertDialogFoot, 
  AlertDialogHeader as AlertDialogHead,
  AlertDialogTitle as AlertDialogT,
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
import { CalendarDatePicker } from "@/components/calendar-date-picker";
import { BarChart3, PlusCircle, Edit, Trash2, CalendarIcon, AlertCircle, Save, Filter, Link as LinkIcon, Search, MoreVertical, Eye, FileDown } from "lucide-react";
import LottieLoader from "@/components/ui/LottieLoader";
import { useState, useEffect, useMemo } from "react";
import { useForm, type SubmitHandler, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, startOfDay } from "date-fns";
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
  Query as FirebaseQuery,
  DocumentData,
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { Form } from "@/components/ui/form";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';


interface ClassMin { id: string; name: string; }
interface StudentMin { id: string; name: string; classId: string; className?: string; }
interface SubjectMin { id: string; name: string; }
interface AssignmentMin { id: string; title: string; meetingNumber?: number; subjectId: string; classId: string; }

const ASSESSMENT_TYPES = ["UTS", "UAS", "Tugas Harian", "Kuis", "Proyek", "Praktikum", "Lainnya"] as const;
type AssessmentType = typeof ASSESSMENT_TYPES[number];

interface ResultData {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  assessmentType: AssessmentType;
  assessmentTitle: string;
  score: number;
  dateOfAssessment: Timestamp;
  feedback?: string;
  assignmentId?: string;
  meetingNumber?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  recordedById?: string;
  recordedByName?: string;
  studentSubmissionLink?: string;
  submissionNotes?: string;
}

const baseResultFormSchema = z.object({
  classId: z.string({ required_error: "Pilih kelas." }),
  studentId: z.string({ required_error: "Pilih siswa." }),
  subjectId: z.string({ required_error: "Pilih mata pelajaran." }),
  assessmentType: z.enum(ASSESSMENT_TYPES, { required_error: "Pilih tipe asesmen." }),
  assessmentTitle: z.string().min(3, { message: "Judul asesmen minimal 3 karakter." }),
  score: z.coerce.number().min(0, "Nilai minimal 0.").max(1000, "Nilai maksimal 1000."),
  dateOfAssessment: z.date({ required_error: "Tanggal asesmen harus diisi." }),
  feedback: z.string().optional(),
  assignmentId: z.string().optional(),
  meetingNumber: z.coerce.number().positive("Pertemuan harus angka positif.").optional(),
});

const resultFormSchema = baseResultFormSchema;
type ResultFormValues = z.infer<typeof resultFormSchema>;

const editResultFormSchema = baseResultFormSchema.extend({ id: z.string() });
type EditResultFormValues = z.infer<typeof editResultFormSchema>;

const ITEMS_PER_PAGE = 10;

export default function ResultsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const { isMobile } = useSidebar();
  const [results, setResults] = useState<ResultData[]>([]);
  const [classes, setClasses] = useState<ClassMin[]>([]);
  const [students, setStudents] = useState<StudentMin[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<StudentMin[]>([]);
  const [subjects, setSubjects] = useState<SubjectMin[]>([]);
  const [assignments, setAssignments] = useState<AssignmentMin[]>([]);
  const [filteredAssignments, setFilteredAssignments] = useState<AssignmentMin[]>([]);

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isLoadingResults, setIsLoadingResults] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<ResultData | null>(null);
  const [isViewDetailDialogOpen, setIsViewDetailDialogOpen] = useState(false);
  const [selectedResultForDetail, setSelectedResultForDetail] = useState<ResultData | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassFilterForTable, setSelectedClassFilterForTable] = useState<string>("all");
  const [selectedSubjectFilterForTable, setSelectedSubjectFilterForTable] = useState<string>("all");
  const [selectedAssessmentTypeFilter, setSelectedAssessmentTypeFilter] = useState<AssessmentType | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);

  const [exportClassId, setExportClassId] = useState<string | undefined>();
  const [exportSubjectId, setExportSubjectId] = useState<string | undefined>();
  const [exportAssessmentType, setExportAssessmentType] = useState<AssessmentType | undefined>();
  const [isExporting, setIsExporting] = useState(false);

  const { toast } = useToast();

  const addResultForm = useForm<ResultFormValues>({
    resolver: zodResolver(resultFormSchema),
    defaultValues: {
      classId: undefined,
      studentId: undefined,
      subjectId: undefined,
      assessmentType: undefined,
      assessmentTitle: "",
      score: 0,
      dateOfAssessment: new Date(),
      feedback: "",
      assignmentId: undefined,
      meetingNumber: undefined,
    },
  });

  const editResultForm = useForm<EditResultFormValues>({
    resolver: zodResolver(editResultFormSchema),
  });

  const fetchDropdownData = async () => {
    if (role !== "admin" && role !== "guru") {
        setIsLoadingData(false);
        return;
    }
    setIsLoadingData(true);
    try {
      const [classesSnapshot, studentsAuthSnapshot, subjectsSnapshot, assignmentsSnapshot] = await Promise.all([
        getDocs(query(collection(db, "classes"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "users"), where("role", "==", "siswa"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "subjects"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "assignments"), orderBy("title", "asc"))),
      ]);
      setClasses(classesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));

      setStudents(studentsAuthSnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            name: data.name,
            classId: data.classId,
            className: data.className,
        };
      }));

      setSubjects(subjectsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
      setAssignments(assignmentsSnapshot.docs.map(doc => ({
        id: doc.id,
        title: doc.data().title,
        meetingNumber: doc.data().meetingNumber,
        subjectId: doc.data().subjectId,
        classId: doc.data().classId,
      })));

    } catch (error) {
      console.error("Error fetching dropdown data: ", error);
      toast({ title: "Gagal Memuat Data Pendukung", variant: "destructive" });
    } finally {
      setIsLoadingData(false);
    }
  };

  const fetchResults = async () => {
    if (!user || !role) {
        setResults([]);
        setIsLoadingResults(false);
        return;
    }

    setIsLoadingResults(true);
    try {
      const resultsCollectionRef = collection(db, "results");
      let q: FirebaseQuery<DocumentData, DocumentData> | null = null;

      if (role === 'siswa' && user.uid) {
        q = query(resultsCollectionRef, where("studentId", "==", user.uid), orderBy("dateOfAssessment", "desc"));
      } else if (role === 'orangtua' && user.linkedStudentId) {
        q = query(resultsCollectionRef, where("studentId", "==", user.linkedStudentId), orderBy("dateOfAssessment", "desc"));
      } else if (role === 'guru' && user.uid) {
        q = query(resultsCollectionRef, where("recordedById", "==", user.uid), orderBy("dateOfAssessment", "desc"), orderBy("createdAt", "desc"));
      } else if (role === 'admin') {
        q = query(resultsCollectionRef, orderBy("dateOfAssessment", "desc"), orderBy("createdAt", "desc"));
      }


      if (!q) {
        setResults([]);
        setIsLoadingResults(false);
        return;
      }

      let fetchedResultsDocs = await getDocs(q);
      let fetchedResults = fetchedResultsDocs.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as ResultData[];

      const studentToQueryId = role === 'siswa' ? user.uid : (role === 'orangtua' ? user.linkedStudentId : null);
      if (studentToQueryId && fetchedResults.length > 0) {
        const assignmentIds = fetchedResults
            .map(r => r.assignmentId)
            .filter((id): id is string => !!id);

        if (assignmentIds.length > 0) {
            const submissionQueries = [];
            for (let i = 0; i < assignmentIds.length; i += 30) {
                const chunk = assignmentIds.slice(i, i + 30);
                submissionQueries.push(
                    getDocs(query(
                        collection(db, "assignmentSubmissions"),
                        where("studentId", "==", studentToQueryId),
                        where("assignmentId", "in", chunk)
                    ))
                );
            }
            const submissionsSnapshots = await Promise.all(submissionQueries);
            const submissionsMap = new Map<string, { link: string; notes?: string }>();
            submissionsSnapshots.forEach(snapshot => {
                snapshot.forEach(doc => {
                    const subData = doc.data();
                    if (subData.assignmentId) {
                      submissionsMap.set(subData.assignmentId, { link: subData.submissionLink, notes: subData.notes });
                    }
                });
            });

            fetchedResults = fetchedResults.map(result => {
                if (result.assignmentId && submissionsMap.has(result.assignmentId)) {
                    const submission = submissionsMap.get(result.assignmentId)!;
                    return {
                        ...result,
                        studentSubmissionLink: submission.link,
                        submissionNotes: submission.notes,
                    };
                }
                return result;
            });
        }
      }
      setResults(fetchedResults);
    } catch (error) {
      console.error("Error fetching results: ", error);
      toast({ title: "Gagal Memuat Hasil Belajar", variant: "destructive" });
    } finally {
      setIsLoadingResults(false);
    }
  };

 useEffect(() => {
    if (authLoading) {
      setIsLoadingData(true);
      setIsLoadingResults(true);
      return;
    }

    if (!user) {
      setResults([]);
      setStudents([]);
      setFilteredStudents([]);
      setAssignments([]);
      setFilteredAssignments([]);
      setIsLoadingData(false);
      setIsLoadingResults(false);
      return;
    }

    const loadAllData = async () => {
      setIsLoadingData(true);
      setIsLoadingResults(true);

      if (role === "admin" || role === "guru") {
        await fetchDropdownData();
      } else {
        setIsLoadingData(false);
      }
      await fetchResults();
    };

    loadAllData();

  }, [authLoading, user, role]);

  const watchClassId = addResultForm.watch("classId");
  const watchSubjectIdForAdd = addResultForm.watch("subjectId");
  const watchAssignmentId = addResultForm.watch("assignmentId");

  const editWatchClassId = editResultForm.watch("classId");
  const editWatchSubjectId = editResultForm.watch("subjectId");
  const editWatchAssignmentId = editResultForm.watch("assignmentId");

  useEffect(() => {
    const currentFormStudentId = addResultForm.getValues("studentId");
    let newFilteredStudentsList: StudentMin[] = [];
    if (watchClassId) {
      newFilteredStudentsList = students.filter(s => s.classId === watchClassId);
    }
    setFilteredStudents(newFilteredStudentsList);

    if (currentFormStudentId && !newFilteredStudentsList.find(s => s.id === currentFormStudentId) || !watchClassId) {
      addResultForm.setValue("studentId", undefined, { shouldValidate: true });
    }
  }, [watchClassId, students, addResultForm]);

  useEffect(() => {
    const currentFormStudentId = editResultForm.getValues("studentId");
    let newFilteredStudentsList: StudentMin[] = [];

    if (editWatchClassId) {
        newFilteredStudentsList = students.filter(s => s.classId === editWatchClassId);
    } else if (role === "admin" || role === "guru") {
        newFilteredStudentsList = students;
    }
    setFilteredStudents(newFilteredStudentsList);

    if (currentFormStudentId && !newFilteredStudentsList.find(s => s.id === currentFormStudentId) || !editWatchClassId && (role === "admin" || role === "guru")) {
        editResultForm.setValue("studentId", undefined, { shouldValidate: true });
    }
  }, [editWatchClassId, students, editResultForm, role]);

  useEffect(() => {
    const currentClassIdValue = addResultForm.getValues("classId");
    if (currentClassIdValue && watchSubjectIdForAdd) {
      setFilteredAssignments(assignments.filter(a => a.classId === currentClassIdValue && a.subjectId === watchSubjectIdForAdd));
    } else {
      setFilteredAssignments([]);
    }
    if (addResultForm.getValues("assignmentId") !== undefined && (!currentClassIdValue || !watchSubjectIdForAdd)) {
      addResultForm.setValue("assignmentId", undefined, { shouldValidate: true });
    }
  }, [watchClassId, watchSubjectIdForAdd, assignments, addResultForm]);

   useEffect(() => {
     const selectedAssignment = assignments.find(a => a.id === watchAssignmentId);
     if (selectedAssignment) {
         addResultForm.setValue("assessmentTitle", selectedAssignment.title, {shouldValidate: true});
         if (selectedAssignment.meetingNumber) {
             addResultForm.setValue("meetingNumber", selectedAssignment.meetingNumber, {shouldValidate: true});
         } else {
             addResultForm.setValue("meetingNumber", undefined, {shouldValidate: true});
         }
     } else if (watchAssignmentId === "" || watchAssignmentId === undefined) {
         const currentTitle = addResultForm.getValues("assessmentTitle");
         const previousAssignmentId = addResultForm.formState.defaultValues?.assignmentId;
         const wasTitleFromAssignment = assignments.some(a => a.id === previousAssignmentId && a.title === currentTitle);

         if (!addResultForm.formState.dirtyFields.assessmentTitle && (wasTitleFromAssignment || !currentTitle) ) {
            addResultForm.setValue("assessmentTitle", "", {shouldValidate: true});
         }
         if (!addResultForm.formState.dirtyFields.meetingNumber) {
            addResultForm.setValue("meetingNumber", undefined, {shouldValidate: true});
         }
     }
  }, [watchAssignmentId, assignments, addResultForm]);

  useEffect(() => {
    const currentClassIdValue = editResultForm.getValues("classId");
    if (currentClassIdValue && editWatchSubjectId) {
        setFilteredAssignments(assignments.filter(a => a.classId === currentClassIdValue && a.subjectId === editWatchSubjectId));
    } else {
        setFilteredAssignments([]);
    }
    if (editResultForm.getValues("assignmentId") !== undefined && (!currentClassIdValue || !editWatchSubjectId) ) {
        editResultForm.setValue("assignmentId", undefined, {shouldValidate: true});
    }
  }, [editWatchClassId, editWatchSubjectId, assignments, editResultForm]);

   useEffect(() => {
     const selectedAssignment = assignments.find(a => a.id === editWatchAssignmentId);
     if (selectedAssignment) {
         editResultForm.setValue("assessmentTitle", selectedAssignment.title, {shouldValidate: true});
          if (selectedAssignment.meetingNumber) {
             editResultForm.setValue("meetingNumber", selectedAssignment.meetingNumber, {shouldValidate: true});
         } else {
             editResultForm.setValue("meetingNumber", undefined, {shouldValidate: true});
         }
     }
  }, [editWatchAssignmentId, assignments, editResultForm]);

  useEffect(() => {
    if (selectedResult && isEditDialogOpen) {
      const initialClassId = selectedResult.classId;
      const initialSubjectId = selectedResult.subjectId;

      if (initialClassId) {
        setFilteredStudents(students.filter(s => s.classId === initialClassId));
      }

      if (initialClassId && initialSubjectId) {
        setFilteredAssignments(assignments.filter(a => a.classId === initialClassId && a.subjectId === initialSubjectId));
      }

      editResultForm.reset({
        id: selectedResult.id,
        classId: initialClassId,
        studentId: selectedResult.studentId,
        subjectId: initialSubjectId,
        assessmentType: selectedResult.assessmentType,
        assessmentTitle: selectedResult.assessmentTitle,
        score: selectedResult.score,
        dateOfAssessment: selectedResult.dateOfAssessment.toDate(),
        feedback: selectedResult.feedback || "",
        assignmentId: selectedResult.assignmentId || undefined,
        meetingNumber: selectedResult.meetingNumber || undefined,
      });
    }
  }, [selectedResult, isEditDialogOpen, editResultForm, students, assignments]);

  const getDenormalizedNames = (data: ResultFormValues | EditResultFormValues) => {
    const student = students.find(s => s.id === data.studentId);
    const aClass = classes.find(c => c.id === data.classId);
    const subject = subjects.find(s => s.id === data.subjectId);
    return {
      studentName: student?.name,
      className: aClass?.name || student?.className,
      subjectName: subject?.name,
    };
  };

  const handleAddResultSubmit: SubmitHandler<ResultFormValues> = async (data) => {
    addResultForm.clearErrors();
    if (!user) {
      toast({ title: "Aksi Gagal", description: "Pengguna tidak terautentikasi.", variant: "destructive" });
      return;
    }
    const { studentName, className, subjectName } = getDenormalizedNames(data);
    if (!studentName || !className || !subjectName) {
      addResultForm.setError("studentId", { type: "manual", message: !studentName ? "Siswa tidak valid." : ""});
      addResultForm.setError("classId", { type: "manual", message: !className ? "Kelas tidak valid." : ""});
      addResultForm.setError("subjectId", { type: "manual", message: !subjectName ? "Subjek tidak valid." : ""});
      toast({ title: "Data Tidak Lengkap", description: "Pastikan siswa, kelas, dan subjek valid.", variant: "destructive" });
      return;
    }

    const resultData: any = {
        ...data,
        studentName,
        className,
        subjectName,
        dateOfAssessment: Timestamp.fromDate(startOfDay(data.dateOfAssessment)),
        recordedById: user.uid,
        recordedByName: user.displayName || user.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };
    if (data.meetingNumber === undefined || data.meetingNumber === null || isNaN(data.meetingNumber)) {
        delete resultData.meetingNumber;
    }
    if (!data.assignmentId) {
        delete resultData.assignmentId;
    }

    try {
      await addDoc(collection(db, "results"), resultData);
      toast({ title: "Hasil Belajar Ditambahkan", description: "Data berhasil disimpan." });
      setIsAddDialogOpen(false);
      addResultForm.reset({ classId: undefined, studentId: undefined, subjectId: undefined, assessmentType: undefined, dateOfAssessment: new Date(), score: 0, assessmentTitle: "", feedback: "", meetingNumber: undefined, assignmentId: undefined });
      fetchResults();
    } catch (error: any) {
      console.error("Error adding result:", error);
      toast({ title: "Gagal Menambahkan Hasil Belajar", variant: "destructive" });
    }
  };

  const handleEditResultSubmit: SubmitHandler<EditResultFormValues> = async (data) => {
    if (!selectedResult || !user) {
        toast({ title: "Aksi Gagal", description: "Data atau pengguna tidak valid.", variant: "destructive" });
        return;
    }
    editResultForm.clearErrors();
    const { studentName, className, subjectName } = getDenormalizedNames(data);
    if (!studentName || !className || !subjectName) {
      editResultForm.setError("studentId", { type: "manual", message: !studentName ? "Siswa tidak valid." : ""});
      editResultForm.setError("classId", { type: "manual", message: !className ? "Kelas tidak valid." : ""});
      editResultForm.setError("subjectId", { type: "manual", message: !subjectName ? "Subjek tidak valid." : ""});
      toast({ title: "Data Tidak Lengkap", description: "Pastikan siswa, kelas, dan subjek valid.", variant: "destructive" });
      return;
    }

    const resultData: any = {
        ...data,
        studentName,
        className,
        subjectName,
        dateOfAssessment: Timestamp.fromDate(startOfDay(data.dateOfAssessment)),
        updatedAt: serverTimestamp(),
    };
    if (data.meetingNumber === undefined || data.meetingNumber === null || isNaN(data.meetingNumber)) {
        resultData.meetingNumber = null;
    }
    if (!data.assignmentId) {
        resultData.assignmentId = null;
    }

    try {
      const resultDocRef = doc(db, "results", data.id);
      await updateDoc(resultDocRef, resultData);
      toast({ title: "Hasil Belajar Diperbarui", description: "Data berhasil diperbarui." });
      setIsEditDialogOpen(false);
      setSelectedResult(null);
      fetchResults();
    } catch (error) {
      console.error("Error editing result:", error);
      toast({ title: "Gagal Memperbarui Hasil Belajar", variant: "destructive" });
    }
  };

  const handleDeleteResult = async (resultId: string) => {
    try {
      await deleteDoc(doc(db, "results", resultId));
      toast({ title: "Hasil Belajar Dihapus", description: "Data berhasil dihapus." });
      setSelectedResult(null);
      fetchResults();
    } catch (error) {
      console.error("Error deleting result:", error);
      toast({ title: "Gagal Menghapus Hasil Belajar", variant: "destructive" });
    }
  };

  const openViewDetailDialog = (result: ResultData) => {
    setSelectedResultForDetail(result);
    setIsViewDetailDialogOpen(true);
  };

  const openEditDialog = (result: ResultData) => {
    setSelectedResult(result);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (result: ResultData) => {
    setSelectedResult(result);
  };

  const canManageResults = role === "admin" || role === "guru";

  const filteredAndSearchedResults = useMemo(() => {
    let tempResults = results;

    if (canManageResults) {
        if (selectedClassFilterForTable !== "all") {
            tempResults = tempResults.filter(result => result.classId === selectedClassFilterForTable);
        }
        if (selectedSubjectFilterForTable !== "all") {
            tempResults = tempResults.filter(result => result.subjectId === selectedSubjectFilterForTable);
        }
    }

    if (selectedAssessmentTypeFilter !== "all") {
      tempResults = tempResults.filter(result => result.assessmentType === selectedAssessmentTypeFilter);
    }

    if (canManageResults && searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      tempResults = tempResults.filter(result =>
        result.studentName?.toLowerCase().includes(lowerSearch) ||
        result.className?.toLowerCase().includes(lowerSearch) ||
        result.subjectName?.toLowerCase().includes(lowerSearch) ||
        result.assessmentTitle?.toLowerCase().includes(lowerSearch) ||
        result.assessmentType?.toLowerCase().includes(lowerSearch)
      );
    }
    return tempResults;
  }, [results, selectedClassFilterForTable, selectedSubjectFilterForTable, selectedAssessmentTypeFilter, searchTerm, canManageResults]);

  const totalPages = Math.ceil(filteredAndSearchedResults.length / ITEMS_PER_PAGE);
  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ITEMS_PER_PAGE;
    return filteredAndSearchedResults.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, filteredAndSearchedResults]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedClassFilterForTable, selectedSubjectFilterForTable, selectedAssessmentTypeFilter]);

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

  const handleExportSemesterResults = async (formatType: 'xlsx' | 'pdf') => {
    if (!exportClassId || !exportSubjectId || !exportAssessmentType) {
      toast({ title: "Pilihan Tidak Lengkap", description: "Harap pilih kelas, mata pelajaran, dan tipe asesmen untuk ekspor.", variant: "warning" });
      return;
    }
    setIsExporting(true);
    
    const selectedClass = classes.find(c => c.id === exportClassId);
    const selectedSubject = subjects.find(s => s.id === exportSubjectId);
    
    const fileNameBase = `Hasil_${selectedClass?.name?.replace(/\s+/g, '_') || 'Kelas'}_${selectedSubject?.name?.replace(/\s+/g, '_') || 'Mapel'}_${exportAssessmentType.replace(/\s+/g, '_')}`;

    try {
      const studentsInClassQuery = query(collection(db, "users"), where("role", "==", "siswa"), where("classId", "==", exportClassId), orderBy("name", "asc"));
      const studentsSnapshot = await getDocs(studentsInClassQuery);
      const studentsData = studentsSnapshot.docs.map(doc => ({id: doc.id, name: doc.data().name}));

      const dataToExport = [];

      for (const student of studentsData) {
        const resultsQuery = query(
          collection(db, "results"),
          where("studentId", "==", student.id),
          where("classId", "==", exportClassId),
          where("subjectId", "==", exportSubjectId),
          where("assessmentType", "==", exportAssessmentType),
          orderBy("dateOfAssessment", "desc")
        );
        const resultsSnapshot = await getDocs(resultsQuery);
        if (resultsSnapshot.empty) {
            dataToExport.push({
                "Nama Siswa": student.name,
                "Judul Asesmen": "-",
                "Nilai": "-",
                "Tanggal Penilaian": "-",
                "Feedback": "Belum ada hasil",
            });
        } else {
            resultsSnapshot.forEach(doc => {
                const result = doc.data() as ResultData;
                dataToExport.push({
                    "Nama Siswa": result.studentName,
                    "Judul Asesmen": `${result.assessmentTitle}${result.meetingNumber ? ` (P${result.meetingNumber})` : ''}`,
                    "Nilai": result.score,
                    "Tanggal Penilaian": format(result.dateOfAssessment.toDate(), "dd MMM yyyy", { locale: indonesiaLocale }),
                    "Feedback": result.feedback || "-",
                });
            });
        }
      }
      
      if (dataToExport.length === 0) {
          toast({ title: "Tidak Ada Data", description: "Tidak ada hasil yang cocok dengan kriteria ekspor.", variant: "info" });
          setIsExporting(false);
          return;
      }


      if (formatType === 'xlsx') {
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Hasil Semester");
         XLSX.utils.sheet_add_aoa(worksheet, [
          [`Laporan Hasil Belajar Semester`],
          [`Kelas: ${selectedClass?.name || '-'}`],
          [`Mata Pelajaran: ${selectedSubject?.name || '-'}`],
          [`Tipe Asesmen: ${exportAssessmentType}`],
          [`Tanggal Ekspor: ${format(new Date(), "dd MMMM yyyy HH:mm", { locale: indonesiaLocale })}`],
          [] 
        ], { origin: "A1" });
        const cols = Object.keys(dataToExport[0] || {}).map(key => ({ wch: Math.max(20, key.length + 5) }));
        worksheet['!cols'] = cols;
        XLSX.writeFile(workbook, `${fileNameBase}.xlsx`);
        toast({ title: "Ekspor Excel Berhasil", description: `${fileNameBase}.xlsx telah diunduh.` });
      } else if (formatType === 'pdf') {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(14);
        doc.text(`Laporan Hasil Belajar Semester`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Kelas: ${selectedClass?.name || '-'}`, 14, 22);
        doc.text(`Mata Pelajaran: ${selectedSubject?.name || '-'}`, 14, 29);
        doc.text(`Tipe Asesmen: ${exportAssessmentType}`, 14, 36);
        doc.text(`Tanggal Ekspor: ${format(new Date(), "dd MMMM yyyy HH:mm", { locale: indonesiaLocale })}`, 14, 43);

        autoTable(doc, {
          startY: 50,
          head: [Object.keys(dataToExport[0])],
          body: dataToExport.map(row => Object.values(row)),
          theme: 'grid',
          headStyles: { fillColor: [22, 160, 133] },
          styles: { fontSize: 8, cellPadding: 1.5 },
          columnStyles: { 
            0: { cellWidth: 35 }, // Nama Siswa
            1: { cellWidth: 50 }, // Judul
            2: { cellWidth: 15 }, // Nilai
            3: { cellWidth: 25 }, // Tgl
            4: { cellWidth: 'auto'}, // Feedback
          }
        });
        doc.save(`${fileNameBase}.pdf`);
        toast({ title: "Ekspor PDF Berhasil", description: `${fileNameBase}.pdf telah diunduh.` });
      }
    } catch (error) {
      console.error("Error exporting semester results:", error);
      toast({ title: `Gagal Mengekspor ke ${formatType.toUpperCase()}`, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };


  if (authLoading || (isLoadingData && (role === "admin" || role === "guru"))) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Manajemen Hasil Belajar</h1>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center p-8">
              <LottieLoader width={32} height={32} className="mr-2" />
              Memuat data pendukung...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!role || !["admin", "guru", "siswa", "orangtua"].includes(role)) {
    return (
         <div className="space-y-6">
            <h1 className="text-3xl font-bold font-headline">Hasil Belajar</h1>
             <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
                <CardContent className="pt-6">
                    <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                        <AlertCircle className="w-12 h-12 mb-4 text-destructive" />
                        <p className="font-semibold">Akses Ditolak.</p>
                        <p>Anda tidak memiliki izin untuk mengakses halaman ini.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
  }

  let pageTitle = "Manajemen Hasil Belajar";
  let pageDescription = "Catat, lihat, dan kelola nilai serta rapor siswa.";
  if (role === "siswa") {
      pageTitle = `Hasil Belajar Saya (${user?.displayName || 'Siswa'})`;
      pageDescription = "Lihat daftar nilai dan hasil asesmen Anda.";
  } else if (role === "orangtua") {
      pageTitle = `Hasil Belajar Anak (${user?.linkedStudentName || 'Siswa'})`;
      pageDescription = `Lihat daftar nilai dan hasil asesmen ${user?.linkedStudentName || 'anak Anda'}.`;
      if (!user?.linkedStudentId) {
           pageDescription = "Akun Anda belum terhubung dengan data siswa. Hubungi admin sekolah.";
      }
  }

  const renderResultFormFields = (formInstance: typeof addResultForm | typeof editResultForm, dialogType: 'add' | 'edit') => {
    const currentClassId = formInstance.watch("classId");
    const currentSubjectId = formInstance.watch("subjectId");
    const currentAssignmentId = formInstance.watch("assignmentId");

    const studentsForDropdown = dialogType === 'add'
        ? filteredStudents
        : (editWatchClassId ? students.filter(s => s.classId === editWatchClassId) : (role === 'admin' || role === 'guru' ? students : []));

    const assignmentsForDropdown = (currentClassId && currentSubjectId)
        ? assignments.filter(a => a.classId === currentClassId && a.subjectId === currentSubjectId)
        : [];

    return (
        <>
            <div>
                <Label htmlFor={`${dialogType}-result-classId`}>Kelas</Label>
                <Select onValueChange={(value) => {formInstance.setValue("classId", value, { shouldValidate: true }); formInstance.setValue("studentId", undefined, { shouldValidate: true }); formInstance.setValue("assignmentId", undefined, { shouldValidate: true });}} value={currentClassId || undefined}>
                    <SelectTrigger id={`${dialogType}-result-classId`} className="mt-1"><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                    <SelectContent>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                {formInstance.formState.errors.classId && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.classId.message}</p>}
            </div>
            <div>
                <Label htmlFor={`${dialogType}-result-studentId`}>Siswa</Label>
                <Select onValueChange={(value) => formInstance.setValue("studentId", value, { shouldValidate: true })} value={formInstance.watch("studentId") || undefined} disabled={!currentClassId || studentsForDropdown.length === 0}>
                    <SelectTrigger id={`${dialogType}-result-studentId`} className="mt-1"><SelectValue placeholder={!currentClassId ? "Pilih kelas dulu" : (studentsForDropdown.length === 0 ? "Tidak ada siswa di kelas ini" : "Pilih siswa")} /></SelectTrigger>
                    <SelectContent>
                    {studentsForDropdown.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                {formInstance.formState.errors.studentId && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.studentId.message}</p>}
            </div>
            <div>
                <Label htmlFor={`${dialogType}-result-subjectId`}>Mata Pelajaran</Label>
                <Select onValueChange={(value) => {formInstance.setValue("subjectId", value, { shouldValidate: true }); formInstance.setValue("assignmentId", undefined, {shouldValidate: true});}} value={currentSubjectId || undefined}>
                    <SelectTrigger id={`${dialogType}-result-subjectId`} className="mt-1"><SelectValue placeholder="Pilih mata pelajaran" /></SelectTrigger>
                    <SelectContent>
                    {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                {formInstance.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.subjectId.message}</p>}
            </div>

            <div>
                <Label htmlFor={`${dialogType}-result-assignmentId`}>Tugas Terkait (Opsional)</Label>
                <Select
                    onValueChange={(value) => {
                        formInstance.setValue("assignmentId", value === "manual" ? undefined : value, { shouldValidate: true });
                        const selectedAssignment = assignments.find(a => a.id === value);
                        if (selectedAssignment) {
                            formInstance.setValue("assessmentTitle", selectedAssignment.title, {shouldValidate: true});
                            formInstance.setValue("meetingNumber", selectedAssignment.meetingNumber, {shouldValidate: true});
                        } else {
                            if (!formInstance.formState.dirtyFields.assessmentTitle) {
                                formInstance.setValue("assessmentTitle", "", {shouldValidate: true});
                            }
                             if (!formInstance.formState.dirtyFields.meetingNumber) {
                                formInstance.setValue("meetingNumber", undefined, {shouldValidate: true});
                            }
                        }
                    }}
                    value={currentAssignmentId || "manual"}
                    disabled={!currentClassId || !currentSubjectId}
                >
                    <SelectTrigger id={`${dialogType}-result-assignmentId`} className="mt-1">
                        <SelectValue placeholder={!currentClassId || !currentSubjectId ? "Pilih kelas & mapel dulu" : "Pilih tugas atau input manual"}/>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="manual">Input Manual Judul Asesmen</SelectItem>
                        {assignmentsForDropdown.map(a => (
                            <SelectItem key={a.id} value={a.id}>
                                {a.title} {a.meetingNumber ? `(P${a.meetingNumber})` : ''}
                            </SelectItem>
                        ))}
                         {assignmentsForDropdown.length === 0 && currentClassId && currentSubjectId && <SelectItem value="no-assignments" disabled>Tidak ada tugas untuk mapel/kelas ini</SelectItem>}
                    </SelectContent>
                </Select>
            </div>

            <div>
                <Label htmlFor={`${dialogType}-result-assessmentTitle`}>Judul/Nama Asesmen</Label>
                <Input id={`${dialogType}-result-assessmentTitle`} {...formInstance.register("assessmentTitle")} className="mt-1" disabled={!!currentAssignmentId && currentAssignmentId !== "manual"} />
                {formInstance.formState.errors.assessmentTitle && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.assessmentTitle.message}</p>}
            </div>
            <div>
                <Label htmlFor={`${dialogType}-result-meetingNumber`}>Pertemuan Ke- (Opsional)</Label>
                <Input id={`${dialogType}-result-meetingNumber`} type="number" {...formInstance.register("meetingNumber")} className="mt-1" placeholder="Contoh: 3" disabled={!!currentAssignmentId && currentAssignmentId !== "manual" && assignments.find(a=>a.id === currentAssignmentId)?.meetingNumber !== undefined}/>
                {formInstance.formState.errors.meetingNumber && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.meetingNumber.message}</p>}
            </div>

            <div>
                <Label htmlFor={`${dialogType}-result-assessmentType`}>Tipe Asesmen</Label>
                <Select onValueChange={(value) => formInstance.setValue("assessmentType", value as AssessmentType, { shouldValidate: true })} value={formInstance.watch("assessmentType")}>
                    <SelectTrigger id={`${dialogType}-result-assessmentType`} className="mt-1"><SelectValue placeholder="Pilih tipe asesmen" /></SelectTrigger>
                    <SelectContent>
                    {ASSESSMENT_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                    </SelectContent>
                </Select>
                {formInstance.formState.errors.assessmentType && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.assessmentType.message}</p>}
            </div>

             <div>
                <Label htmlFor={`${dialogType}-result-score`}>Nilai</Label>
                <Input id={`${dialogType}-result-score`} type="number" {...formInstance.register("score")} className="mt-1" />
                {formInstance.formState.errors.score && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.score.message}</p>}
            </div>

            <div>
              <Label htmlFor={`${dialogType}-result-dateOfAssessment`}>Tanggal Asesmen</Label>
              <Controller
                control={formInstance.control}
                name="dateOfAssessment"
                render={({ field }) => (
                  <CalendarDatePicker
                    id={`${dialogType}-result-dateOfAssessment-picker`}
                    date={{ from: field.value, to: field.value }}
                    onDateSelect={(range) => field.onChange(range.from)}
                    numberOfMonths={1}
                    closeOnSelect={true}
                    yearsRange={5}
                    className="mt-1 w-full"
                    variant="outline"
                  />
                )}
              />
              {formInstance.formState.errors.dateOfAssessment && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.dateOfAssessment.message}</p>}
            </div>
            <div>
                <Label htmlFor={`${dialogType}-result-feedback`}>Umpan Balik (Opsional)</Label>
                <Textarea id={`${dialogType}-result-feedback`} {...formInstance.register("feedback")} className="mt-1" />
            </div>
        </>
    );
  };

  const studentNameForTitle = role === "siswa" ? user?.displayName : (role === "orangtua" ? user?.linkedStudentName : null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">{pageTitle}</h1>
        <p className="text-muted-foreground">{pageDescription}</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <BarChart3 className="h-6 w-6 text-primary" />
            <span>Daftar Hasil Belajar</span>
          </CardTitle>
            {canManageResults && (
              <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
                  setIsAddDialogOpen(isOpen);
                  if (!isOpen) { addResultForm.reset({ classId: undefined, studentId: undefined, subjectId: undefined, assessmentType: undefined, dateOfAssessment: new Date(), score: 0, assessmentTitle: "", feedback: "", meetingNumber: undefined, assignmentId: undefined }); addResultForm.clearErrors(); setFilteredStudents([]); setFilteredAssignments([]);}
              }}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={() => {if(classes.length === 0 && students.length === 0 && subjects.length === 0 && (role === 'admin' || role === 'guru')) fetchDropdownData();}}>
                      <PlusCircle className="mr-2 h-4 w-4" /> Tambah Hasil
                  </Button>
                </DialogTrigger>
                <DialogContent className="flex flex-col max-h-[90vh] sm:max-w-lg">
                  <DialogHeader>
                      <DialogTitle>Tambah Hasil Belajar Baru</DialogTitle>
                      <DialogDescription>Isi detail nilai siswa.</DialogDescription>
                  </DialogHeader>
                  <Form {...addResultForm}>
                      <form
                          id="addResultDialogForm"
                          onSubmit={addResultForm.handleSubmit(handleAddResultSubmit)}
                          className="flex flex-col overflow-hidden flex-1"
                      >
                        <div className="space-y-4 py-4 pr-2 overflow-y-auto flex-1">
                            {renderResultFormFields(addResultForm, 'add')}
                        </div>
                         <DialogFooter className="pt-4 border-t mt-auto">
                            <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                            <Button type="submit" form="addResultDialogForm" disabled={addResultForm.formState.isSubmitting}>{addResultForm.formState.isSubmitting && <LottieLoader width={16} height={16} className="mr-2" />}{addResultForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Hasil"}</Button>
                        </DialogFooter>
                      </form>
                  </Form>
                </DialogContent>
              </Dialog>
            )}
        </CardHeader>
        <CardContent>
         { (role === "admin" || role === "guru") && (
            <div className="my-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 items-end">
                <div className="relative md:col-span-2">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari siswa, kelas, mapel, asesmen..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 w-full"
                  />
                </div>
                 <div className="w-full">
                    <Label htmlFor="filter-class" className="sr-only">Filter Kelas</Label>
                    <Select value={selectedClassFilterForTable} onValueChange={setSelectedClassFilterForTable} disabled={isLoadingData}>
                        <SelectTrigger id="filter-class"><SelectValue placeholder="Filter Kelas" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Semua Kelas</SelectItem>
                            {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-full">
                    <Label htmlFor="filter-subject" className="sr-only">Filter Mata Pelajaran</Label>
                    <Select value={selectedSubjectFilterForTable} onValueChange={setSelectedSubjectFilterForTable} disabled={isLoadingData}>
                        <SelectTrigger id="filter-subject"><SelectValue placeholder="Filter Mapel" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Semua Mapel</SelectItem>
                            {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-full sm:col-span-2 md:col-span-4">
                  <Label htmlFor="filter-assessment-type" className="sr-only">Filter Tipe Asesmen</Label>
                  <Select
                    value={selectedAssessmentTypeFilter}
                    onValueChange={(value) => setSelectedAssessmentTypeFilter(value as AssessmentType | "all")}
                  >
                    <SelectTrigger id="filter-assessment-type">
                        <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                        <SelectValue placeholder="Filter Tipe Asesmen" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Semua Tipe</SelectItem>
                        {ASSESSMENT_TYPES.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
            </div>
            )}
          {isLoadingResults ? (
            <div className="space-y-2 mt-4">{[...Array(ITEMS_PER_PAGE)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : currentTableData.length > 0 ? (
            <>
            <div className="overflow-x-auto mt-4">
              <Table className={cn(isMobile && "table-fixed w-full")}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={cn(isMobile ? "w-10 px-2 text-center" : "w-[50px]")}>No.</TableHead>
                    <TableHead className={cn(isMobile && "px-2")}>
                        {(role === 'siswa' || role === 'orangtua') ? 'Judul Asesmen' : 'Siswa'}
                    </TableHead>
                    {isMobile ? (
                        <>
                            <TableHead className="px-2">Mapel</TableHead>
                            <TableHead className="w-16 px-1 text-center">Nilai</TableHead>
                        </>
                    ) : (
                      <>
                        {(role === 'siswa' || role === 'orangtua') ? (
                          <>
                            <TableHead>Mapel</TableHead>
                            <TableHead>Link Tugas</TableHead>
                            <TableHead>Feedback Guru</TableHead>
                            <TableHead>Nilai</TableHead>
                          </>
                        ) : ( 
                          <>
                            {canManageResults && <TableHead>Kelas</TableHead>}
                            {(role === 'admin' || role === 'guru') && <TableHead>Mapel</TableHead>}
                            <TableHead>Asesmen</TableHead>
                            <TableHead>Nilai</TableHead>
                            <TableHead>Feedback Guru</TableHead>
                            <TableHead>Tanggal Asesmen</TableHead>
                          </>
                        )}
                      </>
                    )}
                     <TableHead className={cn("text-right", isMobile ? "w-12 px-1" : "w-16")}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentTableData.map((result, index) => (
                    <TableRow key={result.id}>
                      {isMobile ? (
                        <>
                          <TableCell className="px-2 text-center">{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                          <TableCell className="font-medium truncate px-2" title={(role === 'siswa' || role === 'orangtua') ? result.assessmentTitle : result.studentName}>
                            {(role === 'siswa' || role === 'orangtua')
                              ? `${result.assessmentTitle}${result.meetingNumber ? ` (P${result.meetingNumber})` : ''}`
                              : result.studentName
                            }
                          </TableCell>
                          <TableCell className="truncate px-2" title={result.subjectName || undefined}>
                            {result.subjectName || "-"}
                          </TableCell>
                          <TableCell className="text-center px-1">{result.score}</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                          <TableCell className="font-medium truncate" title={(role === 'siswa' || role === 'orangtua') ? result.assessmentTitle : result.studentName}>
                            {(role === 'siswa' || role === 'orangtua')
                              ? `${result.assessmentTitle}${result.meetingNumber ? ` (P${result.meetingNumber})` : ''}`
                              : result.studentName
                            }
                          </TableCell>
                          {(role === 'siswa' || role === 'orangtua') ? (
                            <>
                              <TableCell className="truncate" title={result.subjectName || undefined}>{result.subjectName || "-"}</TableCell>
                              <TableCell>
                                {result.studentSubmissionLink ? (
                                  <Button variant="link" asChild className="p-0 h-auto text-sm">
                                    <Link href={result.studentSubmissionLink} target="_blank" rel="noopener noreferrer">
                                      <LinkIcon className="mr-1 h-3 w-3" />Lihat
                                    </Link>
                                  </Button>
                                ) : (result.assignmentId ? <span className="text-xs text-muted-foreground italic">N/A</span> : "-")}
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate" title={result.feedback || undefined}>{result.feedback || "-"}</TableCell>
                              <TableCell>{result.score}</TableCell>
                            </>
                          ) : (
                            <>
                              {canManageResults && <TableCell className="truncate" title={result.className}>{result.className}</TableCell>}
                              {(role === 'admin' || role === 'guru') && <TableCell className="truncate" title={result.subjectName}>{result.subjectName}</TableCell>}
                              <TableCell className="truncate" title={result.assessmentTitle}>
                                {result.assessmentTitle} ({result.assessmentType})
                                {result.meetingNumber && <span className="text-xs text-muted-foreground ml-1">(P{result.meetingNumber})</span>}
                              </TableCell>
                              <TableCell>{result.score}</TableCell>
                              <TableCell className="max-w-[200px] truncate" title={result.feedback || undefined}>{result.feedback || "-"}</TableCell>
                              <TableCell>
                                {format(result.dateOfAssessment.toDate(), "dd MMM yyyy", { locale: indonesiaLocale })}
                              </TableCell>
                            </>
                          )}
                        </>
                      )}
                      <TableCell className={cn("text-right", isMobile ? "px-1" : "")}>
                           <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Aksi untuk hasil ${result.studentName}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openViewDetailDialog(result)}>
                                <Eye className="mr-2 h-4 w-4" />
                                Lihat Detail
                              </DropdownMenuItem>
                              {canManageResults && (
                                <>
                                <DropdownMenuItem onClick={() => openEditDialog(result)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  <span>Edit</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem
                                      onSelect={(e) => {e.preventDefault(); openDeleteDialog(result);}}
                                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      <span>Hapus</span>
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  {selectedResult && selectedResult.id === result.id && (
                                    <AlertDialogContent>
                                      <AlertDialogHead>
                                        <AlertDialogT>Apakah Anda yakin?</AlertDialogT>
                                        <AlertDialogDesc>
                                          Tindakan ini akan menghapus hasil belajar <span className="font-semibold">{selectedResult?.assessmentTitle}</span> untuk siswa <span className="font-semibold">{selectedResult?.studentName}</span>.
                                        </AlertDialogDesc>
                                      </AlertDialogHead>
                                      <AlertDialogFoot>
                                        <AlertDialogCancel onClick={() => setSelectedResult(null)}>Batal</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteResult(selectedResult.id)}>Ya, Hapus Hasil</AlertDialogAction>
                                      </AlertDialogFoot>
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
                {role === 'orangtua' && !user?.linkedStudentId ? "Akun Anda belum terhubung ke data siswa. Hubungi administrator." :
                 (role === 'siswa' && (!user || !user.uid)) ? "Tidak dapat memuat data siswa. Silakan coba lagi." :
                 searchTerm || selectedAssessmentTypeFilter !== "all" || selectedClassFilterForTable !== "all" || selectedSubjectFilterForTable !== "all"
                 ? "Tidak ada hasil belajar yang cocok dengan filter atau pencarian Anda."
                 : "Belum ada data hasil belajar yang sesuai."}
            </div>
          )}
        </CardContent>
      </Card>

      {canManageResults && (
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <FileDown className="h-6 w-6 text-primary" />
              <span>Ekspor Hasil Belajar Semester</span>
            </CardTitle>
            <ShadCardDescription>Pilih kriteria untuk mengekspor laporan hasil belajar per kelas.</ShadCardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <Label htmlFor="export-classId">Kelas</Label>
              <Select value={exportClassId} onValueChange={setExportClassId} disabled={isLoadingData || isExporting}>
                <SelectTrigger id="export-classId" className="mt-1"><SelectValue placeholder={isLoadingData ? "Memuat..." : "Pilih kelas"} /></SelectTrigger>
                <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="export-subjectId">Mata Pelajaran</Label>
              <Select value={exportSubjectId} onValueChange={setExportSubjectId} disabled={isLoadingData || isExporting}>
                <SelectTrigger id="export-subjectId" className="mt-1"><SelectValue placeholder={isLoadingData ? "Memuat..." : "Pilih mapel"} /></SelectTrigger>
                <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="export-assessmentType">Tipe Asesmen</Label>
              <Select value={exportAssessmentType} onValueChange={(value) => setExportAssessmentType(value as AssessmentType)} disabled={isExporting}>
                <SelectTrigger id="export-assessmentType" className="mt-1"><SelectValue placeholder="Pilih tipe asesmen" /></SelectTrigger>
                <SelectContent>{ASSESSMENT_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
              </Select>
            </div>
             <div className="flex flex-col sm:flex-row gap-2 lg:col-span-1 justify-end pt-4">
                <Button onClick={() => handleExportSemesterResults('xlsx')} disabled={isExporting || !exportClassId || !exportSubjectId || !exportAssessmentType} className="w-full sm:w-auto">
                {isExporting && <LottieLoader width={16} height={16} className="mr-2" />} Ekspor Excel
                </Button>
                <Button onClick={() => handleExportSemesterResults('pdf')} disabled={isExporting || !exportClassId || !exportSubjectId || !exportAssessmentType} className="w-full sm:w-auto">
                {isExporting && <LottieLoader width={16} height={16} className="mr-2" />} Ekspor PDF
                </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {canManageResults && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
            setIsEditDialogOpen(isOpen);
            if (!isOpen) { setSelectedResult(null); editResultForm.clearErrors(); setFilteredStudents([]); setFilteredAssignments([]);}
        }}>
          <DialogContent className="flex flex-col max-h-[90vh] sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>Edit Hasil Belajar</DialogTitle>
                <DialogDescription>Perbarui detail nilai siswa.</DialogDescription>
            </DialogHeader>
            {selectedResult && (
                <Form {...editResultForm}>
                  <form
                      id="editResultDialogForm"
                      onSubmit={editResultForm.handleSubmit(handleEditResultSubmit)}
                      className="flex flex-col overflow-hidden flex-1"
                  >
                    <Input type="hidden" {...editResultForm.register("id")} />
                    <div className="space-y-4 py-4 pr-2 overflow-y-auto flex-1">
                        {renderResultFormFields(editResultForm, 'edit')}
                    </div>
                    <DialogFooter className="pt-4 border-t mt-auto">
                        <DialogClose asChild><Button type="button" variant="outline" onClick={() => {setIsEditDialogOpen(false); setSelectedResult(null);}}>Batal</Button></DialogClose>
                        <Button type="submit" form="editResultDialogForm" disabled={editResultForm.formState.isSubmitting}>{editResultForm.formState.isSubmitting && <LottieLoader width={16} height={16} className="mr-2" />}{editResultForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}</Button>
                    </DialogFooter>
                  </form>
                </Form>
            )}
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={isViewDetailDialogOpen} onOpenChange={(isOpen) => {
          setIsViewDetailDialogOpen(isOpen);
          if (!isOpen) setSelectedResultForDetail(null);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detail Hasil Belajar</DialogTitle>
            <DialogDescription>Informasi lengkap mengenai hasil asesmen.</DialogDescription>
          </DialogHeader>
          {selectedResultForDetail && (
            <div className="space-y-3 py-4 max-h-[60vh] overflow-y-auto pr-2 text-sm">
              <div><Label className="text-muted-foreground">Nama Siswa:</Label><p className="font-medium">{selectedResultForDetail.studentName}</p></div>
              <div><Label className="text-muted-foreground">Kelas:</Label><p className="font-medium">{selectedResultForDetail.className}</p></div>
              <div><Label className="text-muted-foreground">Mata Pelajaran:</Label><p className="font-medium">{selectedResultForDetail.subjectName}</p></div>
              <div><Label className="text-muted-foreground">Judul Asesmen:</Label><p className="font-medium">{selectedResultForDetail.assessmentTitle}</p></div>
              {selectedResultForDetail.meetingNumber && <div><Label className="text-muted-foreground">Pertemuan Ke-:</Label><p className="font-medium">{selectedResultForDetail.meetingNumber}</p></div>}
              <div><Label className="text-muted-foreground">Tipe Asesmen:</Label><p className="font-medium">{selectedResultForDetail.assessmentType}</p></div>
              <div><Label className="text-muted-foreground">Nilai:</Label><p className="font-semibold text-lg">{selectedResultForDetail.score}</p></div>
              <div>
                <Label className="text-muted-foreground">Tanggal Asesmen:</Label>
                <p className="font-medium">{format(selectedResultForDetail.dateOfAssessment.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale })}</p>
              </div>
              {selectedResultForDetail.feedback && (
                <div><Label className="text-muted-foreground">Umpan Balik Guru:</Label><p className="whitespace-pre-line bg-muted/50 p-2 rounded-md">{selectedResultForDetail.feedback}</p></div>
              )}
              {selectedResultForDetail.studentSubmissionLink && (
                <div>
                  <Label className="text-muted-foreground">Link Pengumpulan Siswa:</Label>
                  <Button variant="link" asChild className="p-0 h-auto block">
                    <Link href={selectedResultForDetail.studentSubmissionLink} target="_blank" rel="noopener noreferrer">
                      <LinkIcon className="inline-block mr-1 h-3.5 w-3.5" /> Lihat File
                    </Link>
                  </Button>
                </div>
              )}
              {selectedResultForDetail.submissionNotes && (
                 <div><Label className="text-muted-foreground">Catatan Pengumpulan Siswa:</Label><p className="whitespace-pre-line text-xs bg-muted/30 p-2 rounded-md">{selectedResultForDetail.submissionNotes}</p></div>
              )}
              {selectedResultForDetail.recordedByName && (
                <div><Label className="text-muted-foreground">Dicatat Oleh:</Label><p className="font-medium">{selectedResultForDetail.recordedByName}</p></div>
              )}
              {selectedResultForDetail.updatedAt && (
                <div><Label className="text-muted-foreground">Terakhir Diperbarui:</Label><p className="font-medium">{format(selectedResultForDetail.updatedAt.toDate(), "dd MMMM yyyy, HH:mm", { locale: indonesiaLocale })}</p></div>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Tutup</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
