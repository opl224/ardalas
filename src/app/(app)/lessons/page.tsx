
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
import { BookCopy, PlusCircle, Edit, Trash2, LogIn, AlertCircle, MoreVertical, Eye, Search, Filter as FilterIcon } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
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
  limit,
  documentId,
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { format, parse, getDay, isWithinInterval, isValid } from "date-fns"; 
import { id as indonesiaLocale } from "date-fns/locale"; 
import { cn } from "@/lib/utils";
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
import LottieLoader from "@/components/ui/LottieLoader";
import { useSidebar } from "@/components/ui/sidebar";


// Minimal interfaces for dropdowns
interface SubjectMin { id: string; name: string; }
interface ClassMin { id: string; name: string; }
interface TeacherMin { id: string; name: string; } // Represents documents from 'teachers' collection

interface LessonData {
  id: string;
  subjectId: string;
  subjectName?: string; // Denormalized
  classId: string;
  className?: string; // Denormalized
  teacherId: string; // This should be the Document ID from the 'teachers' collection
  teacherName?: string; // Denormalized
  dayOfWeek: string; // e.g., "Senin", "Selasa"
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  topic?: string;
  materials?: string;
  createdAt?: Timestamp;
}

const DAYS_OF_WEEK = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const DAY_NAMES_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM format

const baseLessonObjectSchema = z.object({
  subjectId: z.string({ required_error: "Pilih mata pelajaran." }),
  classId: z.string({ required_error: "Pilih kelas." }),
  teacherId: z.string({ required_error: "Guru pengajar harus ditentukan." }), 
  dayOfWeek: z.enum(DAYS_OF_WEEK, { required_error: "Pilih hari." }),
  startTime: z.string().regex(timeRegex, { message: "Format waktu mulai JJ:MM (e.g., 07:00)." }),
  endTime: z.string().regex(timeRegex, { message: "Format waktu selesai JJ:MM (e.g., 08:30)." }),
  topic: z.string().optional(),
  materials: z.string().optional(),
});

const lessonTimeRefinement = (data: { startTime: string; endTime: string; }) => {
  const [startH, startM] = data.startTime.split(':').map(Number);
  const [endH, endM] = data.endTime.split(':').map(Number);
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return false; 
  if (endH < startH || (endH === startH && endM <= startM)) {
      return false;
  }
  return true;
};

const lessonFormSchema = baseLessonObjectSchema.refine(lessonTimeRefinement, {
    message: "Waktu selesai harus setelah waktu mulai.",
    path: ["endTime"],
});

type LessonFormValues = z.infer<typeof lessonFormSchema>;

const editLessonFormSchema = baseLessonObjectSchema.extend({
  id: z.string(),
}).refine(lessonTimeRefinement, {
  message: "Waktu selesai harus setelah waktu mulai.",
  path: ["endTime"],
});

type EditLessonFormValues = z.infer<typeof editLessonFormSchema>;

const ITEMS_PER_PAGE = 10;

