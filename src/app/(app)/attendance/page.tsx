
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarCheck, CalendarIcon, AlertCircle, Save, FileDown, FileSpreadsheet, Clock, CheckCircle, XCircle, Info, RefreshCw, BookOpen, ExternalLink } from "lucide-react";
import LottieLoader from "@/components/ui/LottieLoader";
import { useState, useEffect } from "react";
import { useForm, useFieldArray, type SubmitHandler, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, startOfDay, getMonth, getYear, setMonth, setYear, lastDayOfMonth, parse, isValid, getDay, isWithinInterval } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase/config";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc, 
  query,
  where,
  Timestamp,
  serverTimestamp,
  orderBy,
  documentId,
  limit
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Link from "next/link";


// --- Types for Teacher/Admin View ---
const ATTENDANCE_STATUSES = ["Hadir", "Sakit", "Izin", "Alpa"] as const;
type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

interface ClassMin { id: string; name: string; }
interface SubjectMin { id: string; name: string; } 
interface StudentMin { id: string; name: string; } 

interface TeacherStudentAttendanceRecord { 
  studentId: string;
  studentName: string; 
  status: AttendanceStatus;
  notes?: string;
}

const teacherAttendanceFormSchema = z.object({ 
  classId: z.string({ required_error: "Pilih kelas." }),
  subjectId: z.string({ required_error: "Pilih mata pelajaran." }),
  date: z.date({ required_error: "Tanggal harus diisi." }),
  studentAttendances: z.array(z.object({
    studentId: z.string(),
    studentName: z.string(),
    status: z.enum(ATTENDANCE_STATUSES, { required_error: "Status harus dipilih." }),
    notes: z.string().optional(),
  })).min(1, "Minimal ada satu siswa untuk mencatat kehadiran."),
});
type TeacherAttendanceFormValues = z.infer<typeof teacherAttendanceFormSchema>; 

interface MonthlyAttendanceSummary {
  studentId: string;
  studentName: string;
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  totalDays: number;
}

const months = [
  { value: 0, label: "Januari" }, { value: 1, label: "Februari" }, { value: 2, label: "Maret" },
  { value: 3, label: "April" }, { value: 4, label: "Mei" }, { value: 5, label: "Juni" },
  { value: 6, label: "Juli" }, { value: 7, label: "Agustus" }, { value: 8, label: "September" },
  { value: 9, label: "Oktober" }, { value: 10, label: "November" }, { value: 11, label: "Desember" }
];

const DAY_NAMES_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

// --- Types for Student View ---
interface StudentLessonDisplay {
  id: string; 
  subjectName?: string;
  dayOfWeek: string;
  startTime: string; 
  endTime: string;   
  statusText?: string; 
  statusIcon?: React.ReactNode; 
}

export interface StudentSelfAttendanceRecord { 
  id?: string; 
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  lessonId: string;
  subjectName?: string;
  lessonTime: string; 
  date: Timestamp; 
  status: "Hadir"; 
  attendedAt: Timestamp; 
}

interface StudentAttendanceViewProps {
  targetStudentId?: string;
  targetStudentName?: string;
  targetStudentClassId?: string;
}


