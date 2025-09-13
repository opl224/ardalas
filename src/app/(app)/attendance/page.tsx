
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
import { CalendarCheck, CalendarIcon, AlertCircle, Save, FileDown, FileSpreadsheet, Clock, CheckCircle, XCircle, Info, RefreshCw, BookOpen, ExternalLink, Eye, MoreHorizontal, Filter, Edit } from "lucide-react";
import LottieLoader from "@/components/ui/LottieLoader";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm, useFieldArray, type SubmitHandler, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, startOfDay, getMonth, getYear, setMonth, setYear, lastDayOfMonth, parse, isValid, getDay, isWithinInterval, isFuture } from "date-fns";
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
  limit,
  getDoc
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSidebar } from "@/components/ui/sidebar";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";


// --- Types for Teacher/Admin View ---
const ATTENDANCE_STATUSES = ["Hadir", "Sakit", "Izin", "Alpa"] as const;
type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

interface ClassMin { id: string; name: string; }
interface StudentMin { id: string; name: string; } 

interface TeacherStudentAttendanceRecord { 
  studentId: string;
  studentName: string; 
  status: AttendanceStatus;
  notes?: string;
}

const teacherAttendanceFormSchema = z.object({ 
  classId: z.string({ required_error: "Pilih kelas." }),
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
interface StudentAttendanceHistoryEntry {
  id: string;
  date: Timestamp;
  status: AttendanceStatus;
  notes?: string;
  className?: string;
  recordedByName?: string;
}

interface StudentAttendanceViewProps {
  targetStudentId?: string;
  targetStudentName?: string;
}


function TeacherAdminAttendanceManagement() {
  const { user, role, loading: authLoading } = useAuth(); 
  const { isMobile } = useSidebar();
  const [classesForDropdown, setClassesForDropdown] = useState<ClassMin[]>([]);
  const [isLoadingDropdowns, setIsLoadingDropdowns] = useState(true);
  const [isLoadingFormData, setIsLoadingFormData] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | undefined>();
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [existingAttendanceDocId, setExistingAttendanceDocId] = useState<string | null>(null);

  const [selectedExportMonth, setSelectedExportMonth] = useState<number>(getMonth(new Date()));
  const [selectedExportYear, setSelectedExportYear] = useState<number>(getYear(new Date()));
  const [isExporting, setIsExporting] = useState(false);

  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [currentNoteIndex, setCurrentNoteIndex] = useState<number | null>(null);

  const { toast } = useToast();

  const form = useForm<TeacherAttendanceFormValues>({
    resolver: zodResolver(teacherAttendanceFormSchema),
    defaultValues: {
      classId: undefined,
      date: selectedDate,
      studentAttendances: [],
    },
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "studentAttendances",
  });

  const isSelectedDateInFuture = isFuture(selectedDate);

  useEffect(() => {
    if (authLoading || !user || !role) return; 

    const fetchInitialDropdownData = async () => {
      setIsLoadingDropdowns(true);
      try {
        let classesQuery;
        if (role === 'admin') {
          classesQuery = query(collection(db, "classes"), orderBy("name", "asc"));
        } else if (role === 'guru' && user.uid) {
            const teacherProfileQuery = query(collection(db, "teachers"), where("uid", "==", user.uid), limit(1));
            const teacherProfileSnapshot = await getDocs(teacherProfileQuery);
            if (teacherProfileSnapshot.empty) {
                toast({ title: "Profil Guru Tidak Ditemukan", variant: "warning" });
                setClassesForDropdown([]);
                setIsLoadingDropdowns(false);
                return;
            }
            const teacherProfileId = teacherProfileSnapshot.docs[0].id;
            
            const lessonsQuery = query(collection(db, "lessons"), where("teacherId", "==", teacherProfileId));
            const lessonsSnapshot = await getDocs(lessonsQuery);
            const taughtClassIds = Array.from(new Set(lessonsSnapshot.docs.map(d => d.data().classId).filter(id => !!id)));
            
            if (taughtClassIds.length > 0) {
              const classIdChunks = [];
              for (let i = 0; i < taughtClassIds.length; i += 30) {
                classIdChunks.push(taughtClassIds.slice(i, i + 30));
              }
              const classSnapshots = await Promise.all(
                classIdChunks.map(chunk => getDocs(query(collection(db, "classes"), where(documentId(), "in", chunk))))
              );
              const fetchedClasses = classSnapshots.flatMap(snap => snap.docs.map(d => ({ id: d.id, name: d.data().name })));
              fetchedClasses.sort((a, b) => a.name.localeCompare(b.name));
              setClassesForDropdown(fetchedClasses);
            } else {
                setClassesForDropdown([]);
            }
        } else {
            setClassesForDropdown([]);
        }
        
        if(classesQuery) {
            const classesSnapshot = await getDocs(classesQuery);
            setClassesForDropdown(classesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
        }
      } catch (error) {
        console.error("Error fetching initial dropdown data:", error);
        toast({ title: "Gagal Memuat Data Awal", variant: "destructive" });
      } finally {
        setIsLoadingDropdowns(false);
      }
    };
    fetchInitialDropdownData();
  }, [authLoading, user, role, toast]);


  useEffect(() => {
    if (authLoading || (!role || !["admin", "guru"].includes(role))) return;

    const fetchAttendanceData = async () => {
      if (!selectedClassId || !selectedDate) {
        replace([]);
        return;
      }
      setIsLoadingFormData(true);
      setExistingAttendanceDocId(null);
      
      const dateToQuery = Timestamp.fromDate(startOfDay(selectedDate));
      
      try {
        const studentsQuery = query(collection(db, "users"), where("role", "==", "siswa"), where("classId", "==", selectedClassId), orderBy("name", "asc"));
        const studentsSnapshot = await getDocs(studentsQuery);
        const fetchedStudents: StudentMin[] = studentsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));

        if (fetchedStudents.length === 0) {
            replace([]);
            setIsLoadingFormData(false);
            return;
        }

        const attendanceQuery = query(
          collection(db, "attendances"),
          where("classId", "==", selectedClassId),
          where("date", "==", dateToQuery),
          limit(1)
        );
        const attendanceSnapshot = await getDocs(attendanceQuery);
        
        if (!attendanceSnapshot.empty) {
          const attendanceDoc = attendanceSnapshot.docs[0];
          setExistingAttendanceDocId(attendanceDoc.id);
          const data = attendanceDoc.data();
          const existingRecordsMap = new Map<string, TeacherStudentAttendanceRecord>(
            data.studentAttendances.map((rec: TeacherStudentAttendanceRecord) => [rec.studentId, rec])
          );

          const mergedStudentAttendances = fetchedStudents.map(student => {
            const existingRecord = existingRecordsMap.get(student.id);
            return existingRecord || { 
              studentId: student.id, 
              studentName: student.name, 
              status: "Hadir" as AttendanceStatus, 
              notes: ""
            };
          });
          replace(mergedStudentAttendances);
        } else { 
          const initialAttendanceData = fetchedStudents.map(student => ({
            studentId: student.id,
            studentName: student.name,
            status: "Hadir" as AttendanceStatus, 
            notes: "",
          }));
          replace(initialAttendanceData);
        }
      } catch (error) {
        console.error("Error fetching attendance: ", error);
        toast({ title: "Gagal Memuat Data Kehadiran", variant: "destructive" });
        replace([]);
      } finally {
        setIsLoadingFormData(false);
      }
    };
    
    fetchAttendanceData();
  }, [selectedClassId, selectedDate, replace, toast, authLoading, role]);


  const handleSaveAttendance: SubmitHandler<TeacherAttendanceFormValues> = async (data) => {
    setIsSubmitting(true);
    const attendanceDate = Timestamp.fromDate(startOfDay(data.date));
    const selectedClass = classesForDropdown.find(c => c.id === data.classId); 

    if (!user || !selectedClass) { 
        toast({ title: "Data tidak lengkap", description: "Pengguna atau kelas tidak ditemukan.", variant: "destructive"});
        setIsSubmitting(false);
        return;
    }

    const attendanceDocumentData = {
      classId: data.classId,
      className: selectedClass.name,
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
        const dateString = format(data.date, "yyyy-MM-dd");
        docIdToSave = `${dateString}_${data.classId}`;
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
    replace([]); 
  };
  
  const handleDateChange = (date?: Date) => {
    if (date) {
      const newDate = startOfDay(date);
      setSelectedDate(newDate);
      form.setValue("date", newDate);
      replace([]);
    }
  };

  const handleExportDailyExcel = async () => {
    if (!selectedClassId || !selectedDate) {
      toast({ title: "Data Tidak Lengkap", description: "Pilih kelas dan tanggal terlebih dahulu.", variant: "destructive" });
      return;
    }
    const studentAttendances = form.getValues('studentAttendances');
    if (!studentAttendances || studentAttendances.length === 0) {
      toast({ title: "Data Tidak Lengkap", description: "Pastikan ada data kehadiran untuk diekspor.", variant: "destructive" });
      return;
    }

    setIsExporting(true);
    try {
      const selectedClassObj = classesForDropdown.find(c => c.id === selectedClassId);
      const className = selectedClassObj?.name || "Kelas Tidak Diketahui";
      const formattedDate = format(selectedDate, "yyyy-MM-dd", { locale: indonesiaLocale });
      const fileName = `Kehadiran_${className.replace(/\s+/g, '_')}_${formattedDate}.xlsx`;

      const dataToExport = studentAttendances.map(record => ({
        "Nama Siswa": record.studentName,
        "Status": record.status,
        "Catatan": record.notes || "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Kehadiran ${formattedDate}`);
      
      XLSX.utils.sheet_add_aoa(worksheet, [
        [`Laporan Kehadiran Harian - Kelas: ${className} - Tanggal: ${format(selectedDate, "dd MMMM yyyy", { locale: indonesiaLocale })}`],
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
    if (!selectedClassId || !selectedDate) {
      toast({ title: "Data Tidak Lengkap", description: "Pilih kelas dan tanggal terlebih dahulu.", variant: "destructive" });
      return;
    }
    const studentAttendances = form.getValues('studentAttendances');
    if (!studentAttendances || studentAttendances.length === 0) {
      toast({ title: "Data Tidak Lengkap", description: "Pastikan ada data kehadiran untuk diekspor.", variant: "destructive" });
      return;
    }

    setIsExporting(true);
    try {
      const selectedClassObj = classesForDropdown.find(c => c.id === selectedClassId);
      const className = selectedClassObj?.name || "Kelas Tidak Diketahui";
      const formattedDate = format(selectedDate, "dd MMMM yyyy", { locale: indonesiaLocale });
      const fileName = `Kehadiran_${className.replace(/\s+/g, '_')}_${format(selectedDate, "yyyy-MM-dd")}.pdf`;

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`Laporan Kehadiran Harian`, 14, 15);
      doc.setFontSize(12);
      doc.text(`Kelas: ${className}`, 14, 22);
      doc.text(`Tanggal: ${formattedDate}`, 14, 29);


      const tableColumn = ["No", "Nama Siswa", "Status", "Catatan"];
      const tableRows: (string | number)[][] = [];

      studentAttendances.forEach((record, index) => {
        const attendanceData = [
          index + 1,
          record.studentName,
          record.status,
          record.notes || "-",
        ];
        tableRows.push(attendanceData);
      });

      autoTable(doc, {
        startY: 36,
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
  
  const generateMonthlyAttendanceSummary = async (classId: string, year: number, month: number): Promise<MonthlyAttendanceSummary[]> => {
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
        where("date", ">=", Timestamp.fromDate(startDate)),
        where("date", "<=", Timestamp.fromDate(endDate))
    );
    const attendanceSnapshot = await getDocs(attendanceQuery);
    
    attendanceSnapshot.docs.forEach(docSnap => {
        const attendanceDayData = docSnap.data() as Omit<TeacherAttendanceFormValues, 'date'> & { date: Timestamp, studentAttendances: TeacherStudentAttendanceRecord[] };
        
        attendanceDayData.studentAttendances.forEach(record => {
            if (studentSummaries[record.studentId]) {
                studentSummaries[record.studentId].totalDays++;
                switch (record.status) {
                    case "Hadir": studentSummaries[record.studentId].hadir++; break;
                    case "Sakit": studentSummaries[record.studentId].sakit++; break;
                    case "Izin": studentSummaries[record.studentId].izin++; break;
                    case "Alpa": studentSummaries[record.studentId].alpa++; break;
                }
            }
        });
    });

    return Object.values(studentSummaries);
  };

  const handleExportMonthlyExcel = async () => {
     if (!selectedClassId || selectedExportMonth === null || !selectedExportYear) {
      toast({ title: "Data Tidak Lengkap", description: "Pilih kelas, bulan, dan tahun untuk ekspor bulanan.", variant: "destructive" });
      return;
    }
    setIsExporting(true);
    try {
      const summaryData = await generateMonthlyAttendanceSummary(selectedClassId, selectedExportYear, selectedExportMonth);
      if (summaryData.length === 0) {
        toast({ title: "Tidak Ada Data", description: "Tidak ada data kehadiran untuk bulan dan kelas yang dipilih.", variant: "info" });
        setIsExporting(false);
        return;
      }

      const selectedClassObj = classesForDropdown.find(c => c.id === selectedClassId);
      const className = selectedClassObj?.name || "Kelas Tidak Diketahui";
      const monthName = months.find(m => m.value === selectedExportMonth)?.label || "Bulan";
      const fileName = `Rekap_Kehadiran_${className.replace(/\s+/g, '_')}_${monthName}_${selectedExportYear}.xlsx`;

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
        [`Laporan Kehadiran Bulanan - Kelas: ${className}`],
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
    if (!selectedClassId || selectedExportMonth === null || !selectedExportYear) {
      toast({ title: "Data Tidak Lengkap", description: "Pilih kelas, bulan, dan tahun untuk ekspor bulanan.", variant: "destructive" });
      return;
    }
    setIsExporting(true);
    try {
      const summaryData = await generateMonthlyAttendanceSummary(selectedClassId, selectedExportYear, selectedExportMonth);
       if (summaryData.length === 0) {
        toast({ title: "Tidak Ada Data", description: "Tidak ada data kehadiran untuk bulan dan kelas yang dipilih.", variant: "info" });
        setIsExporting(false);
        return;
      }

      const selectedClassObj = classesForDropdown.find(c => c.id === selectedClassId);
      const className = selectedClassObj?.name || "Kelas Tidak Diketahui";
      const monthName = months.find(m => m.value === selectedExportMonth)?.label || "Bulan";
      const fileName = `Rekap_Kehadiran_${className.replace(/\s+/g, '_')}_${monthName}_${selectedExportYear}.pdf`;

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`Laporan Kehadiran Bulanan`, 14, 15);
      doc.setFontSize(12);
      doc.text(`Kelas: ${className}`, 14, 22);
      doc.text(`Bulan: ${monthName} ${selectedExportYear}`, 14, 29);

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
        startY: 36,
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

  const handleOpenNoteDialog = (index: number) => {
    setCurrentNoteIndex(index);
    setIsNoteDialogOpen(true);
  };


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Kehadiran</h1>
        <p className="text-muted-foreground">Catat dan pantau kehadiran harian siswa per kelas.</p>
      </div>
      <form onSubmit={form.handleSubmit(handleSaveAttendance)}>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-6 w-6 text-primary" />
              <span>Catat Kehadiran Harian</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <Label htmlFor="classId-teacher">Kelas</Label>
                <Select
                  value={selectedClassId}
                  onValueChange={handleClassChange}
                  disabled={isLoadingDropdowns || isSubmitting}
                >
                  <SelectTrigger id="classId-teacher" className="mt-1">
                    <SelectValue placeholder={isLoadingDropdowns ? "Memuat kelas..." : "Pilih kelas"} />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingDropdowns && <SelectItem value="loading" disabled>Memuat...</SelectItem>}
                    {classesForDropdown.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    {classesForDropdown.length === 0 && !isLoadingDropdowns && <SelectItem value="no-classes" disabled>Tidak ada kelas tersedia.</SelectItem>}
                  </SelectContent>
                </Select>
                {form.formState.errors.classId && <p className="text-sm text-destructive mt-1">{form.formState.errors.classId.message}</p>}
              </div>
              <div>
                <Label htmlFor="date-teacher">Tanggal</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className="w-full justify-start text-left font-normal mt-1"
                      disabled={isLoadingFormData || isSubmitting || !selectedClassId}
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
                      disabled={isLoadingFormData || isSubmitting}
                    />
                  </PopoverContent>
                </Popover>
                 {form.formState.errors.date && <p className="text-sm text-destructive mt-1">{form.formState.errors.date.message}</p>}
              </div>
            </div>

            {selectedClassId && selectedDate && (
              isLoadingFormData ? (
                <div className="space-y-2 mt-4">
                  <Skeleton className="h-8 w-full" /> <Skeleton className="h-8 w-full" /> <Skeleton className="h-8 w-full" />
                </div>
              ) : isSelectedDateInFuture ? (
                 <div className="mt-4 p-4 border border-dashed border-border rounded-md text-center text-muted-foreground flex flex-col items-center gap-2">
                    <AlertCircle className="w-8 h-8 text-primary" />
                    <span>Anda tidak dapat mencatat atau melihat kehadiran untuk tanggal di masa depan.</span>
                 </div>
              ) : fields.length === 0 ? (
                 <div className="mt-4 p-4 border border-dashed border-border rounded-md text-center text-muted-foreground">
                    Tidak ada siswa di kelas ini atau data siswa belum termuat.
                 </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <h3 className="text-lg font-medium">Daftar Siswa ({fields.length} siswa)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="border-b">
                            <tr>
                                <th className="p-2 text-left min-w-[150px]">Nama Siswa</th>
                                <th className={cn("p-2 text-left", isMobile ? "w-32" : "w-36 min-w-[144px]")}>Status</th>
                                <th className={cn("p-2 text-left", isMobile ? "w-16 text-center" : "min-w-[200px]")}>
                                  {isMobile ? "" : "Catatan"}
                                </th>
                            </tr>
                        </thead>
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
                            <td className={cn("p-2", isMobile && "text-center")}>
                                {isMobile ? (
                                     <Button type="button" variant="ghost" size="icon" onClick={() => handleOpenNoteDialog(index)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                ) : (
                                    <Input {...form.register(`studentAttendances.${index}.notes`)} placeholder="Catatan..." className="mt-0 w-full" disabled={isSubmitting}/>
                                )}
                            </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                  </div>
                  {form.formState.errors.studentAttendances && !form.formState.errors.studentAttendances.message && (<p className="text-sm font-medium text-destructive mt-1">Periksa kembali input kehadiran siswa.</p>)}
                   {form.formState.errors.studentAttendances?.message && (<p className="text-sm font-medium text-destructive mt-1">{form.formState.errors.studentAttendances?.message}</p>)}
                </div>
              )
            )}
            {fields.length > 0 && selectedClassId && selectedDate && !isLoadingFormData && !isSelectedDateInFuture && (
              <div className="flex justify-end mt-6">
                <Button type="submit" disabled={isSubmitting || isLoadingFormData}>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <div>
              <Label htmlFor="exportClassId">Kelas</Label>
              <Select value={selectedClassId} onValueChange={(value) => setSelectedClassId(value)} disabled={isLoadingDropdowns || isExporting}>
                <SelectTrigger id="exportClassId" className="mt-1"><SelectValue placeholder={isLoadingDropdowns ? "Memuat..." : "Pilih kelas"} /></SelectTrigger>
                <SelectContent>{classesForDropdown.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
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
        <CardFooter className="flex flex-col sm:flex-row sm:justify-end gap-2">
          <DropdownMenu><DropdownMenuTrigger asChild><Button disabled={isExporting || isLoadingFormData} className="w-full sm:w-auto">{isExporting && <LottieLoader width={16} height={16} className="mr-2" />}<FileDown className="mr-2 h-4 w-4" /> Ekspor</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportDailyExcel} disabled={isExporting || !selectedClassId || !selectedDate || fields.length === 0}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel Harian</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportDailyPdf} disabled={isExporting || !selectedClassId || !selectedDate || fields.length === 0}><FileDown className="mr-2 h-4 w-4" /> PDF Harian</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportMonthlyExcel} disabled={isExporting || !selectedClassId || selectedExportMonth === null || !selectedExportYear}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel Bulanan</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportMonthlyPdf} disabled={isExporting || !selectedClassId || selectedExportMonth === null || !selectedExportYear}><FileDown className="mr-2 h-4 w-4" /> PDF Bulanan</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardFooter>
      </Card>
      
      {currentNoteIndex !== null && (
        <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Catatan Kehadiran</DialogTitle>
                    <DialogDescription>
                        Tambahkan catatan untuk siswa: {fields[currentNoteIndex]?.studentName || 'Siswa'}
                    </DialogDescription>
                </DialogHeader>
                <Textarea
                  {...form.register(`studentAttendances.${currentNoteIndex}.notes`)}
                  placeholder="Masukkan catatan di sini..."
                  className="min-h-[100px]"
                />
                <DialogFooter>
                    <Button onClick={() => setIsNoteDialogOpen(false)}>Simpan & Tutup</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}

    </div>
  );
}


function StudentAttendanceView({ targetStudentId, targetStudentName }: StudentAttendanceViewProps) {
  const { toast } = useToast();
  const [attendanceHistory, setAttendanceHistory] = useState<StudentAttendanceHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStudentHistory = useCallback(async () => {
    if (!targetStudentId) {
      setIsLoading(false);
      setAttendanceHistory([]);
      return;
    }
    setIsLoading(true);

    try {
      const attendanceQuery = query(
        collection(db, "attendances"),
        // This is inefficient. We need to query where studentId is in the array.
        // Firestore doesn't support this well. We may need to denormalize.
        // For now, let's fetch all for the class and filter client-side.
        // THIS IS A SIMPLIFICATION and NOT SCALABLE.
        // A better approach would require a `studentAttendances` subcollection or different data model.
        orderBy("date", "desc")
      );
      
      const snapshot = await getDocs(attendanceQuery);
      let history: StudentAttendanceHistoryEntry[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const studentRecord = data.studentAttendances?.find((rec: any) => rec.studentId === targetStudentId);
        if (studentRecord) {
          history.push({
            id: docSnap.id + '-' + targetStudentId,
            date: data.date,
            status: studentRecord.status,
            notes: studentRecord.notes,
            className: data.className,
            recordedByName: data.recordedByName,
          });
        }
      });
      
      setAttendanceHistory(history);
    } catch (error) {
      console.error("Error fetching student attendance history:", error);
      toast({ title: "Gagal Memuat Riwayat Absensi", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [targetStudentId, toast]);

  useEffect(() => {
    fetchStudentHistory();
  }, [fetchStudentHistory]);
  

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-3/4" />
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader>
          <CardContent className="pt-6"> <Skeleton className="h-40 w-full" /> </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
         <div>
            <h1 className="text-3xl font-bold font-headline">Rekap Kehadiran {targetStudentName ? `Anak (${targetStudentName})` : 'Saya'}</h1>
            <p className="text-muted-foreground">Riwayat kehadiran harian yang telah dicatat oleh guru.</p>
        </div>
         <Button onClick={fetchStudentHistory} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh Data
        </Button>
      </div>
      
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
         <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-6 w-6 text-primary" />
              <span>Riwayat Kehadiran Harian</span>
            </CardTitle>
        </CardHeader>
        <CardContent>
          {attendanceHistory.length === 0 ? (
            <div className="pt-6 text-center text-muted-foreground flex flex-col items-center gap-4">
                <Info className="mx-auto h-12 w-12 text-primary" />
                 <p>Belum ada riwayat kehadiran yang tercatat.</p>
            </div>
          ) : (
              <div className="overflow-x-auto mt-4">
                <Table className="w-full">
                  <TableHeader>
                    <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Catatan</TableHead>
                        <TableHead>Dicatat Oleh</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendanceHistory.map(record => (
                      <TableRow key={record.id}>
                         <TableCell>{format(record.date.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale })}</TableCell>
                         <TableCell>
                            <span className={cn(
                                "flex items-center gap-1.5 font-medium",
                                record.status === 'Hadir' && 'text-green-600',
                                record.status === 'Sakit' && 'text-yellow-600',
                                record.status === 'Izin' && 'text-blue-600',
                                record.status === 'Alpa' && 'text-red-600',
                            )}>
                                {record.status === 'Hadir' && <CheckCircle className="h-4 w-4" />}
                                {record.status !== 'Hadir' && <AlertCircle className="h-4 w-4" />}
                                {record.status}
                            </span>
                         </TableCell>
                         <TableCell className="text-xs max-w-xs truncate" title={record.notes || undefined}>{record.notes || '-'}</TableCell>
                         <TableCell className="text-xs text-muted-foreground">{record.recordedByName || 'Sistem'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
          )}
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
    return <StudentAttendanceView targetStudentId={user.uid} targetStudentName={user.displayName || "Saya"} />;
  } else if (role === 'orangtua') {
    if (!user.linkedStudentId || !user.linkedStudentName) {
      return (
         <div className="space-y-6">
            <h1 className="text-3xl font-bold font-headline">Kehadiran Anak</h1>
             <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md"><CardContent className="pt-6"><div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground"><AlertCircle className="w-12 h-12 mb-4 text-warning" /><p className="font-semibold">Siswa Belum Tertaut</p><p>Akun anda belum terhubung dengan data siswa. Silakan hubungi administrator sekolah.</p></div></CardContent></Card>
        </div>
      );
    }
    return <StudentAttendanceView targetStudentId={user.linkedStudentId} targetStudentName={user.linkedStudentName} />;
  } else {
    return (
         <div className="space-y-6">
            <h1 className="text-3xl font-bold font-headline">Kehadiran</h1>
             <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md"><CardContent className="pt-6"><div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground"><AlertCircle className="w-12 h-12 mb-4 text-destructive" /><p className="font-semibold">Akses Ditolak.</p></div></CardContent></Card>
        </div>
    );
  }
}