export default function LessonsPage() {
  const { user: authUser, role, loading: authLoading } = useAuth();
  const [allLessons, setAllLessons] = useState<LessonData[]>([]);
  
  // For Admin: all subjects, classes, teachers for forms & filters
  const [subjects, setSubjects] = useState<SubjectMin[]>([]);
  const [classes, setClasses] = useState<ClassMin[]>([]);
  const [teachers, setTeachers] = useState<TeacherMin[]>([]); 

  // For Guru form dialogs: filtered lists
  const [teacherDocId, setTeacherDocId] = useState<string | null>(null);
  const [formDialogClasses, setFormDialogClasses] = useState<ClassMin[]>([]);
  const [formDialogSubjects, setFormDialogSubjects] = useState<SubjectMin[]>([]);
  const [isLoadingFormDropdownData, setIsLoadingFormDropdownData] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<LessonData | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("all"); // Used by admin/guru for table filtering
  const [currentPage, setCurrentPage] = useState(1);

  const { toast } = useToast();
  const { isMobile } = useSidebar();

  const addLessonForm = useForm<LessonFormValues>({
    resolver: zodResolver(lessonFormSchema),
    defaultValues: {
      subjectId: undefined,
      classId: undefined,
      teacherId: undefined, // Will be pre-filled for guru
      dayOfWeek: undefined,
      startTime: "",
      endTime: "",
      topic: "",
      materials: "",
    },
  });

  const editLessonForm = useForm<EditLessonFormValues>({
    resolver: zodResolver(editLessonFormSchema),
  });
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000); 
    return () => clearInterval(timer);
  }, []);

  const fetchAdminDropdownData = async () => {
    if (role !== "admin") return;
    setIsLoading(true); // Re-use main loading for admin dropdowns
    try {
      const [subjectsSnapshot, classesSnapshot, teachersSnapshot] = await Promise.all([
        getDocs(query(collection(db, "subjects"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "classes"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "teachers"), orderBy("name", "asc"))), 
      ]);
      setSubjects(subjectsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
      setClasses(classesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
      setTeachers(teachersSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }))); 
    } catch (error) {
      console.error("Error fetching admin dropdown data: ", error);
      toast({ title: "Gagal Memuat Data Pendukung Admin", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGuruFormDropdownData = async () => {
    if (role !== "guru" || !authUser?.uid) return;
    setIsLoadingFormDropdownData(true);
    try {
      const teacherProfileQuery = query(collection(db, "teachers"), where("uid", "==", authUser.uid), limit(1));
      const teacherProfileSnapshot = await getDocs(teacherProfileQuery);

      if (teacherProfileSnapshot.empty) {
        toast({ title: "Profil Guru Tidak Ditemukan", variant: "warning" });
        setTeacherDocId(null);
        setFormDialogClasses([]);
        setFormDialogSubjects([]);
        setIsLoadingFormDropdownData(false);
        return;
      }
      const loggedInTeacherDocId = teacherProfileSnapshot.docs[0].id;
      setTeacherDocId(loggedInTeacherDocId);

      // Set teacherId in forms when teacherDocId is available
      addLessonForm.setValue("teacherId", loggedInTeacherDocId);
      if (selectedLesson && editLessonForm.getValues("teacherId") !== loggedInTeacherDocId) {
        editLessonForm.setValue("teacherId", loggedInTeacherDocId);
      }


      const lessonsTaughtQuery = query(collection(db, "lessons"), where("teacherId", "==", loggedInTeacherDocId));
      const lessonsTaughtSnapshot = await getDocs(lessonsTaughtQuery);
      
      const uniqueClassIds = new Set<string>();
      const uniqueSubjectIds = new Set<string>();
      lessonsTaughtSnapshot.docs.forEach(doc => {
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
      setFormDialogClasses(fetchedClasses);

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
      setFormDialogSubjects(fetchedSubjects);

    } catch (error) {
      console.error("Error fetching guru form dropdown data: ", error);
      toast({ title: "Gagal Memuat Data Form Guru", variant: "destructive" });
    } finally {
      setIsLoadingFormDropdownData(false);
    }
  };
  
  const fetchLessons = async () => {
    if (authLoading) return;
    setIsLoading(true);
    try {
      // For student/parent, only all classes are needed for potential filtering/display if design changes.
      // Actual lesson data is filtered by classId in the query.
      if (role === "siswa" || role === "orangtua") {
         const classesSnapshot = await getDocs(query(collection(db, "classes"), orderBy("name", "asc")));
         setClasses(classesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
      }

      const lessonsCollectionRef = collection(db, "lessons");
      let q;

      if (role === "siswa" && authUser?.classId) {
        q = query(lessonsCollectionRef, where("classId", "==", authUser.classId));
      } else if (role === "orangtua" && authUser?.linkedStudentClassId) {
        q = query(lessonsCollectionRef, where("classId", "==", authUser.linkedStudentClassId));
      } else if (role === "orangtua" && !authUser?.linkedStudentClassId) { 
        setAllLessons([]);
        setIsLoading(false);
        return;
      } else if (role === "guru" && authUser?.uid) {
        // Fetch teacherDocId if not already fetched (e.g., on page load)
        let currentTeacherDocId = teacherDocId;
        if (!currentTeacherDocId) {
            const teacherProfileQuery = query(collection(db, "teachers"), where("uid", "==", authUser.uid), limit(1));
            const teacherProfileSnapshot = await getDocs(teacherProfileQuery);
            if (!teacherProfileSnapshot.empty) {
                currentTeacherDocId = teacherProfileSnapshot.docs[0].id;
                setTeacherDocId(currentTeacherDocId);
            }
        }
        if (currentTeacherDocId) {
            q = query(lessonsCollectionRef, where("teacherId", "==", currentTeacherDocId));
        } else {
            setAllLessons([]); setIsLoading(false); return;
        }

      } else if (role === "admin") {
         q = query(lessonsCollectionRef, orderBy("createdAt", "desc"));
      } else {
        setAllLessons([]);
        setIsLoading(false);
        return;
      }
      
      const querySnapshot = await getDocs(q);

      const fetchedLessons: LessonData[] = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          subjectId: data.subjectId,
          subjectName: data.subjectName,
          classId: data.classId,
          className: data.className,
          teacherId: data.teacherId, 
          teacherName: data.teacherName,
          dayOfWeek: data.dayOfWeek,
          startTime: data.startTime,
          endTime: data.endTime,
          topic: data.topic,
          materials: data.materials,
          createdAt: data.createdAt,
        };
      });
      setAllLessons(fetchedLessons);
    } catch (error) {
      console.error("Error fetching lessons: ", error);
      toast({ title: "Gagal Memuat Jadwal Pelajaran", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && role === "admin") {
        fetchAdminDropdownData(); // For admin table filters and form
    }
    fetchLessons(); // For table data for all roles
  }, [role, authUser, authLoading]);

  useEffect(() => {
    if (selectedLesson && isEditDialogOpen) {
      if (role === "guru") {
        // Ensure guru-specific dropdown data is loaded if dialog is opened directly
        if (!teacherDocId || formDialogClasses.length === 0 || formDialogSubjects.length === 0) {
          fetchGuruFormDropdownData();
        }
         editLessonForm.setValue("teacherId", teacherDocId || ""); // Pre-fill and disable
      }
      editLessonForm.reset({
        id: selectedLesson.id,
        subjectId: selectedLesson.subjectId,
        classId: selectedLesson.classId,
        teacherId: role === "guru" ? teacherDocId || "" : selectedLesson.teacherId,
        dayOfWeek: selectedLesson.dayOfWeek as typeof DAYS_OF_WEEK[number],
        startTime: selectedLesson.startTime,
        endTime: selectedLesson.endTime,
        topic: selectedLesson.topic || "",
        materials: selectedLesson.materials || "",
      });
    }
  }, [selectedLesson, isEditDialogOpen, editLessonForm, role, teacherDocId, formDialogClasses, formDialogSubjects]);


  const handleAddLessonSubmit: SubmitHandler<LessonFormValues> = async (data) => {
    addLessonForm.clearErrors();
    let subjectName, className, teacherName, finalTeacherId;

    if (role === "guru") {
        if (!teacherDocId || !authUser?.displayName) {
            toast({title: "Error", description: "Profil guru tidak ditemukan.", variant: "destructive"});
            return;
        }
        finalTeacherId = teacherDocId;
        teacherName = authUser.displayName;
        subjectName = formDialogSubjects.find(s => s.id === data.subjectId)?.name;
        className = formDialogClasses.find(c => c.id === data.classId)?.name;
    } else { // Admin
        const denormalized = getDenormalizedNames(data);
        subjectName = denormalized.subjectName;
        className = denormalized.className;
        teacherName = denormalized.teacherName;
        finalTeacherId = data.teacherId;
    }
    
    if (!subjectName || !className || !teacherName || !finalTeacherId) {
      toast({title: "Data Tidak Lengkap", description: "Pastikan subjek, kelas, dan guru valid.", variant: "destructive"});
      return;
    }

    try {
      await addDoc(collection(db, "lessons"), {
        ...data, 
        teacherId: finalTeacherId,
        subjectName,
        className,
        teacherName,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Pelajaran Ditambahkan", description: "Jadwal pelajaran berhasil disimpan." });
      setIsAddDialogOpen(false);
      addLessonForm.reset();
      fetchLessons();
    } catch (error: any) {
      console.error("Error adding lesson:", error);
      toast({ title: "Gagal Menambahkan Pelajaran", variant: "destructive" });
    }
  };

  const handleEditLessonSubmit: SubmitHandler<EditLessonFormValues> = async (data) => {
    if (!selectedLesson) return;
    editLessonForm.clearErrors();
    let subjectName, className, teacherName, finalTeacherId;

    if (role === "guru") {
        if (!teacherDocId || !authUser?.displayName) {
            toast({title: "Error", description: "Profil guru tidak ditemukan.", variant: "destructive"});
            return;
        }
        finalTeacherId = teacherDocId;
        teacherName = authUser.displayName;
        subjectName = formDialogSubjects.find(s => s.id === data.subjectId)?.name;
        className = formDialogClasses.find(c => c.id === data.classId)?.name;
    } else { // Admin
        const denormalized = getDenormalizedNames(data);
        subjectName = denormalized.subjectName;
        className = denormalized.className;
        teacherName = denormalized.teacherName;
        finalTeacherId = data.teacherId;
    }

    if (!subjectName || !className || !teacherName || !finalTeacherId) {
      toast({title: "Data Tidak Lengkap", description: "Pastikan subjek, kelas, dan guru valid.", variant: "destructive"});
      return;
    }

    try {
      const lessonDocRef = doc(db, "lessons", data.id);
      await updateDoc(lessonDocRef, {
        ...data, 
        teacherId: finalTeacherId,
        subjectName,
        className,
        teacherName,
      });
      toast({ title: "Pelajaran Diperbarui", description: "Jadwal pelajaran berhasil diperbarui." });
      setIsEditDialogOpen(false);
      setSelectedLesson(null);
      fetchLessons();
    } catch (error) {
      console.error("Error editing lesson:", error);
      toast({ title: "Gagal Memperbarui Pelajaran", variant: "destructive" });
    }
  };
  
  // Admin specific helper
  const getDenormalizedNames = (data: LessonFormValues | EditLessonFormValues) => {
    const subject = subjects.find(s => s.id === data.subjectId);
    const aClass = classes.find(c => c.id === data.classId);
    const teacher = teachers.find(t => t.id === data.teacherId); 
    return {
      subjectName: subject?.name,
      className: aClass?.name,
      teacherName: teacher?.name,
    };
  };

  const handleDeleteLesson = async (lessonId: string) => {
    try {
      await deleteDoc(doc(db, "lessons", lessonId));
      toast({ title: "Pelajaran Dihapus", description: "Jadwal pelajaran berhasil dihapus." });
      setSelectedLesson(null);
      fetchLessons();
    } catch (error) {
      console.error("Error deleting lesson:", error);
      toast({ title: "Gagal Menghapus Pelajaran", variant: "destructive" });
    }
  };

  const openEditDialog = (lesson: LessonData) => {
    setSelectedLesson(lesson);
    if (role === 'guru' && (!teacherDocId || formDialogClasses.length === 0 || formDialogSubjects.length === 0)) {
        fetchGuruFormDropdownData(); // Ensure data is ready for guru edit form
    }
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (lesson: LessonData) => {
    setSelectedLesson(lesson);
  };

  const filteredAndSortedLessons = useMemo(() => {
    let tempLessons = [...allLessons];

    if ((role === "admin") && selectedClassFilter !== "all") {
      tempLessons = tempLessons.filter(lesson => lesson.classId === selectedClassFilter);
    }

    if ((role === "admin") && searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      tempLessons = tempLessons.filter(lesson =>
        (lesson.subjectName && lesson.subjectName.toLowerCase().includes(lowerSearchTerm)) ||
        (lesson.className && lesson.className.toLowerCase().includes(lowerSearchTerm)) ||
        (lesson.teacherName && lesson.teacherName.toLowerCase().includes(lowerSearchTerm))
      );
    }
    
    return tempLessons.sort((a, b) => {
      const dayIndexA = DAYS_OF_WEEK.indexOf(a.dayOfWeek as any);
      const dayIndexB = DAYS_OF_WEEK.indexOf(b.dayOfWeek as any);
      if (dayIndexA !== dayIndexB) return dayIndexA - dayIndexB;
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return (a.subjectName || "").localeCompare(b.subjectName || "");
    });
  }, [allLessons, searchTerm, selectedClassFilter, role]);

  const totalPages = Math.ceil(filteredAndSortedLessons.length / ITEMS_PER_PAGE);
  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ITEMS_PER_PAGE;
    return filteredAndSortedLessons.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, filteredAndSortedLessons]);

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


  const canManageLessons = role === "admin" || role === "guru";
  const isStudentOrParent = role === "siswa" || role === "orangtua";
  
  const isLessonCurrentlyActive = (lesson: LessonData): boolean => {
    if (!lesson.dayOfWeek || !lesson.startTime || !lesson.endTime) return false;

    const now = currentTime;
    const currentDayName = DAY_NAMES_ID[getDay(now)];
    
    if (lesson.dayOfWeek !== currentDayName) return false;

    const lessonStartTime = parse(lesson.startTime, "HH:mm", now);
    const lessonEndTime = parse(lesson.endTime, "HH:mm", now);

    if (!isValid(lessonStartTime) || !isValid(lessonEndTime)) return false;
    
    return isWithinInterval(now, { start: lessonStartTime, end: lessonEndTime });
  };

  const getNoLessonsMessage = () => {
    if (role === "guru") {
      return "Tidak ada pelajaran yang ditugaskan kepada Anda.";
    }
    if (role === "siswa") {
      return "Tidak ada jadwal pelajaran untuk kelas Anda saat ini.";
    }
    if (role === "orangtua") {
      if (!authUser?.linkedStudentClassId) {
        return (
          <div className="flex flex-col items-center text-center">
             <AlertCircle className="w-10 h-10 mb-2 text-destructive" />
            <span className="font-semibold">Data Kelas Anak Tidak Ditemukan.</span>
            <span>Pastikan anak sudah terdaftar di kelas dan akun orang tua sudah ditautkan dengan benar ke data siswa.</span>
          </div>
        );
      }
      return "Tidak ada jadwal pelajaran yang terdaftar untuk kelas anak Anda saat ini.";
    }
    return "Belum ada jadwal pelajaran yang ditambahkan.";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Jadwal Pelajaran</h1>
        <p className="text-muted-foreground">
          {canManageLessons 
            ? "Kelola jadwal pelajaran, materi ajar, dan silabus."
            : isStudentOrParent
            ? (role === "siswa" ? "Lihat jadwal pelajaran Anda." : `Lihat jadwal pelajaran anak Anda (${authUser?.linkedStudentName || 'Siswa'}).`)
            : "Lihat jadwal pelajaran."
          }
        </p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between space-y-2 md:space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <BookCopy className="h-6 w-6 text-primary" />
            <span>Jadwal & Materi Pelajaran</span>
          </CardTitle>
          {canManageLessons && (
            <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
              setIsAddDialogOpen(isOpen);
              if (!isOpen) { addLessonForm.reset(); addLessonForm.clearErrors(); }
              else if (role === 'guru') { fetchGuruFormDropdownData(); }
              else if (role === 'admin' && (subjects.length === 0 || classes.length === 0 || teachers.length === 0)) { fetchAdminDropdownData(); }
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <PlusCircle className="mr-2 h-4 w-4" /> Tambah Pelajaran
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Tambah Jadwal Pelajaran Baru</DialogTitle>
                  <DialogDescription>
                    Isi detail jadwal pelajaran.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={addLessonForm.handleSubmit(handleAddLessonSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                  <div>
                    <Label htmlFor="add-lesson-subjectId">Mata Pelajaran</Label>
                    <Select onValueChange={(value) => addLessonForm.setValue("subjectId", value, { shouldValidate: true })} value={addLessonForm.getValues("subjectId") || undefined} disabled={isLoadingFormDropdownData && role ==='guru'}>
                      <SelectTrigger id="add-lesson-subjectId" className="mt-1"><SelectValue placeholder={(isLoadingFormDropdownData && role==='guru') ? "Memuat mapel..." : "Pilih mata pelajaran"} /></SelectTrigger>
                      <SelectContent>
                        {(role === 'guru' ? formDialogSubjects : subjects).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {addLessonForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.subjectId.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="add-lesson-classId">Kelas</Label>
                    <Select onValueChange={(value) => addLessonForm.setValue("classId", value, { shouldValidate: true })} value={addLessonForm.getValues("classId") || undefined} disabled={isLoadingFormDropdownData && role==='guru'}>
                      <SelectTrigger id="add-lesson-classId" className="mt-1"><SelectValue placeholder={(isLoadingFormDropdownData && role==='guru') ? "Memuat kelas..." : "Pilih kelas"} /></SelectTrigger>
                      <SelectContent>
                         {(role === 'guru' ? formDialogClasses : classes).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {addLessonForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.classId.message}</p>}
                  </div>
                  {role === 'admin' && (
                    <div>
                      <Label htmlFor="add-lesson-teacherId">Guru Pengajar</Label>
                      <Select onValueChange={(value) => addLessonForm.setValue("teacherId", value, { shouldValidate: true })} value={addLessonForm.getValues("teacherId") || undefined}>
                        <SelectTrigger id="add-lesson-teacherId" className="mt-1"><SelectValue placeholder="Pilih guru" /></SelectTrigger>
                        <SelectContent>
                          {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {addLessonForm.formState.errors.teacherId && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.teacherId.message}</p>}
                    </div>
                  )}
                  {role === 'guru' && authUser && (
                    <div>
                        <Label>Guru Pengajar</Label>
                        <Input value={authUser.displayName || "Nama Guru Tidak Tersedia"} className="mt-1 bg-muted" readOnly />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="add-lesson-dayOfWeek">Hari</Label>
                    <Select onValueChange={(value) => addLessonForm.setValue("dayOfWeek", value as any, { shouldValidate: true })} value={addLessonForm.getValues("dayOfWeek") || undefined}>
                      <SelectTrigger id="add-lesson-dayOfWeek" className="mt-1"><SelectValue placeholder="Pilih hari" /></SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map(day => <SelectItem key={day} value={day}>{day}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {addLessonForm.formState.errors.dayOfWeek && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.dayOfWeek.message}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <Label htmlFor="add-lesson-startTime">Waktu Mulai</Label>
                          <Input id="add-lesson-startTime" type="time" {...addLessonForm.register("startTime")} className="mt-1" />
                          {addLessonForm.formState.errors.startTime && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.startTime.message}</p>}
                      </div>
                      <div>
                          <Label htmlFor="add-lesson-endTime">Waktu Selesai</Label>
                          <Input id="add-lesson-endTime" type="time" {...addLessonForm.register("endTime")} className="mt-1" />
                          {addLessonForm.formState.errors.endTime && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.endTime.message}</p>}
                      </div>
                  </div>
                  <div>
                    <Label htmlFor="add-lesson-topic">Topik (Opsional)</Label>
                    <Input id="add-lesson-topic" {...addLessonForm.register("topic")} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="add-lesson-materials">Materi (Opsional)</Label>
                    <Textarea id="add-lesson-materials" {...addLessonForm.register("materials")} className="mt-1" placeholder="Deskripsi singkat materi atau link..." />
                  </div>
                  <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                    <Button type="submit" disabled={addLessonForm.formState.isSubmitting || (role === 'guru' && isLoadingFormDropdownData)}>
                        {(addLessonForm.formState.isSubmitting || (role === 'guru' && isLoadingFormDropdownData))&& <LottieLoader width={16} height={16} className="mr-2"/>}
                        {addLessonForm.formState.isSubmitting || (role === 'guru' && isLoadingFormDropdownData) ? "Menyimpan..." : "Simpan Jadwal"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {(role === "admin") && ( // Only admin sees these filters
            <div className="my-4 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari mapel, kelas, atau guru..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-full"
                />
              </div>
              <Select
                value={selectedClassFilter}
                onValueChange={setSelectedClassFilter}
                disabled={isLoading || classes.length === 0}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <FilterIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Filter per Kelas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kelas</SelectItem>
                  {isLoading && <SelectItem value="loading-classes" disabled>Memuat kelas...</SelectItem>}
                  {!isLoading && classes.length === 0 && <SelectItem value="no-classes" disabled>Tidak ada kelas</SelectItem>}
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                  ))}
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
              <Table className={cn(isMobile && "table-fixed w-full")}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={cn("w-[50px]", isMobile && "w-10 px-2 text-center")}>No.</TableHead>
                    <TableHead className={cn(isMobile ? "px-2" : "")}>Mata Pelajaran</TableHead>
                    {!isMobile && !(isStudentOrParent || role ==='guru') && <TableHead>Kelas</TableHead>} 
                    {!isMobile && (role==='admin' || role==='siswa' || role==='orangtua') && <TableHead>Guru</TableHead>}
                    {!isMobile && <TableHead>Hari</TableHead>}
                    <TableHead className={cn(isMobile ? "px-2" : "")}>Waktu</TableHead>
                    {!isMobile && canManageLessons && <TableHead>Topik</TableHead>}
                    <TableHead className={cn("text-right", isMobile ? "w-12 px-1" : "w-16")}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentTableData.map((lesson, index) => {
                    const isActiveNow = isStudentOrParent ? isLessonCurrentlyActive(lesson) : false;
                    return (
                      <TableRow key={lesson.id}>
                        <TableCell className={cn(isMobile ? "px-2 text-center" : "")}>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className={cn("font-medium truncate", isMobile ? "px-2" : "")} title={lesson.subjectName || lesson.subjectId}>{lesson.subjectName || lesson.subjectId}</TableCell>
                        
                        {!isMobile && !(isStudentOrParent || role === 'guru') && <TableCell className="truncate" title={lesson.className || lesson.classId}>{lesson.className || lesson.classId}</TableCell>}
                        {!isMobile && (role==='admin' || role ==='siswa' || role==='orangtua') && <TableCell className="truncate" title={lesson.teacherName || lesson.teacherId}>{lesson.teacherName || lesson.teacherId}</TableCell>}
                        {!isMobile && <TableCell>{lesson.dayOfWeek}</TableCell>}
                        
                        <TableCell className={cn(isMobile ? "px-2" : "")}>{lesson.startTime} - {lesson.endTime}</TableCell>
                        
                        {!isMobile && canManageLessons && <TableCell className="truncate max-w-xs" title={lesson.topic || "-"}>{lesson.topic || "-"}</TableCell>}
                        
                        <TableCell className={cn("text-right", isMobile ? "px-1" : "")}>
                          {isStudentOrParent ? (
                            role === "orangtua" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={true}
                                className={cn(isMobile && "w-full justify-start")}
                                aria-label="Masuk Kelas (Tidak tersedia untuk Orang Tua)"
                              >
                                <LogIn className="mr-2 h-4 w-4" /> {isMobile ? "" : "Masuk Kelas"}
                              </Button>
                            ) : ( // For 'siswa' role
                              <Button
                                asChild
                                size="sm"
                                variant={!isActiveNow ? "outline" : "default"}
                                disabled={!isActiveNow}
                                className={cn(
                                  isActiveNow && "border-primary text-primary hover:bg-primary/10",
                                  isMobile && "w-full justify-start"
                                )}
                              >
                                <Link href={`/lessons/${lesson.id}`}>
                                  <LogIn className="mr-2 h-4 w-4" /> {isMobile ? "" : "Masuk Kelas"}
                                </Link>
                              </Button>
                            )
                          ) : canManageLessons ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`Opsi untuk pelajaran ${lesson.subjectName}`}>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/lessons/${lesson.id}`}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    Lihat Detail
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEditDialog(lesson)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem
                                      onSelect={(e) => { e.preventDefault(); openDeleteDialog(lesson); }}
                                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Hapus
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  {selectedLesson && selectedLesson.id === lesson.id && ( 
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Tindakan ini akan menghapus jadwal pelajaran <span className="font-semibold">{selectedLesson?.subjectName} ({selectedLesson?.className})</span> pada hari {selectedLesson?.dayOfWeek}.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel onClick={() => setSelectedLesson(null)}>Batal</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteLesson(selectedLesson.id)}>Ya, Hapus Jadwal</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  )}
                                </AlertDialog>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
               {canManageLessons && (searchTerm || selectedClassFilter !== "all")
                ? "Tidak ada jadwal pelajaran yang cocok."
                : getNoLessonsMessage()
              }
            </div>
          )}
        </CardContent>
      </Card>

      {canManageLessons && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
          setIsEditDialogOpen(isOpen);
            if (!isOpen) { setSelectedLesson(null); editLessonForm.clearErrors(); }
            else if (role === 'guru' && selectedLesson) { fetchGuruFormDropdownData(); } // Fetch on open for edit too
        }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Jadwal Pelajaran</DialogTitle>
              <DialogDescription>Perbarui detail jadwal pelajaran.</DialogDescription>
            </DialogHeader>
            {selectedLesson && (
              <form onSubmit={editLessonForm.handleSubmit(handleEditLessonSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <Input type="hidden" {...editLessonForm.register("id")} />
                <div>
                  <Label htmlFor="edit-lesson-subjectId">Mata Pelajaran</Label>
                  <Select onValueChange={(value) => editLessonForm.setValue("subjectId", value, { shouldValidate: true })} value={editLessonForm.getValues("subjectId") || undefined} disabled={(isLoadingFormDropdownData && role==='guru')}>
                    <SelectTrigger id="edit-lesson-subjectId" className="mt-1"><SelectValue placeholder={(isLoadingFormDropdownData && role==='guru') ? "Memuat mapel..." : "Pilih mata pelajaran"} /></SelectTrigger>
                    <SelectContent>
                       {(role === 'guru' ? formDialogSubjects : subjects).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {editLessonForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.subjectId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="edit-lesson-classId">Kelas</Label>
                  <Select onValueChange={(value) => editLessonForm.setValue("classId", value, { shouldValidate: true })} value={editLessonForm.getValues("classId") || undefined} disabled={(isLoadingFormDropdownData && role==='guru')}>
                    <SelectTrigger id="edit-lesson-classId" className="mt-1"><SelectValue placeholder={(isLoadingFormDropdownData && role==='guru') ? "Memuat kelas..." : "Pilih kelas"} /></SelectTrigger>
                    <SelectContent>
                        {(role === 'guru' ? formDialogClasses : classes).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {editLessonForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.classId.message}</p>}
                </div>
                {role === 'admin' && (
                    <div>
                    <Label htmlFor="edit-lesson-teacherId">Guru Pengajar</Label>
                    <Select onValueChange={(value) => editLessonForm.setValue("teacherId", value, { shouldValidate: true })} value={editLessonForm.getValues("teacherId") || undefined}>
                        <SelectTrigger id="edit-lesson-teacherId" className="mt-1"><SelectValue placeholder="Pilih guru" /></SelectTrigger>
                        <SelectContent>
                        {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {editLessonForm.formState.errors.teacherId && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.teacherId.message}</p>}
                    </div>
                )}
                {role === 'guru' && authUser && (
                    <div>
                        <Label>Guru Pengajar</Label>
                        <Input value={authUser.displayName || "Nama Guru Tidak Tersedia"} className="mt-1 bg-muted" readOnly />
                    </div>
                )}
                <div>
                  <Label htmlFor="edit-lesson-dayOfWeek">Hari</Label>
                  <Select onValueChange={(value) => editLessonForm.setValue("dayOfWeek", value as any, { shouldValidate: true })} value={editLessonForm.getValues("dayOfWeek") || undefined}>
                    <SelectTrigger id="edit-lesson-dayOfWeek" className="mt-1"><SelectValue placeholder="Pilih hari" /></SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map(day => <SelectItem key={day} value={day}>{day}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {editLessonForm.formState.errors.dayOfWeek && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.dayOfWeek.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="edit-lesson-startTime">Waktu Mulai</Label>
                        <Input id="edit-lesson-startTime" type="time" {...editLessonForm.register("startTime")} className="mt-1" />
                        {editLessonForm.formState.errors.startTime && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.startTime.message}</p>}
                    </div>
                    <div>
                        <Label htmlFor="edit-lesson-endTime">Waktu Selesai</Label>
                        <Input id="edit-lesson-endTime" type="time" {...editLessonForm.register("endTime")} className="mt-1" />
                        {editLessonForm.formState.errors.endTime && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.endTime.message}</p>}
                    </div>
                </div>
                <div>
                  <Label htmlFor="edit-lesson-topic">Topik (Opsional)</Label>
                  <Input id="edit-lesson-topic" {...editLessonForm.register("topic")} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="edit-lesson-materials">Materi (Opsional)</Label>
                  <Textarea id="edit-lesson-materials" {...editLessonForm.register("materials")} className="mt-1" />
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                  <Button type="submit" disabled={editLessonForm.formState.isSubmitting || (role === 'guru' && isLoadingFormDropdownData)}>
                    {(editLessonForm.formState.isSubmitting || (role === 'guru' && isLoadingFormDropdownData)) && <LottieLoader width={16} height={16} className="mr-2"/>}
                    {editLessonForm.formState.isSubmitting || (role === 'guru' && isLoadingFormDropdownData) ? "Menyimpan..." : "Simpan Perubahan"}
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