function TeacherAdminAttendanceManagement() {
  const { user, role, loading: authLoading } = useAuth(); 
  const [allClasses, setAllClasses] = useState<ClassMin[]>([]); 
  const [allSubjects, setAllSubjects] = useState<SubjectMin[]>([]); 
  const [classesForDropdown, setClassesForDropdown] = useState<ClassMin[]>([]);
  const [subjectsForDropdown, setSubjectsForDropdown] = useState<SubjectMin[]>([]);

  const [studentsInClassForForm, setStudentsInClassForForm] = useState<StudentMin[]>([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(true); 
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isLoadingExistingAttendance, setIsLoadingExistingAttendance] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | undefined>();
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | undefined>(); 
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [existingAttendanceDocId, setExistingAttendanceDocId] = useState<string | null>(null);

  const [selectedExportMonth, setSelectedExportMonth] = useState<number>(getMonth(new Date()));
  const [selectedExportYear, setSelectedExportYear] = useState<number>(getYear(new Date()));
  const [isExporting, setIsExporting] = useState(false);

  const { toast } = useToast();

  const form = useForm<TeacherAttendanceFormValues>({
    resolver: zodResolver(teacherAttendanceFormSchema),
    defaultValues: {
      classId: undefined,
      subjectId: undefined, 
      date: selectedDate,
      studentAttendances: [],
    },
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "studentAttendances",
  });

  useEffect(() => {
    if (authLoading || !user || !role) return; 

    const fetchInitialDropdownData = async () => {
      setIsLoadingClasses(true);
      setIsLoadingSubjects(true);
      try {
        if (role === 'admin') {
          const classesSnapshot = await getDocs(query(collection(db, "classes"), orderBy("name", "asc")));
          const adminClasses = classesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
          setAllClasses(adminClasses);
          setClassesForDropdown(adminClasses);
          
          const subjectsSnapshot = await getDocs(query(collection(db, "subjects"), orderBy("name", "asc")));
          const adminSubjects = subjectsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
          setAllSubjects(adminSubjects);
          setSubjectsForDropdown(adminSubjects); 
        } else if (role === 'guru' && user.uid) {
            // 1. Find teacher profile ID using Auth UID
            const teacherProfileQuery = query(collection(db, "teachers"), where("uid", "==", user.uid), limit(1));
            const teacherProfileSnapshot = await getDocs(teacherProfileQuery);

            if (teacherProfileSnapshot.empty) {
                toast({ title: "Profil Guru Tidak Ditemukan", description: "Tidak dapat memuat kelas karena profil guru tidak ditemukan.", variant: "warning" });
                setAllClasses([]);
                setClassesForDropdown([]);
                setIsLoadingClasses(false);
                setIsLoadingSubjects(false);
                return;
            }
            const teacherProfileId = teacherProfileSnapshot.docs[0].id;

            // 2. Fetch lessons taught by this teacher using their profile ID
            const lessonsQuery = query(collection(db, "lessons"), where("teacherId", "==", teacherProfileId));
            const lessonsSnapshot = await getDocs(lessonsQuery);
            const taughtLessons = lessonsSnapshot.docs.map(d => d.data());

            const uniqueClassIds = Array.from(new Set(taughtLessons.map(l => l.classId).filter(id => !!id)));
            
            let teacherClasses: ClassMin[] = [];
            if (uniqueClassIds.length > 0) {
              const classChunks = [];
              for (let i = 0; i < uniqueClassIds.length; i += 30) { classChunks.push(uniqueClassIds.slice(i, i + 30)); }
              const classPromises = classChunks.map(chunk => getDocs(query(collection(db, "classes"), where(documentId(), "in", chunk))));
              const classSnapshots = await Promise.all(classPromises);
              classSnapshots.forEach(snap => snap.docs.forEach(d => teacherClasses.push({ id: d.id, name: d.data().name })));
              teacherClasses.sort((a, b) => a.name.localeCompare(b.name));
            }
            setAllClasses(teacherClasses); 
            setClassesForDropdown(teacherClasses);

            // Fetch all subjects for admin to simplify denormalization for now
            // or if needed for other logic. Teacher subjects are filtered later.
            const allSubjectsSnapshot = await getDocs(query(collection(db, "subjects"), orderBy("name", "asc")));
            setAllSubjects(allSubjectsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
            setSubjectsForDropdown([]); 
        }
      } catch (error) {
        console.error("Error fetching initial dropdown data for attendance:", error);
        toast({ title: "Gagal Memuat Data Awal", variant: "destructive" });
        setAllClasses([]);
        setAllSubjects([]);
        setClassesForDropdown([]);
        setSubjectsForDropdown([]);
      } finally {
        setIsLoadingClasses(false);
        setIsLoadingSubjects(false); 
      }
    };
    fetchInitialDropdownData();
  }, [authLoading, user, role, toast]);


  useEffect(() => {
    if (authLoading || !user || !role) return;

    const updateSubjectsForSelectedClass = async () => {
        if (!selectedClassId) {
            if (role === 'admin') setSubjectsForDropdown(allSubjects); 
            else setSubjectsForDropdown([]);
            return;
        }
        setIsLoadingSubjects(true);
        try {
            if (role === 'admin') {
                const lessonsInClassQuery = query(collection(db, "lessons"), where("classId", "==", selectedClassId));
                const lessonsSnapshot = await getDocs(lessonsInClassQuery);
                const subjectIdsInClass = Array.from(new Set(lessonsSnapshot.docs.map(d => d.data().subjectId).filter(id => !!id)));
                
                let subjectsInClass: SubjectMin[] = [];
                if (subjectIdsInClass.length > 0) {
                    const subjectChunks = [];
                    for (let i = 0; i < subjectIdsInClass.length; i += 30) { subjectChunks.push(subjectIdsInClass.slice(i, i+30));}
                    const subjectPromises = subjectChunks.map(chunk => getDocs(query(collection(db,"subjects"), where(documentId(), "in", chunk))));
                    const subjectSnapshots = await Promise.all(subjectPromises);
                    subjectSnapshots.forEach(snap => snap.docs.forEach(d => subjectsInClass.push({id: d.id, name: d.data().name})));
                    subjectsInClass.sort((a,b) => a.name.localeCompare(b.name));
                }
                setSubjectsForDropdown(subjectsInClass);

            } else if (role === 'guru' && user.uid) {
                const teacherProfileQuery = query(collection(db, "teachers"), where("uid", "==", user.uid), limit(1));
                const teacherProfileSnapshot = await getDocs(teacherProfileQuery);

                if (teacherProfileSnapshot.empty) {
                    setSubjectsForDropdown([]);
                    setIsLoadingSubjects(false);
                    return;
                }
                const teacherProfileId = teacherProfileSnapshot.docs[0].id;

                const lessonsQuery = query(collection(db, "lessons"), 
                    where("teacherId", "==", teacherProfileId),
                    where("classId", "==", selectedClassId)
                );
                const lessonsSnapshot = await getDocs(lessonsQuery);
                const subjectIds = Array.from(new Set(lessonsSnapshot.docs.map(d => d.data().subjectId).filter(id => !!id)));

                let teacherSubjectsInClass: SubjectMin[] = [];
                if (subjectIds.length > 0) {
                    const subjectChunks = [];
                    for (let i = 0; i < subjectIds.length; i += 30) { subjectChunks.push(subjectIds.slice(i, i+30));}
                    const subjectPromises = subjectChunks.map(chunk => getDocs(query(collection(db,"subjects"), where(documentId(), "in", chunk))));
                    const subjectSnapshots = await Promise.all(subjectPromises);
                    subjectSnapshots.forEach(snap => snap.docs.forEach(d => teacherSubjectsInClass.push({id: d.id, name: d.data().name})));
                    teacherSubjectsInClass.sort((a,b) => a.name.localeCompare(b.name));
                }
                setSubjectsForDropdown(teacherSubjectsInClass);
                
                if (selectedSubjectId && !teacherSubjectsInClass.find(s => s.id === selectedSubjectId)) {
                    setSelectedSubjectId(undefined);
                    form.setValue("subjectId", undefined);
                }
            }
        } catch (error) {
            console.error("Error updating subjects for class:", error);
            toast({title: "Gagal Memuat Mata Pelajaran Kelas", variant: "destructive"});
            setSubjectsForDropdown([]);
        } finally {
            setIsLoadingSubjects(false);
        }
    };

    updateSubjectsForSelectedClass();
  }, [selectedClassId, role, user, authLoading, toast, allSubjects]); 


  useEffect(() => {
    if (authLoading || (!role || !["admin", "guru"].includes(role))) return;
    if (!selectedClassId) {
      setStudentsInClassForForm([]);
      replace([]); 
      return;
    }
    const fetchStudentsForClassForm = async () => {
      setIsLoadingStudents(true);
      form.setValue("studentAttendances", []); 
      try {
        const studentsQuery = query(collection(db, "users"), where("role", "==", "siswa"), where("classId", "==", selectedClassId), orderBy("name", "asc"));
        const studentsSnapshot = await getDocs(studentsQuery);

        const fetchedStudents: StudentMin[] = studentsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
        setStudentsInClassForForm(fetchedStudents);
        
      } catch (error) {
        console.error("Error fetching students: ", error);
        toast({ title: "Gagal Memuat Siswa", description: "Pastikan siswa memiliki field 'classId' yang benar di koleksi 'users'.", variant: "destructive" });
        setStudentsInClassForForm([]);
        replace([]);
      } finally {
        setIsLoadingStudents(false);
      }
    };
    fetchStudentsForClassForm();
  }, [selectedClassId, toast, replace, form, authLoading, role]);


  useEffect(() => {
    if (authLoading || (!role || !["admin", "guru"].includes(role))) return;
    if (!selectedClassId || !selectedSubjectId || !selectedDate) { 
      setExistingAttendanceDocId(null);
      if (studentsInClassForForm.length > 0 && (!selectedClassId || !selectedSubjectId || !selectedDate)) {
         const resetAttendance = studentsInClassForForm.map(student => ({
          studentId: student.id,
          studentName: student.name,
          status: "Alpa" as AttendanceStatus, 
          notes: "",
        }));
        form.setValue("studentAttendances", resetAttendance);
      }
      return;
    }

    const fetchAttendanceData = async () => {
      setIsLoadingExistingAttendance(true);
      setExistingAttendanceDocId(null);
      const dateToQuery = Timestamp.fromDate(startOfDay(selectedDate));
      const currentDayName = DAY_NAMES_ID[getDay(selectedDate)];

      try {
        const attendanceQuery = query(
          collection(db, "attendances"),
          where("classId", "==", selectedClassId),
          where("subjectId", "==", selectedSubjectId), 
          where("date", "==", dateToQuery)
        );
        const attendanceSnapshot = await getDocs(attendanceQuery);

        if (!attendanceSnapshot.empty) {
          const attendanceDoc = attendanceSnapshot.docs[0];
          setExistingAttendanceDocId(attendanceDoc.id);
          const data = attendanceDoc.data() as Omit<TeacherAttendanceFormValues, 'date'> & { date: Timestamp, studentAttendances: TeacherStudentAttendanceRecord[], subjectId: string };
          
          const currentClassStudents = studentsInClassForForm.length > 0 ? studentsInClassForForm : (await getDocs(query(collection(db, "users"), where("role", "==", "siswa"), where("classId", "==", selectedClassId), orderBy("name", "asc")))).docs.map(d => ({id: d.id, name: d.data().name}));

          const mergedStudentAttendances = currentClassStudents.map(student => {
            const existingRecord = data.studentAttendances.find(sa => sa.studentId === student.id);
            return existingRecord || { 
              studentId: student.id,
              studentName: student.name,
              status: "Alpa" as AttendanceStatus, 
              notes: "",
            };
          });
          form.setValue("studentAttendances", mergedStudentAttendances);

        } else { 
          if (studentsInClassForForm.length > 0) {
            const lessonsQuery = query(collection(db, "lessons"),
              where("classId", "==", selectedClassId),
              where("subjectId", "==", selectedSubjectId),
              where("dayOfWeek", "==", currentDayName)
            );
            const lessonsSnapshot = await getDocs(lessonsQuery);
            const relevantLessonIds = lessonsSnapshot.docs.map(doc => doc.id);

            const studentAttendancePromises = studentsInClassForForm.map(async (student) => {
              let studentStatus: AttendanceStatus = "Alpa"; 
              if (relevantLessonIds.length > 0) {
                const selfAttendanceQuery = query(
                  collection(db, "studentAttendanceRecords"),
                  where("studentId", "==", student.id),
                  where("date", "==", dateToQuery),
                  where("lessonId", "in", relevantLessonIds) 
                );
                const selfAttendanceSnapshot = await getDocs(selfAttendanceQuery);
                if (!selfAttendanceSnapshot.empty) {
                  selfAttendanceSnapshot.forEach(doc => {
                    if (doc.data().status === "Hadir") {
                      studentStatus = "Hadir";
                    }
                  });
                }
              }
              return {
                studentId: student.id,
                studentName: student.name,
                status: studentStatus,
                notes: "",
              };
            });
            
            const initialAttendanceWithSelfCheck = await Promise.all(studentAttendancePromises);
            form.setValue("studentAttendances", initialAttendanceWithSelfCheck);
          } else {
            form.setValue("studentAttendances", []);
          }
        }
      } catch (error) {
        console.error("Error fetching attendance: ", error);
        toast({ title: "Gagal Memuat Data Kehadiran", variant: "destructive" });
      } finally {
        setIsLoadingExistingAttendance(false);
      }
    };

    if(studentsInClassForForm.length > 0 || !isLoadingStudents) { 
        fetchAttendanceData();
    }

  }, [selectedClassId, selectedSubjectId, selectedDate, toast, form, studentsInClassForForm, isLoadingStudents, authLoading, role]);

  const handleSaveAttendance: SubmitHandler<TeacherAttendanceFormValues> = async (data) => {
    setIsSubmitting(true);
    const attendanceDate = Timestamp.fromDate(startOfDay(data.date));
    const selectedClass = allClasses.find(c => c.id === data.classId); 
    const selectedSubject = allSubjects.find(s => s.id === data.subjectId); 

    if (!user || !selectedClass || !selectedSubject) { 
        toast({ title: "Data tidak lengkap", description: "Pengguna, kelas, atau mata pelajaran tidak ditemukan.", variant: "destructive"});
        setIsSubmitting(false);
        return;
    }

    const attendanceDocumentData = {
      classId: data.classId,
      className: selectedClass.name,
      subjectId: data.subjectId,       
      subjectName: selectedSubject.name, 
      date: attendanceDate,
      studentAttendances: data.studentAttendances,
      recordedById: user.uid,
      recordedByName: user.displayName || user.email || "N/A",
      lastUpdatedAt: serverTimestamp(),
      createdAt: existingAttendanceDocId ? undefined : serverTimestamp(), 
    };
    if (attendanceDocumentData.createdAt === undefined) {
      delete (attendanceDocumentData as any).createdAt;
    }

    try {
      let docIdToSave = existingAttendanceDocId;
      if (!docIdToSave) {
        docIdToSave = doc(collection(db, "attendances")).id; 
      }
      await setDoc(doc(db, "attendances", docIdToSave), attendanceDocumentData, { merge: true }); 
      setExistingAttendanceDocId(docIdToSave); 
      toast({ title: "Kehadiran Disimpan", description: "Data kehadiran berhasil disimpan." });
    } catch (error) {
      console.error("Error saving attendance: ", error);
      toast({ title: "Gagal Menyimpan Kehadiran", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    form.setValue("classId", classId);
    form.setValue("studentAttendances", []); 
    setStudentsInClassForForm([]); 
    setExistingAttendanceDocId(null); 
    setSelectedSubjectId(undefined); 
    form.setValue("subjectId", undefined);
  };
  
  const handleSubjectChange = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    form.setValue("subjectId", subjectId);
    setExistingAttendanceDocId(null); 
  };

  const handleDateChange = (date?: Date) => {
    if (date) {
      const newDate = startOfDay(date);
      setSelectedDate(newDate);
      form.setValue("date", newDate);
      setExistingAttendanceDocId(null); 
    }
  };

  const handleExportDailyExcel = async () => {
    if (!selectedClassId || !selectedSubjectId || !selectedDate || fields.length === 0) {
      toast({ title: "Data Tidak Lengkap", description: "Pilih kelas, mata pelajaran, tanggal, dan pastikan ada data kehadiran untuk diekspor.", variant: "destructive" });
      return;
    }
    setIsExporting(true);
    try {
      const selectedClassObj = allClasses.find(c => c.id === selectedClassId);
      const selectedSubjectObj = allSubjects.find(s => s.id === selectedSubjectId);
      const className = selectedClassObj?.name || "Kelas Tidak Diketahui";
      const subjectName = selectedSubjectObj?.name || "Mapel Tidak Diketahui";
      const formattedDate = format(selectedDate, "yyyy-MM-dd", { locale: indonesiaLocale });
      const fileName = `Kehadiran_${className.replace(/\s+/g, '_')}_${subjectName.replace(/\s+/g, '_')}_${formattedDate}.xlsx`;

      const dataToExport = fields.map(record => ({
        "Nama Siswa": record.studentName,
        "Status": record.status,
        "Catatan": record.notes || "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Kehadiran ${formattedDate}`);
      
      XLSX.utils.sheet_add_aoa(worksheet, [
        [`Laporan Kehadiran Harian - Kelas: ${className} - Mata Pelajaran: ${subjectName} - Tanggal: ${format(selectedDate, "dd MMMM yyyy", { locale: indonesiaLocale })}`],
        [] 
      ], { origin: "A1" });

      const cols = Object.keys(dataToExport[0] || {}).map(key => ({ wch: Math.max(20, key.length + 5) }));
      worksheet['!cols'] = cols;

      XLSX.writeFile(workbook, fileName);
      toast({ title: "Ekspor Berhasil", description: `${fileName} telah diunduh.` });
    } catch (error) {
      console.error("Error exporting daily to Excel:", error);
      toast({ title: "Gagal Mengekspor ke Excel", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportDailyPdf = async () => {
    if (!selectedClassId || !selectedSubjectId || !selectedDate || fields.length === 0) {
      toast({ title: "Data Tidak Lengkap", description: "Pilih kelas, mata pelajaran, tanggal, dan pastikan ada data kehadiran untuk diekspor.", variant: "destructive" });
      return;
    }
    setIsExporting(true);
    try {
      const selectedClassObj = allClasses.find(c => c.id === selectedClassId);
      const selectedSubjectObj = allSubjects.find(s => s.id === selectedSubjectId);
      const className = selectedClassObj?.name || "Kelas Tidak Diketahui";
      const subjectName = selectedSubjectObj?.name || "Mapel Tidak Diketahui";
      const formattedDate = format(selectedDate, "dd MMMM yyyy", { locale: indonesiaLocale });
      const fileName = `Kehadiran_${className.replace(/\s+/g, '_')}_${subjectName.replace(/\s+/g, '_')}_${format(selectedDate, "yyyy-MM-dd")}.pdf`;

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`Laporan Kehadiran Harian`, 14, 15);
      doc.setFontSize(12);
      doc.text(`Kelas: ${className}`, 14, 22);
      doc.text(`Mata Pelajaran: ${subjectName}`, 14, 29);
      doc.text(`Tanggal: ${formattedDate}`, 14, 36);


      const tableColumn = ["No", "Nama Siswa", "Status", "Catatan"];
      const tableRows: (string | number)[][] = [];

      fields.forEach((record, index) => {
        const attendanceData = [
          index + 1,
          record.studentName,
          record.status,
          record.notes || "-",
        ];
        tableRows.push(attendanceData);
      });

      autoTable(doc, {
        startY: 42,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [22, 160, 133] }, 
      });

      doc.save(fileName);
      toast({ title: "Ekspor PDF Berhasil", description: `${fileName} telah diunduh.` });
    } catch (error) {
      console.error("Error exporting daily to PDF:", error);
      toast({ title: "Gagal Mengekspor ke PDF", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };
  
  const generateMonthlyAttendanceSummary = async (classId: string, subjectId: string, year: number, month: number): Promise<MonthlyAttendanceSummary[]> => {
    const startDate = startOfDay(setMonth(setYear(new Date(), year), month));
    const endDate = lastDayOfMonth(startDate);

    const studentsSnapshot = await getDocs(query(collection(db, "users"), where("role", "==", "siswa"), where("classId", "==", classId), orderBy("name")));
    const classStudents: StudentMin[] = studentsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));

    const studentSummaries: Record<string, MonthlyAttendanceSummary> = {};
    classStudents.forEach(student => {
        studentSummaries[student.id] = {
            studentId: student.id,
            studentName: student.name,
            hadir: 0, sakit: 0, izin: 0, alpa: 0,
            totalDays: 0, 
        };
    });
    
    const attendanceQuery = query(
        collection(db, "attendances"),
        where("classId", "==", classId),
        where("subjectId", "==", subjectId),
        where("date", ">=", Timestamp.fromDate(startDate)),
        where("date", "<=", Timestamp.fromDate(endDate))
    );
    const attendanceSnapshot = await getDocs(attendanceQuery);
    const attendedDaysPerStudent: Record<string, Set<string>> = {};

    attendanceSnapshot.docs.forEach(docSnap => {
        const attendanceDayData = docSnap.data() as Omit<TeacherAttendanceFormValues, 'date'> & { date: Timestamp, studentAttendances: TeacherStudentAttendanceRecord[] };
        const dateStr = format(attendanceDayData.date.toDate(), "yyyy-MM-dd");

        attendanceDayData.studentAttendances.forEach(record => {
            if (studentSummaries[record.studentId]) {
                 if (!attendedDaysPerStudent[record.studentId]) {
                    attendedDaysPerStudent[record.studentId] = new Set();
                }
                attendedDaysPerStudent[record.studentId].add(dateStr);

                switch (record.status) {
                    case "Hadir": studentSummaries[record.studentId].hadir++; break;
                    case "Sakit": studentSummaries[record.studentId].sakit++; break;
                    case "Izin": studentSummaries[record.studentId].izin++; break;
                    case "Alpa": studentSummaries[record.studentId].alpa++; break;
                }
            }
        });
    });

    Object.keys(studentSummaries).forEach(studentId => {
        studentSummaries[studentId].totalDays = attendedDaysPerStudent[studentId] ? attendedDaysPerStudent[studentId].size : 0;
    });

    return Object.values(studentSummaries);
  };

  const handleExportMonthlyExcel = async () => {
     if (!selectedClassId || !selectedSubjectId || selectedExportMonth === null || !selectedExportYear) {
      toast({ title: "Data Tidak Lengkap", description: "Pilih kelas, mata pelajaran, bulan, dan tahun untuk ekspor bulanan.", variant: "destructive" });
      return;
    }
    setIsExporting(true);
    try {
      const summaryData = await generateMonthlyAttendanceSummary(selectedClassId, selectedSubjectId, selectedExportYear, selectedExportMonth);
      if (summaryData.length === 0) {
        toast({ title: "Tidak Ada Data", description: "Tidak ada data kehadiran untuk mata pelajaran, bulan dan kelas yang dipilih.", variant: "info" });
        setIsExporting(false);
        return;
      }

      const selectedClassObj = allClasses.find(c => c.id === selectedClassId);
      const selectedSubjectObj = allSubjects.find(s => s.id === selectedSubjectId);
      const className = selectedClassObj?.name || "Kelas Tidak Diketahui";
      const subjectName = selectedSubjectObj?.name || "Mapel Tidak Diketahui";
      const monthName = months.find(m => m.value === selectedExportMonth)?.label || "Bulan";
      const fileName = `Rekap_Kehadiran_${className.replace(/\s+/g, '_')}_${subjectName.replace(/\s+/g, '_')}_${monthName}_${selectedExportYear}.xlsx`;

      const dataToExport = summaryData.map(record => ({
        "Nama Siswa": record.studentName,
        "Hadir": record.hadir,
        "Sakit": record.sakit,
        "Izin": record.izin,
        "Alpa": record.alpa,
        "Total Hari Tercatat": record.totalDays,
      }));
      
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `${monthName} ${selectedExportYear}`);
      
      XLSX.utils.sheet_add_aoa(worksheet, [
        [`Laporan Kehadiran Bulanan - Kelas: ${className} - Mata Pelajaran: ${subjectName}`],
        [`Bulan: ${monthName} ${selectedExportYear}`],
        [] 
      ], { origin: "A1" });

      const cols = Object.keys(dataToExport[0] || {}).map(key => ({ wch: Math.max(15, key.length + 2) }));
      worksheet['!cols'] = cols;

      XLSX.writeFile(workbook, fileName);
      toast({ title: "Ekspor Bulanan Berhasil", description: `${fileName} telah diunduh.` });

    } catch (error) {
        console.error("Error exporting monthly to Excel:", error);
        toast({ title: "Gagal Mengekspor Rekap Bulanan Excel", variant: "destructive" });
    } finally {
        setIsExporting(false);
    }
  };

  const handleExportMonthlyPdf = async () => {
    if (!selectedClassId || !selectedSubjectId || selectedExportMonth === null || !selectedExportYear) {
      toast({ title: "Data Tidak Lengkap", description: "Pilih kelas, mata pelajaran, bulan, dan tahun untuk ekspor bulanan.", variant: "destructive" });
      return;
    }
    setIsExporting(true);
    try {
      const summaryData = await generateMonthlyAttendanceSummary(selectedClassId, selectedSubjectId, selectedExportYear, selectedExportMonth);
       if (summaryData.length === 0) {
        toast({ title: "Tidak Ada Data", description: "Tidak ada data kehadiran untuk mata pelajaran, bulan dan kelas yang dipilih.", variant: "info" });
        setIsExporting(false);
        return;
      }

      const selectedClassObj = allClasses.find(c => c.id === selectedClassId);
      const selectedSubjectObj = allSubjects.find(s => s.id === selectedSubjectId);
      const className = selectedClassObj?.name || "Kelas Tidak Diketahui";
      const subjectName = selectedSubjectObj?.name || "Mapel Tidak Diketahui";
      const monthName = months.find(m => m.value === selectedExportMonth)?.label || "Bulan";
      const fileName = `Rekap_Kehadiran_${className.replace(/\s+/g, '_')}_${subjectName.replace(/\s+/g, '_')}_${monthName}_${selectedExportYear}.pdf`;

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`Laporan Kehadiran Bulanan`, 14, 15);
      doc.setFontSize(12);
      doc.text(`Kelas: ${className}`, 14, 22);
      doc.text(`Mata Pelajaran: ${subjectName}`, 14, 29);
      doc.text(`Bulan: ${monthName} ${selectedExportYear}`, 14, 36);

      const tableColumn = ["No", "Nama Siswa", "Hadir", "Sakit", "Izin", "Alpa", "Total Hari"];
      const tableRows: (string | number)[][] = [];

      summaryData.forEach((record, index) => {
        const rowData = [
          index + 1,
          record.studentName,
          record.hadir,
          record.sakit,
          record.izin,
          record.alpa,
          record.totalDays,
        ];
        tableRows.push(rowData);
      });
      
      autoTable(doc, {
        startY: 42,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185] }, 
      });

      doc.save(fileName);
      toast({ title: "Ekspor PDF Bulanan Berhasil", description: `${fileName} telah diunduh.` });


    } catch (error) {
        console.error("Error exporting monthly to PDF:", error);
        toast({ title: "Gagal Mengekspor Rekap Bulanan PDF", variant: "destructive" });
    } finally {
        setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Kehadiran</h1>
        <p className="text-muted-foreground">Catat dan pantau kehadiran siswa per mata pelajaran.</p>
      </div>
      <form onSubmit={form.handleSubmit(handleSaveAttendance)}>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-6 w-6 text-primary" />
              <span>Catat Kehadiran</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <Label htmlFor="classId-teacher">Kelas</Label>
                <Select
                  value={selectedClassId}
                  onValueChange={handleClassChange}
                  disabled={isLoadingClasses || isSubmitting}
                >
                  <SelectTrigger id="classId-teacher" className="mt-1">
                    <SelectValue placeholder={isLoadingClasses ? "Memuat kelas..." : "Pilih kelas"} />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingClasses && <SelectItem value="loading" disabled>Memuat...</SelectItem>}
                    {classesForDropdown.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    {classesForDropdown.length === 0 && !isLoadingClasses && <SelectItem value="no-classes" disabled>Tidak ada kelas tersedia.</SelectItem>}
                  </SelectContent>
                </Select>
                {form.formState.errors.classId && <p className="text-sm text-destructive mt-1">{form.formState.errors.classId.message}</p>}
              </div>
               <div>
                <Label htmlFor="subjectId-teacher">Mata Pelajaran</Label>
                <Select
                  value={selectedSubjectId}
                  onValueChange={handleSubjectChange}
                  disabled={isLoadingSubjects || isSubmitting || !selectedClassId || (subjectsForDropdown.length === 0 && !!selectedClassId)}
                >
                  <SelectTrigger id="subjectId-teacher" className="mt-1">
                    <SelectValue placeholder={!selectedClassId ? "Pilih kelas dulu" : (isLoadingSubjects ? "Memuat mapel..." : ((subjectsForDropdown.length === 0 && !!selectedClassId) ? "Tidak ada mapel di kelas ini" : "Pilih mata pelajaran"))} />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingSubjects && <SelectItem value="loading" disabled>Memuat...</SelectItem>}
                    {subjectsForDropdown.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    {subjectsForDropdown.length === 0 && !isLoadingSubjects && selectedClassId && <SelectItem value="no-subjects" disabled>Tidak ada mapel di kelas ini.</SelectItem>}
                  </SelectContent>
                </Select>
                {form.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{form.formState.errors.subjectId.message}</p>}
              </div>
              <div>
                <Label htmlFor="date-teacher">Tanggal</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className="w-full justify-start text-left font-normal mt-1"
                      disabled={isLoadingExistingAttendance || isSubmitting || !selectedClassId || !selectedSubjectId}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "PPP", { locale: indonesiaLocale }) : <span>Pilih tanggal</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateChange}
                      initialFocus
                      disabled={isLoadingExistingAttendance || isSubmitting}
                    />
                  </PopoverContent>
                </Popover>
                 {form.formState.errors.date && <p className="text-sm text-destructive mt-1">{form.formState.errors.date.message}</p>}
              </div>
            </div>

            {selectedClassId && selectedSubjectId && selectedDate && (
              isLoadingStudents || isLoadingExistingAttendance ? (
                <div className="space-y-2 mt-4">
                  <Skeleton className="h-8 w-full" /> <Skeleton className="h-8 w-full" /> <Skeleton className="h-8 w-full" />
                </div>
              ) : studentsInClassForForm.length === 0 && !isLoadingStudents ? (
                 <div className="mt-4 p-4 border border-dashed border-border rounded-md text-center text-muted-foreground">
                    Tidak ada siswa di kelas ini atau data siswa belum termuat.
                 </div>
              ) : fields.length > 0 ? (
                <div className="mt-4 space-y-4">
                  <h3 className="text-lg font-medium">Daftar Siswa ({fields.length} siswa)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="border-b"><tr><th className="p-2 text-left">Nama Siswa</th><th className="p-2 text-left w-36">Status</th><th className="p-2 text-left">Catatan (Opsional)</th></tr></thead>
                        <tbody>
                        {fields.map((item, index) => (
                            <tr key={item.id} className="border-b">
                            <td className="p-2 font-medium">{item.studentName}</td>
                            <td className="p-2">
                                <Controller
                                name={`studentAttendances.${index}.status`}
                                control={form.control}
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>{ATTENDANCE_STATUSES.map(status => (<SelectItem key={status} value={status}>{status}</SelectItem>))}</SelectContent>
                                    </Select>
                                )}/>
                                {form.formState.errors.studentAttendances?.[index]?.status && (<p className="text-sm text-destructive mt-1">{form.formState.errors.studentAttendances?.[index]?.status?.message}</p>)}
                            </td>
                            <td className="p-2">
                                <Input {...form.register(`studentAttendances.${index}.notes`)} placeholder="Catatan..." className="mt-0" disabled={isSubmitting}/>
                            </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                  </div>
                  {form.formState.errors.studentAttendances && !form.formState.errors.studentAttendances.message && (<p className="text-sm text-destructive mt-1">Periksa kembali input kehadiran siswa.</p>)}
                   {form.formState.errors.studentAttendances?.message && (<p className="text-sm text-destructive mt-1">{form.formState.errors.studentAttendances?.message}</p>)}
                </div>
              ) :  (selectedClassId && selectedSubjectId && selectedDate && !isLoadingStudents && !isLoadingExistingAttendance && studentsInClassForForm.length > 0 && fields.length === 0 && <p className="mt-4 text-center text-muted-foreground">Memuat data siswa atau status kehadiran...</p>)
            )}
            {fields.length > 0 && selectedClassId && selectedSubjectId && selectedDate && !isLoadingStudents && !isLoadingExistingAttendance && (
              <div className="flex justify-end mt-6">
                <Button type="submit" disabled={isSubmitting || isLoadingExistingAttendance || isLoadingStudents}>
                  {isSubmitting && <LottieLoader width={16} height={16} className="mr-2" />}
                  {isSubmitting ? "Menyimpan..." : (existingAttendanceDocId ? "Perbarui Kehadiran" : "Simpan Kehadiran")}
                  {!isSubmitting && <Save className="ml-2 h-4 w-4" />}
                </Button>
              </div>
            )}
             {form.formState.errors.root && (<p className="text-sm font-medium text-destructive">{form.formState.errors.root.message}</p>)}
          </CardContent>
        </Card>
      </form>

      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader><CardTitle className="flex items-center gap-2"><FileDown className="h-6 w-6 text-primary" /><span>Rekap & Ekspor Kehadiran</span></CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <Label htmlFor="exportClassId">Kelas</Label>
              <Select value={selectedClassId} onValueChange={(value) => setSelectedClassId(value)} disabled={isLoadingClasses || isExporting}>
                <SelectTrigger id="exportClassId" className="mt-1"><SelectValue placeholder={isLoadingClasses ? "Memuat..." : "Pilih kelas"} /></SelectTrigger>
                <SelectContent>{classesForDropdown.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
             <div>
              <Label htmlFor="exportSubjectId">Mata Pelajaran</Label>
              <Select value={selectedSubjectId} onValueChange={(value) => setSelectedSubjectId(value)} disabled={isLoadingSubjects || isExporting || !selectedClassId}>
                <SelectTrigger id="exportSubjectId" className="mt-1"><SelectValue placeholder={!selectedClassId ? "Pilih kelas dulu" : (isLoadingSubjects ? "Memuat..." : "Pilih mapel")} /></SelectTrigger>
                <SelectContent>{subjectsForDropdown.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="exportMonth">Bulan</Label>
              <Select value={selectedExportMonth.toString()} onValueChange={(value) => setSelectedExportMonth(parseInt(value))} disabled={isExporting}>
                <SelectTrigger id="exportMonth" className="mt-1"><SelectValue placeholder="Pilih bulan" /></SelectTrigger>
                <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="exportYear">Tahun</Label>
              <Input id="exportYear" type="number" value={selectedExportYear} onChange={(e) => setSelectedExportYear(parseInt(e.target.value))} className="mt-1" placeholder="Contoh: 2024" disabled={isExporting}/>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <DropdownMenu><DropdownMenuTrigger asChild><Button disabled={isExporting}>{isExporting && <LottieLoader width={16} height={16} className="mr-2" />}<FileDown className="mr-2 h-4 w-4" /> Ekspor</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportDailyExcel} disabled={isExporting || !selectedClassId || !selectedSubjectId || !selectedDate || fields.length === 0}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel Harian</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportDailyPdf} disabled={isExporting || !selectedClassId || !selectedSubjectId || !selectedDate || fields.length === 0}><FileDown className="mr-2 h-4 w-4" /> PDF Harian</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportMonthlyExcel} disabled={isExporting || !selectedClassId || !selectedSubjectId || selectedExportMonth === null || !selectedExportYear}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel Bulanan</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportMonthlyPdf} disabled={isExporting || !selectedClassId || !selectedSubjectId || selectedExportMonth === null || !selectedExportYear}><FileDown className="mr-2 h-4 w-4" /> PDF Bulanan</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardFooter>
      </Card>
    </div>
  );
}


function StudentAttendanceView({ targetStudentId, targetStudentName, targetStudentClassId }: StudentAttendanceViewProps) {
  const { user: authUser, loading: authLoading, role } = useAuth(); 
  const { toast } = useToast();
  const [todayLessons, setTodayLessons] = useState<StudentLessonDisplay[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Map<string, StudentSelfAttendanceRecord>>(new Map());
  const [isLoadingView, setIsLoadingView] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const studentToView = {
    id: targetStudentId || authUser?.uid,
    name: targetStudentName || authUser?.displayName,
    classId: targetStudentClassId || authUser?.classId,
  };
  
  const isParentView = !!targetStudentId;

  const fetchStudentScheduleAndAttendance = async () => {
    if (!studentToView.id || !studentToView.classId) {
      setIsLoadingView(false);
      setTodayLessons([]);
      return;
    }
    setIsLoadingView(true);

    try {
      const todayObj = new Date();
      const currentDayName = DAY_NAMES_ID[todayObj.getDay()];

      const lessonsQueryInstance = query(
        collection(db, "lessons"),
        where("classId", "==", studentToView.classId),
        where("dayOfWeek", "==", currentDayName),
        orderBy("startTime", "asc")
      );
      const lessonsSnapshot = await getDocs(lessonsQueryInstance);
      const fetchedLessons: StudentLessonDisplay[] = lessonsSnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return { id: docSnap.id, subjectName: data.subjectName, dayOfWeek: data.dayOfWeek, startTime: data.startTime, endTime: data.endTime };
      });
      
      const currentRunRecordsMap = new Map<string, StudentSelfAttendanceRecord>();
      if (fetchedLessons.length > 0) {
        const lessonIds = fetchedLessons.map(l => l.id);
        const attendanceQueryInstance = query(
          collection(db, "studentAttendanceRecords"),
          where("studentId", "==", studentToView.id),
          where("date", "==", Timestamp.fromDate(startOfDay(todayObj))), 
          where("lessonId", "in", lessonIds.length > 0 ? lessonIds : ["_empty_"]) 
        );
        const attendanceSnapshot = await getDocs(attendanceQueryInstance);
        attendanceSnapshot.forEach(docSnap => {
          const data = docSnap.data() as Omit<StudentSelfAttendanceRecord, 'id'>; 
          currentRunRecordsMap.set(data.lessonId, { id: docSnap.id, ...data });
        });
      }
      setAttendanceRecords(currentRunRecordsMap);
      
      const lessonsWithStatus = fetchedLessons.map(lesson => {
         const statusInfo = getLessonStatus(lesson, currentRunRecordsMap); 
         return {...lesson, statusText: statusInfo.text, statusIcon: statusInfo.icon }
      });
      setTodayLessons(lessonsWithStatus);

    } catch (error) {
      console.error("Error fetching student schedule/attendance: ", error);
      toast({ title: "Gagal Memuat Jadwal", variant: "destructive" });
    } finally {
      setIsLoadingView(false);
    }
  };

  useEffect(() => {
    if (!authLoading && studentToView.id) {
      fetchStudentScheduleAndAttendance();
    } else if (!authLoading && !studentToView.id){
        setIsLoadingView(false);
    }
  }, [authLoading, studentToView.id, studentToView.classId]); 

  const getLessonStatus = (lesson: StudentLessonDisplay, currentAttendanceRecords: Map<string, StudentSelfAttendanceRecord>) => {
    const now = new Date(); 
    const today = startOfDay(now);

    const lessonStart = lesson.startTime ? parse(lesson.startTime, "HH:mm", today) : null;
    const lessonEnd = lesson.endTime ? parse(lesson.endTime, "HH:mm", today) : null;

    if (!lessonStart || !lessonEnd || !isValid(lessonStart) || !isValid(lessonEnd)) {
        return { text: "Jadwal Error", icon: <Info className="h-5 w-5 text-orange-400" /> };
    }
    
    const attendedRecord = currentAttendanceRecords.get(lesson.id);
    if (attendedRecord) {
      return { text: `Hadir (${format(attendedRecord.attendedAt.toDate(), "HH:mm")})`, icon: <CheckCircle className="h-5 w-5 text-green-500" /> };
    }
    if (now < lessonStart) {
      return { text: "Belum Dimulai", icon: <Clock className="h-5 w-5 text-gray-400" /> };
    }
    if (now >= lessonStart && now <= lessonEnd) {
      return { text: "Sesi Berlangsung (Belum Absen)", icon: <Clock className="h-5 w-5 text-blue-500" /> };
    }
    return { text: "Sesi Berakhir (Belum Absen)", icon: <XCircle className="h-5 w-5 text-red-500" /> };
  };


  const handleExportStudentDailyPdf = async () => {
    if (!studentToView.name || todayLessons.length === 0) {
      toast({ title: "Tidak Ada Data", description: "Tidak ada data kehadiran harian untuk diekspor.", variant: "info" });
      return;
    }
    setIsExporting(true);
    try {
      const studentName = studentToView.name;
      const currentDate = format(new Date(), "dd MMMM yyyy", { locale: indonesiaLocale });
      const fileName = `Kehadiran_Harian_${studentName.replace(/\s+/g, '_')}_${format(new Date(), "yyyy-MM-dd")}.pdf`;

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`Laporan Kehadiran Harian`, 14, 15);
      doc.setFontSize(12);
      doc.text(`Nama Siswa: ${studentName}`, 14, 22);
      doc.text(`Tanggal: ${currentDate}`, 14, 29);

      const tableColumn = ["No", "Mata Pelajaran", "Waktu", "Status Kehadiran"];
      const tableRows: (string | number)[][] = [];

      todayLessons.forEach((lesson, index) => {
        const lessonData = [
          index + 1,
          lesson.subjectName || "N/A",
          `${lesson.startTime} - ${lesson.endTime}`,
          lesson.statusText || "N/A", 
        ];
        tableRows.push(lessonData);
      });

      autoTable(doc, {
        startY: 36,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [64, 149, 237] }, 
      });

      doc.save(fileName);
      toast({ title: "Ekspor PDF Harian Berhasil", description: `${fileName} telah diunduh.` });
    } catch (error) {
      console.error("Error exporting student daily to PDF:", error);
      toast({ title: "Gagal Mengekspor PDF Harian", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportStudentDailyExcel = async () => {
    if (!studentToView.name || todayLessons.length === 0) {
      toast({ title: "Tidak Ada Data", description: "Tidak ada data kehadiran harian untuk diekspor.", variant: "info" });
      return;
    }
    setIsExporting(true);
    try {
      const studentName = studentToView.name;
      const currentDate = format(new Date(), "dd MMMM yyyy", { locale: indonesiaLocale });
      const fileName = `Kehadiran_Harian_${studentName.replace(/\s+/g, '_')}_${format(new Date(), "yyyy-MM-dd")}.xlsx`;

      const dataToExport = todayLessons.map((lesson, index) => ({
        "No": index + 1,
        "Mata Pelajaran": lesson.subjectName || "N/A",
        "Waktu": `${lesson.startTime} - ${lesson.endTime}`,
        "Status Kehadiran": lesson.statusText || "N/A",
      }));

      const worksheet = XLSX.utils.json_to_sheet([]);
      XLSX.utils.sheet_add_aoa(worksheet, [
        [`Laporan Kehadiran Harian - Nama Siswa: ${studentName}`],
        [`Tanggal: ${currentDate}`],
        [] 
      ], { origin: "A1" });
      XLSX.utils.sheet_add_json(worksheet, dataToExport, { origin: "A4", skipHeader: false });


      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Kehadiran ${format(new Date(), "yyyy-MM-dd")}`);
      
      const cols = Object.keys(dataToExport[0] || {}).map(key => ({ wch: Math.max(15, key.length + 5) }));
      worksheet['!cols'] = cols;

      XLSX.writeFile(workbook, fileName);
      toast({ title: "Ekspor Excel Harian Berhasil", description: `${fileName} telah diunduh.` });
    } catch (error) {
      console.error("Error exporting student daily to Excel:", error);
      toast({ title: "Gagal Mengekspor Excel Harian", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoadingView) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Kehadiran {isParentView ? `Anak (${studentToView.name || '...'})` : 'Saya'}</h1>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardHeader><CardTitle>Jadwal Hari Ini</CardTitle></CardHeader>
          <CardContent className="pt-6"> <Skeleton className="h-10 w-full mb-4" /> <Skeleton className="h-10 w-full mb-4" /> </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
            <h1 className="text-3xl font-bold font-headline">Rekap Kehadiran {isParentView ? `Anak (${studentToView.name || '...'})` : 'Saya'}</h1>
            <p className="text-muted-foreground">Hari/Tanggal: {format(new Date(), "eeee, dd MMMM yyyy", { locale: indonesiaLocale })}</p>
        </div>
        <div className="flex gap-2 self-start sm:self-center">
            <Button onClick={fetchStudentScheduleAndAttendance} variant="outline" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh Status
            </Button>
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={isExporting || todayLessons.length === 0}>
                        {isExporting && <LottieLoader width={16} height={16} className="mr-2" />}
                        <FileDown className="mr-2 h-4 w-4" /> Ekspor
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleExportStudentDailyPdf} disabled={isExporting || todayLessons.length === 0}>
                        <FileDown className="mr-2 h-4 w-4" /> PDF Harian
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportStudentDailyExcel} disabled={isExporting || todayLessons.length === 0}>
                        <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel Harian
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </div>
      
      {todayLessons.length === 0 ? (
         <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
            <CardHeader><CardTitle>Jadwal Hari Ini</CardTitle></CardHeader>
            <CardContent className="pt-6 text-center text-muted-foreground">
                <Info className="mx-auto h-12 w-12 mb-4 text-primary" />
                Tidak ada jadwal pelajaran untuk {isParentView ? `anak Anda (${studentToView.name || '...'})` : 'Anda'} hari ini.
            </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {todayLessons.map(lesson => {
            const status = getLessonStatus(lesson, attendanceRecords);
            return (
              <Card key={lesson.id} className="bg-card/80 backdrop-blur-sm border shadow-md">
                <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex-grow flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h3 className="text-lg font-semibold text-primary whitespace-nowrap">{lesson.subjectName || "Pelajaran Tanpa Nama"}</h3>
                        <p className="text-sm text-muted-foreground whitespace-nowrap">
                            Waktu: {lesson.startTime} - {lesson.endTime}
                        </p>
                        <div className="flex items-center gap-1 text-sm font-medium whitespace-nowrap">
                            {status.icon}
                            <span>{status.text}</span>
                        </div>
                    </div>
                    <Button variant="outline" size="icon" asChild className="shrink-0">
                        <Link href={`/lessons/${lesson.id}`} aria-label={`Detail pelajaran ${lesson.subjectName}`}>
                            <ExternalLink className="h-4 w-4" />
                        </Link>
                    </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
       <Card className="mt-6 bg-card/70 backdrop-blur-sm border-border shadow-sm">
            <CardHeader><CardTitle className="text-lg">Catatan Penting</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
                <p>&bull; Untuk melakukan absen, silakan masuk ke detail pelajaran melalui tombol <ExternalLink className="inline h-3.5 w-3.5 align-text-bottom" /> di samping masing-masing pelajaran.</p>
                <p>&bull; Pastikan Anda melakukan absen selama jam pelajaran berlangsung.</p>
                <p>&bull; Jika ada kendala teknis atau alasan lain tidak bisa absen, segera hubungi guru mata pelajaran atau wali kelas Anda.</p>
            </CardContent>
        </Card>
    </div>
  );
}


export default function AttendancePageWrapper() {
  const { user, loading: authLoading, role } = useAuth();

  if (authLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Kehadiran</h1>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md"><CardContent className="pt-6"><div className="flex items-center justify-center p-8"><LottieLoader width={32} height={32} className="mr-2" />Memuat...</div></CardContent></Card>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Kehadiran</h1>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md"><CardContent className="pt-6"><div className="flex items-center justify-center p-8 text-muted-foreground"><AlertCircle className="w-8 h-8 mr-2 text-destructive" />Login untuk akses.</div></CardContent></Card>
      </div>
    );
  }

  if (role === 'admin' || role === 'guru') {
    return <TeacherAdminAttendanceManagement />;
  } else if (role === 'siswa') {
    return <StudentAttendanceView />;
  } else if (role === 'orangtua') {
    if (!user.linkedStudentId || !user.linkedStudentName || !user.linkedStudentClassId) {
      return (
         <div className="space-y-6">
            <h1 className="text-3xl font-bold font-headline">Kehadiran Anak</h1>
             <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md"><CardContent className="pt-6"><div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground"><AlertCircle className="w-12 h-12 mb-4 text-warning" /><p className="font-semibold">Siswa Belum Tertaut</p><p>Akun Anda belum terhubung dengan data siswa. Silakan hubungi administrator sekolah.</p></div></CardContent></Card>
        </div>
      );
    }
    return <StudentAttendanceView targetStudentId={user.linkedStudentId} targetStudentName={user.linkedStudentName} targetStudentClassId={user.linkedStudentClassId} />;
  } else {
    return (
         <div className="space-y-6">
            <h1 className="text-3xl font-bold font-headline">Kehadiran</h1>
             <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md"><CardContent className="pt-6"><div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground"><AlertCircle className="w-12 h-12 mb-4 text-destructive" /><p className="font-semibold">Akses Ditolak.</p></div></CardContent></Card>
        </div>
    );
  }
}

    
