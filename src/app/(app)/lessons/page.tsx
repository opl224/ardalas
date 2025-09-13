
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
import { useState, useEffect, useMemo, useCallback } from "react";
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
  limit,
  documentId,
  collectionGroup
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
import LottieLoader from "@/components/ui/LottieLoader";
import { useSidebar } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


// Minimal interfaces for dropdowns
interface SubjectMin { id: string; name: string; }
interface ClassMin { id: string; name: string; }
interface TeacherMin { id: string; name: string; uid?: string; subject: string; } // Represents documents from 'teachers' collection
interface TeacherWithClasses extends TeacherMin {
    classIds: string[];
    classNames: string[];
}


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
  isLive?: boolean;
  createdAt?: Timestamp;
}

const DAYS_OF_WEEK = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const DAY_NAMES_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const ALL_SUBJECT_OPTIONS = [
    "Guru Kelas", "Pendidikan Agama Islam", "Pendidikan Agama Kristen", "PJOK", "Bahasa Inggris"
].sort();

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
  if (!data.startTime || !data.endTime) return true; // Let regex handle empty
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

export default function LessonsPage() {
  const { user: authUser, role, loading: authLoading } = useAuth();
  const [allLessons, setAllLessons] = useState<LessonData[]>([]);
  
  const [allSubjects, setAllSubjects] = useState<SubjectMin[]>([]);
  const [allClasses, setAllClasses] = useState<ClassMin[]>([]);
  const [allTeachersWithClasses, setAllTeachersWithClasses] = useState<TeacherWithClasses[]>([]);
  
  const [classesForForm, setClassesForForm] = useState<ClassMin[]>([]);
  const [teachersForForm, setTeachersForForm] = useState<TeacherMin[]>([]);

  const [teacherDocId, setTeacherDocId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<LessonData | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("all");

  const { toast } = useToast();
  const { isMobile } = useSidebar();
  const [isSpecialistTeacher, setIsSpecialistTeacher] = useState(false);

  const addLessonForm = useForm<LessonFormValues>({
    resolver: zodResolver(lessonFormSchema),
    defaultValues: {
      subjectId: undefined,
      classId: undefined,
      teacherId: undefined,
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

  const fetchAdminDropdownData = useCallback(async () => {
    if (role !== "admin") return;
    setIsLoading(true);
    try {
        const [subjectsSnapshot, classesSnapshot, teachersSnapshot, lessonsSnapshot] = await Promise.all([
            getDocs(query(collection(db, "subjects"), orderBy("name", "asc"))),
            getDocs(query(collection(db, "classes"), orderBy("name", "asc"))),
            getDocs(query(collection(db, "teachers"), orderBy("name", "asc"))),
            getDocs(query(collection(db, "lessons")))
        ]);
        const classesData = classesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
        setAllClasses(classesData);

        const subjectsData = subjectsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
        setAllSubjects(subjectsData);
        
        const teachersData = teachersSnapshot.docs.map(doc => ({
            id: doc.id,
            uid: doc.data().uid,
            name: doc.data().name,
            subject: doc.data().subject,
        }));
        
        const classesMap = new Map(classesData.map(c => [c.id, c.name]));
        const teacherClassMap = new Map<string, Set<string>>();

        classesSnapshot.forEach(classDoc => {
            const classData = classDoc.data();
            if (classData.teacherId) {
               if (!teacherClassMap.has(classData.teacherId)) {
                teacherClassMap.set(classData.teacherId, new Set());
              }
              teacherClassMap.get(classData.teacherId)!.add(classDoc.id);
            }
        });

        lessonsSnapshot.docs.forEach(lessonDoc => {
            const lesson = lessonDoc.data();
            if (lesson.teacherId && lesson.classId) {
                if (!teacherClassMap.has(lesson.teacherId)) {
                    teacherClassMap.set(lesson.teacherId, new Set());
                }
                teacherClassMap.get(lesson.teacherId)!.add(lesson.classId);
            }
        });
        
        const processedTeachers = teachersData.map(teacher => {
            const teacherClassesSet = teacherClassMap.get(teacher.id) || new Set();
            const classIds = Array.from(teacherClassesSet);
            const classNames = classIds.map(id => classesMap.get(id) || "Nama Kelas Tidak Ditemukan").sort();
            return { ...teacher, classIds, classNames };
        });
        setAllTeachersWithClasses(processedTeachers);

    } catch (error) {
        console.error("Error fetching admin dropdown data: ", error);
        toast({ title: "Gagal Memuat Data Pendukung", variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  }, [role, toast]);
  
  
  const fetchLessons = async () => {
    if (authLoading) return;
    setIsLoading(true);
    try {
      if (role === "siswa" || role === "orangtua") {
         const classesSnapshot = await getDocs(query(collection(db, "classes"), orderBy("name", "asc")));
         setAllClasses(classesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
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
          isLive: data.isLive || false,
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
        fetchAdminDropdownData(); 
    }
    fetchLessons(); 
  }, [role, authUser?.uid, authLoading, toast, fetchAdminDropdownData]);


  useEffect(() => {
    if (selectedLesson && isEditDialogOpen) {
      editLessonForm.reset({
        id: selectedLesson.id,
        subjectId: selectedLesson.subjectId,
        classId: selectedLesson.classId,
        teacherId: selectedLesson.teacherId,
        dayOfWeek: selectedLesson.dayOfWeek as typeof DAYS_OF_WEEK[number],
        startTime: selectedLesson.startTime,
        endTime: selectedLesson.endTime,
        topic: selectedLesson.topic || "",
        materials: selectedLesson.materials || "",
      });
    }
  }, [selectedLesson, isEditDialogOpen, editLessonForm]);

  const watchTeacherIdForAdd = addLessonForm.watch("teacherId");
  const watchTeacherIdForEdit = editLessonForm.watch("teacherId");
  const watchSubjectIdForAdd = addLessonForm.watch("subjectId");
  const watchSubjectIdForEdit = editLessonForm.watch("subjectId");

  useEffect(() => {
    const teacher = allTeachersWithClasses.find(t => t.id === watchTeacherIdForAdd);
    if (isSpecialistTeacher) {
      setClassesForForm(allClasses);
    } else if (teacher) {
      const taughtClasses = allClasses.filter(c => teacher.classIds.includes(c.id));
      setClassesForForm(taughtClasses);
    } else {
      setClassesForForm([]);
    }
    
    const currentClassId = addLessonForm.getValues("classId");
    const isClassStillValid = classesForForm.some(c => c.id === currentClassId);

    if (currentClassId && !isClassStillValid) {
        addLessonForm.setValue("classId", undefined, { shouldValidate: true });
    }
  }, [watchTeacherIdForAdd, isSpecialistTeacher, allTeachersWithClasses, allClasses, addLessonForm, classesForForm]);


  useEffect(() => {
    const subject = allSubjects.find(s => s.id === watchSubjectIdForAdd);
    if (subject && subject.name) {
      const teachersForSubject = allTeachersWithClasses.filter(t => t.subject === subject.name);
      setTeachersForForm(teachersForSubject);
    } else {
      setTeachersForForm([]);
    }
    addLessonForm.setValue("teacherId", undefined, { shouldValidate: true });
    addLessonForm.setValue("classId", undefined, { shouldValidate: true });
  }, [watchSubjectIdForAdd, allSubjects, allTeachersWithClasses, addLessonForm]);


  useEffect(() => {
      const teacher = allTeachersWithClasses.find(t => t.id === watchTeacherIdForEdit);
      if (isSpecialistTeacher) {
        setClassesForForm(allClasses);
      } else if (teacher) {
          const taughtClasses = allClasses.filter(c => teacher.classIds.includes(c.id));
          setClassesForForm(taughtClasses);
          if (!teacher.classIds.includes(editLessonForm.getValues("classId"))) {
              editLessonForm.setValue("classId", undefined, {shouldValidate: true});
          }
      } else {
          setClassesForForm([]);
      }
  }, [watchTeacherIdForEdit, allTeachersWithClasses, allClasses, editLessonForm, isSpecialistTeacher]);
  
  useEffect(() => {
    const subject = allSubjects.find(s => s.id === watchSubjectIdForEdit);
    if (subject && subject.name) {
      const teachersForSubject = allTeachersWithClasses.filter(t => t.subject === subject.name);
      setTeachersForForm(teachersForSubject);
    } else {
      setTeachersForForm([]);
    }
  }, [watchSubjectIdForEdit, allSubjects, allTeachersWithClasses]);


  const handleAddLessonSubmit: SubmitHandler<LessonFormValues> = async (data) => {
    if (role !== "admin") {
        toast({title: "Aksi Ditolak", description: "Hanya admin yang dapat menambahkan pelajaran.", variant: "destructive"});
        return;
    }
    addLessonForm.clearErrors();
    const { subjectName, className, teacherName } = getDenormalizedNames(data);
    
    if (!subjectName || !className || !teacherName) {
      toast({title: "Data Tidak Lengkap", description: "Pastikan subjek, kelas, dan guru valid.", variant: "destructive"});
      return;
    }
    
    if(!authUser?.uid) {
      toast({title: "Aksi Gagal", description: "Pengguna tidak terautentikasi.", variant: "destructive"});
      return;
    }

    try {
      await addDoc(collection(db, "lessons"), {
        ...data, 
        subjectName,
        className,
        teacherName,
        isLive: false,
        createdAt: serverTimestamp(),
        uid: authUser.uid,
      });
      toast({ title: "Pelajaran Ditambahkan", description: "Jadwal pelajaran berhasil disimpan." });
      setIsAddDialogOpen(false);
      addLessonForm.reset();
      fetchLessons();
      fetchAdminDropdownData(); 
    } catch (error: any) {
      console.error("Error adding lesson:", error);
      toast({ title: "Gagal Menambahkan Pelajaran", variant: "destructive" });
    }
  };

  const handleEditLessonSubmit: SubmitHandler<EditLessonFormValues> = async (data) => {
    if (role !== "admin") {
        toast({title: "Aksi Ditolak", description: "Hanya admin yang dapat mengedit pelajaran.", variant: "destructive"});
        return;
    }
    if (!selectedLesson) return;
    editLessonForm.clearErrors();
    const { subjectName, className, teacherName } = getDenormalizedNames(data);

    if (!subjectName || !className || !teacherName) {
      toast({title: "Data Tidak Lengkap", description: "Pastikan subjek, kelas, dan guru valid.", variant: "destructive"});
      return;
    }

    try {
      const lessonDocRef = doc(db, "lessons", data.id);
      await updateDoc(lessonDocRef, {
        ...data, 
        subjectName,
        className,
        teacherName,
      });
      toast({ title: "Pelajaran Diperbarui", description: "Jadwal pelajaran berhasil diperbarui." });
      setIsEditDialogOpen(false);
      setSelectedLesson(null);
      fetchLessons();
      fetchAdminDropdownData(); 
    } catch (error) {
      console.error("Error editing lesson:", error);
      toast({ title: "Gagal Memperbarui Pelajaran", variant: "destructive" });
    }
  };
  
  const getDenormalizedNames = (data: LessonFormValues | EditLessonFormValues) => {
    const aClass = allClasses.find(c => c.id === data.classId);
    const teacher = allTeachersWithClasses.find(t => t.id === data.teacherId); 
    const subject = allSubjects.find(s => s.id === data.subjectId);
    return {
      subjectName: subject?.name, 
      className: aClass?.name,
      teacherName: teacher?.name,
    };
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (role !== "admin") return;
    try {
      await deleteDoc(doc(db, "lessons", lessonId));
      toast({ title: "Pelajaran Dihapus", description: "Jadwal pelajaran berhasil dihapus." });
      setSelectedLesson(null);
      fetchLessons();
      fetchAdminDropdownData(); 
    } catch (error) {
      console.error("Error deleting lesson:", error);
      toast({ title: "Gagal Menghapus Pelajaran", variant: "destructive" });
    }
  };


  const openEditDialog = (lesson: LessonData) => {
    if(role !== 'admin') return;
    setSelectedLesson(lesson);
    if (allSubjects.length === 0 || allClasses.length === 0 || allTeachersWithClasses.length === 0) {
        fetchAdminDropdownData(); 
    }
    setClassesForForm(allClasses); 
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (lesson: LessonData) => {
    if(role !== 'admin') return;
    setSelectedLesson(lesson);
  };
  
  const filteredLessons = useMemo(() => {
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
    return tempLessons;
  }, [allLessons, searchTerm, selectedClassFilter, role]);

  const lessonsByDay = useMemo(() => {
    const grouped: { [key: string]: LessonData[] } = {};
    DAYS_OF_WEEK.forEach(day => {
        grouped[day] = [];
    });
    filteredLessons.forEach(lesson => {
        if (lesson.dayOfWeek && grouped[lesson.dayOfWeek]) {
            grouped[lesson.dayOfWeek].push(lesson);
        }
    });
    Object.keys(grouped).forEach(day => {
        grouped[day].sort((a, b) => a.startTime.localeCompare(b.startTime));
    });
    return grouped;
  }, [filteredLessons]);


  const canManageLessons = role === "admin";
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
      return "Tidak ada pelajaran yang ditugaskan kepada anda.";
    }
    if (role === "siswa") {
      return "Tidak ada jadwal pelajaran untuk kelas saat ini.";
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
      return "Tidak ada jadwal pelajaran yang terdaftar untuk kelas anak anda saat ini.";
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
            ? (role === "siswa" ? "Lihat jadwal pelajaran." : `Lihat jadwal pelajaran anak (${authUser?.linkedStudentName || 'Siswa'}).`)
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
              if (!isOpen) { addLessonForm.reset(); addLessonForm.clearErrors(); setIsSpecialistTeacher(false); }
              else if (allSubjects.length === 0 || allClasses.length === 0 || allTeachersWithClasses.length === 0) { fetchAdminDropdownData(); }
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
                    <Label htmlFor="add-lesson-subjectId">Mata Pelajaran <span className="text-destructive">*</span></Label>
                    <Controller name="subjectId" control={addLessonForm.control} render={({ field }) => (
                            <Select onValueChange={(value) => { field.onChange(value); addLessonForm.setValue("teacherId", undefined, { shouldValidate: true }); }} value={field.value || undefined} >
                                <SelectTrigger id="add-lesson-subjectId" className="mt-1"><SelectValue placeholder="Pilih mata pelajaran" /></SelectTrigger>
                                <SelectContent>{allSubjects.map((subject) => (<SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>))}</SelectContent>
                            </Select>
                    )} />
                    {addLessonForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.subjectId.message}</p>}
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="add-lesson-teacherId">Guru Pengajar</Label>
                      <div className="flex items-center space-x-2">
                          <Label htmlFor="specialist-teacher-toggle" className="text-xs text-muted-foreground">Guru Khusus</Label>
                          <Switch
                              id="specialist-teacher-toggle"
                              checked={isSpecialistTeacher}
                              onCheckedChange={setIsSpecialistTeacher}
                          />
                      </div>
                    </div>
                    <Controller name="teacherId" control={addLessonForm.control} render={({field}) => (
                        <Select onValueChange={(value) => { field.onChange(value); addLessonForm.setValue("classId", undefined, { shouldValidate: true }); }} value={field.value || undefined} disabled={!watchSubjectIdForAdd}>
                            <SelectTrigger id="add-lesson-teacherId" className="mt-1"><SelectValue placeholder={!watchSubjectIdForAdd ? "Pilih Mapel Dulu" : "Pilih guru"} /></SelectTrigger>
                            <SelectContent>{teachersForForm.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                        </Select>
                    )} />
                    {addLessonForm.formState.errors.teacherId && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.teacherId.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="add-lesson-classId">Kelas <span className="text-destructive">*</span></Label>
                    <Controller name="classId" control={addLessonForm.control} render={({field}) => (
                        <Select onValueChange={field.onChange} value={field.value || undefined} disabled={!watchTeacherIdForAdd}>
                            <SelectTrigger id="add-lesson-classId" className="mt-1"><SelectValue placeholder={!watchTeacherIdForAdd ? "Pilih guru dulu" : (classesForForm.length > 0 ? "Pilih kelas" : "Tidak ada kelas untuk guru ini")} /></SelectTrigger>
                            <SelectContent>{classesForForm.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                    )} />
                    {addLessonForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.classId.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="add-lesson-dayOfWeek">Hari <span className="text-destructive">*</span></Label>
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
                          <Label htmlFor="add-lesson-startTime">Waktu Mulai <span className="text-destructive">*</span></Label>
                          <Input id="add-lesson-startTime" type="time" {...addLessonForm.register("startTime")} className="mt-1" />
                          {addLessonForm.formState.errors.startTime && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.startTime.message}</p>}
                      </div>
                      <div>
                          <Label htmlFor="add-lesson-endTime">Waktu Selesai <span className="text-destructive">*</span></Label>
                          <Input id="add-lesson-endTime" type="time" {...addLessonForm.register("endTime")} className="mt-1" />
                          {addLessonForm.formState.errors.endTime && <p className="text-sm text-destructive mt-1">{addLessonForm.formState.errors.endTime.message}</p>}
                      </div>
                  </div>
                  <div>
                    <Label htmlFor="add-lesson-topic">Topik</Label>
                    <Input id="add-lesson-topic" {...addLessonForm.register("topic")} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="add-lesson-materials">Materi</Label>
                    <Textarea id="add-lesson-materials" {...addLessonForm.register("materials")} className="mt-1" placeholder="Deskripsi singkat materi atau link..." />
                  </div>
                  <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                    <Button type="submit" disabled={addLessonForm.formState.isSubmitting}>
                        {addLessonForm.formState.isSubmitting && <LottieLoader width={16} height={16} className="mr-2"/>}
                        {addLessonForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Jadwal"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {(role === "admin") && ( 
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
                disabled={isLoading || allClasses.length === 0}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <FilterIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Filter per Kelas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kelas</SelectItem>
                  {isLoading && <SelectItem value="loading-classes" disabled>Memuat kelas...</SelectItem>}
                  {!isLoading && allClasses.length === 0 && <SelectItem value="no-classes" disabled>Tidak ada kelas</SelectItem>}
                  {allClasses.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}
          {isLoading || authLoading ? (
            <div className="space-y-2 mt-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : filteredLessons.length > 0 ? (
            <Accordion type="multiple" defaultValue={DAYS_OF_WEEK} className="w-full space-y-2">
              {DAYS_OF_WEEK.map((day) => {
                const lessonsForDay = lessonsByDay[day];
                if (!lessonsForDay || lessonsForDay.length === 0) return null;
                
                const dayIsActive = DAY_NAMES_ID[getDay(currentTime)] === day;

                return (
                  <AccordionItem value={day} key={day}>
                    <AccordionTrigger className={cn("text-lg font-semibold px-4 rounded-md hover:no-underline", dayIsActive ? "bg-primary/10 text-primary" : "bg-muted/50")}>
                      {day} ({lessonsForDay.length} Pelajaran)
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      <div className="overflow-x-auto">
                        <Table className="table-auto w-full">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[120px]">Waktu</TableHead>
                              <TableHead>Mata Pelajaran</TableHead>
                              {!isMobile && (isStudentOrParent || role ==='guru') ? null : <TableHead>Kelas</TableHead>}
                              {!isMobile && (role==='admin' || role ==='siswa' || role==='orangtua') && <TableHead>Guru</TableHead>}
                              {!isMobile && (canManageLessons || role === 'guru') && <TableHead>Topik</TableHead>}
                              <TableHead className="text-right w-[100px]">Aksi</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                             {lessonsForDay.map((lesson) => {
                               const isActiveNow = isStudentOrParent ? (isLessonCurrentlyActive(lesson) && !!lesson.isLive) : false;
                               return (
                                <TableRow key={lesson.id}>
                                  <TableCell>{lesson.startTime} - {lesson.endTime}</TableCell>
                                  <TableCell className="font-medium">{lesson.subjectName}</TableCell>
                                  {!isMobile && (isStudentOrParent || role ==='guru') ? null : <TableCell>{lesson.className}</TableCell>}
                                  {!isMobile && (role==='admin' || role ==='siswa' || role==='orangtua') && <TableCell>{lesson.teacherName}</TableCell>}
                                  {!isMobile && (canManageLessons || role === 'guru') && <TableCell className="truncate max-w-xs" title={lesson.topic || "-"}>{lesson.topic || "-"}</TableCell>}
                                  <TableCell className="text-right">
                                     {isStudentOrParent ? (
                                        role === "orangtua" ? (
                                          <Button asChild size="sm" variant="outline">
                                            <Link href={`/lessons/${lesson.id}`} aria-label="Lihat Detail">Detail</Link>
                                          </Button>
                                        ) : (
                                          isActiveNow ? (
                                            <Button asChild size="sm" variant="outline" className="border-primary text-primary hover:bg-primary/10">
                                              <Link href={`/lessons/${lesson.id}`} aria-label="Masuk Kelas">Masuk</Link>
                                            </Button>
                                          ) : (
                                            <Button size="sm" variant="outline" disabled>Tutup</Button>
                                          )
                                        )
                                      ) : (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem asChild><Link href={`/lessons/${lesson.id}`}><Eye className="mr-2 h-4 w-4" />Lihat Detail</Link></DropdownMenuItem>
                                          {canManageLessons && (
                                            <>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuItem onClick={() => openEditDialog(lesson)}><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                                              <AlertDialog>
                                                <AlertDialogTrigger asChild><DropdownMenuItem onSelect={(e) => { e.preventDefault(); openDeleteDialog(lesson);}} className="text-destructive focus:bg-destructive/10"><Trash2 className="mr-2 h-4 w-4" />Hapus</DropdownMenuItem></AlertDialogTrigger>
                                                {selectedLesson && selectedLesson.id === lesson.id && (
                                                  <AlertDialogContent>
                                                    <AlertDialogHeader><AlertDialogTitle>Konfirmasi Hapus</AlertDialogTitle><AlertDialogDescription>Yakin ingin menghapus jadwal {selectedLesson.subjectName} ({selectedLesson.className})?</AlertDialogDescription></AlertDialogHeader>
                                                    <AlertDialogFooter><AlertDialogCancel onClick={() => setSelectedLesson(null)}>Batal</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteLesson(selectedLesson.id)}>Hapus</AlertDialogAction></AlertDialogFooter>
                                                  </AlertDialogContent>
                                                )}
                                              </AlertDialog>
                                            </>
                                          )}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
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
            if (!isOpen) { setSelectedLesson(null); editLessonForm.clearErrors(); setIsSpecialistTeacher(false); }
            else if (selectedLesson) { 
              if (allSubjects.length === 0 || allClasses.length === 0 || allTeachersWithClasses.length === 0) fetchAdminDropdownData();
            }
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
                    <Label htmlFor="edit-lesson-subjectId">Mata Pelajaran <span className="text-destructive">*</span></Label>
                    <Controller name="subjectId" control={editLessonForm.control} render={({ field }) => (
                        <Select onValueChange={(value) => { field.onChange(value); editLessonForm.setValue("teacherId", undefined, {shouldValidate: true}); }} value={field.value || undefined}>
                            <SelectTrigger id="edit-lesson-subjectId" className="mt-1"><SelectValue placeholder="Pilih mata pelajaran" /></SelectTrigger>
                            <SelectContent>{allSubjects.map((subject) => (<SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>))}</SelectContent>
                        </Select>
                    )} />
                    {editLessonForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.subjectId.message}</p>}
                </div>
                 <div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="edit-lesson-teacherId">Guru Pengajar</Label>
                       <div className="flex items-center space-x-2">
                          <Label htmlFor="edit-specialist-teacher-toggle" className="text-xs text-muted-foreground">Guru Khusus</Label>
                          <Switch
                              id="edit-specialist-teacher-toggle"
                              checked={isSpecialistTeacher}
                              onCheckedChange={setIsSpecialistTeacher}
                          />
                      </div>
                    </div>
                     <Controller name="teacherId" control={editLessonForm.control} render={({field}) => (
                        <Select onValueChange={(value) => { field.onChange(value); editLessonForm.setValue("classId", undefined, {shouldValidate: true}); }} value={field.value || undefined} disabled={!watchSubjectIdForEdit}>
                          <SelectTrigger id="edit-lesson-teacherId" className="mt-1"><SelectValue placeholder={!watchSubjectIdForEdit ? "Pilih Mapel Dulu" : "Pilih guru"} /></SelectTrigger>
                          <SelectContent>{teachersForForm.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                        </Select>
                    )} />
                    {editLessonForm.formState.errors.teacherId && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.teacherId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="edit-lesson-classId">Kelas<span className="text-destructive">*</span></Label>
                  <Controller name="classId" control={editLessonForm.control} render={({field}) => (
                        <Select onValueChange={field.onChange} value={field.value || undefined} disabled={!watchTeacherIdForEdit}>
                            <SelectTrigger id="edit-lesson-classId" className="mt-1"><SelectValue placeholder={!watchTeacherIdForEdit ? "Pilih guru dulu" : "Pilih kelas"} /></SelectTrigger>
                            <SelectContent>{classesForForm.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                    )} />
                  {editLessonForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.classId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="edit-lesson-dayOfWeek">Hari<span className="text-destructive">*</span></Label>
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
                        <Label htmlFor="edit-lesson-startTime">Waktu Mulai<span className="text-destructive">*</span></Label>
                        <Input id="edit-lesson-startTime" type="time" {...editLessonForm.register("startTime")} className="mt-1" />
                        {editLessonForm.formState.errors.startTime && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.startTime.message}</p>}
                    </div>
                    <div>
                        <Label htmlFor="edit-lesson-endTime">Waktu Selesai<span className="text-destructive">*</span></Label>
                        <Input id="edit-lesson-endTime" type="time" {...editLessonForm.register("endTime")} className="mt-1" />
                        {editLessonForm.formState.errors.endTime && <p className="text-sm text-destructive mt-1">{editLessonForm.formState.errors.endTime.message}</p>}
                    </div>
                </div>
                <div>
                  <Label htmlFor="edit-lesson-topic">Topik</Label>
                  <Input id="edit-lesson-topic" {...editLessonForm.register("topic")} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="edit-lesson-materials">Materi</Label>
                  <Textarea id="edit-lesson-materials" {...editLessonForm.register("materials")} className="mt-1" />
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                  <Button type="submit" disabled={editLessonForm.formState.isSubmitting}>
                    {editLessonForm.formState.isSubmitting && <LottieLoader width={16} height={16} className="mr-2"/>}
                    {editLessonForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
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

    