
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
import { CalendarCheck, CalendarIcon, AlertCircle, Loader2, Save, FileDown, FileSpreadsheet, Clock, CheckCircle, XCircle, Info, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm, useFieldArray, type SubmitHandler, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, startOfDay, getMonth, getYear, setMonth, setYear, lastDayOfMonth, parse, isValid } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase/config";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc, // Added for student attendance
  query,
  where,
  Timestamp,
  serverTimestamp,
  orderBy
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// --- Types for Teacher/Admin View ---
const ATTENDANCE_STATUSES = ["Hadir", "Sakit", "Izin", "Alpa"] as const;
type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

interface ClassMin { id: string; name: string; }
interface StudentMin { id: string; name: string; } // For teacher form student list

interface TeacherStudentAttendanceRecord { // Renamed to avoid conflict
  studentId: string;
  studentName: string; 
  status: AttendanceStatus;
  notes?: string;
}

const teacherAttendanceFormSchema = z.object({ // Renamed schema
  classId: z.string({ required_error: "Pilih kelas." }),
  date: z.date({ required_error: "Tanggal harus diisi." }),
  studentAttendances: z.array(z.object({
    studentId: z.string(),
    studentName: z.string(),
    status: z.enum(ATTENDANCE_STATUSES, { required_error: "Status harus dipilih." }),
    notes: z.string().optional(),
  })).min(1, "Minimal ada satu siswa untuk mencatat kehadiran."),
});
type TeacherAttendanceFormValues = z.infer<typeof teacherAttendanceFormSchema>; // Renamed type

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

// --- Types for Student View ---
interface StudentLessonDisplay {
  id: string; // Lesson document ID
  subjectName?: string;
  dayOfWeek: string;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
}

interface StudentSelfAttendanceRecord {
  id?: string; // Firestore doc ID
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  lessonId: string;
  subjectName?: string;
  lessonTime: string; // e.g., "08:00 - 09:30"
  date: Timestamp; // Date of attendance (start of day)
  status: "Hadir"; // Student can only mark themselves as "Hadir"
  attendedAt: Timestamp; // Actual time of attendance
}


function TeacherAdminAttendanceManagement() {
  const { user, role, loading: authLoading } = useAuth(); 
  const [classes, setClasses] = useState<ClassMin[]>([]);
  const [studentsInClassForForm, setStudentsInClassForForm] = useState<StudentMin[]>([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isLoadingExistingAttendance, setIsLoadingExistingAttendance] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | undefined>();
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
      date: selectedDate,
      studentAttendances: [],
    },
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "studentAttendances",
  });

  useEffect(() => {
    if (authLoading) return; 
    if (!role || !["admin", "guru"].includes(role)) return; 

    const fetchClassesForTeacher = async () => {
      setIsLoadingClasses(true);
      try {
        const classesSnapshot = await getDocs(query(collection(db, "classes"), orderBy("name", "asc")));
        setClasses(classesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
      } catch (error) {
        console.error("Error fetching classes: ", error);
        toast({ title: "Gagal Memuat Kelas", variant: "destructive" });
      } finally {
        setIsLoadingClasses(false);
      }
    };
    fetchClassesForTeacher();
  }, [toast, authLoading, role]);

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
        const studentsQuery = query(collection(db, "students"), where("classId", "==", selectedClassId), orderBy("name", "asc"));
        const studentsSnapshot = await getDocs(studentsQuery);

        const fetchedStudents: StudentMin[] = studentsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
        setStudentsInClassForForm(fetchedStudents);
        
        const initialAttendance = fetchedStudents.map(student => ({
          studentId: student.id,
          studentName: student.name,
          status: "Hadir" as AttendanceStatus,
          notes: "",
        }));
        replace(initialAttendance); 

      } catch (error) {
        console.error("Error fetching students: ", error);
        toast({ title: "Gagal Memuat Siswa", description: "Pastikan siswa memiliki field 'classId' yang benar.", variant: "destructive" });
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
    if (!selectedClassId || !selectedDate) {
      setExistingAttendanceDocId(null);
      if (studentsInClassForForm.length > 0) {
         const resetAttendance = studentsInClassForForm.map(student => ({
          studentId: student.id,
          studentName: student.name,
          status: "Hadir" as AttendanceStatus,
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

      try {
        const attendanceQuery = query(
          collection(db, "attendances"),
          where("classId", "==", selectedClassId),
          where("date", "==", dateToQuery)
        );
        const attendanceSnapshot = await getDocs(attendanceQuery);

        if (!attendanceSnapshot.empty) {
          const attendanceDoc = attendanceSnapshot.docs[0];
          setExistingAttendanceDocId(attendanceDoc.id);
          const data = attendanceDoc.data() as Omit<TeacherAttendanceFormValues, 'date'> & { date: Timestamp, studentAttendances: TeacherStudentAttendanceRecord[] };
          
          const currentClassStudents = studentsInClassForForm.length > 0 ? studentsInClassForForm : (await getDocs(query(collection(db, "students"), where("classId", "==", selectedClassId), orderBy("name", "asc")))).docs.map(d => ({id: d.id, name: d.data().name}));

          const mergedStudentAttendances = currentClassStudents.map(student => {
            const existingRecord = data.studentAttendances.find(sa => sa.studentId === student.id);
            return existingRecord || {
              studentId: student.id,
              studentName: student.name,
              status: "Hadir" as AttendanceStatus,
              notes: "",
            };
          });
          form.setValue("studentAttendances", mergedStudentAttendances);

        } else {
          if (studentsInClassForForm.length > 0) {
            const initialAttendance = studentsInClassForForm.map(student => ({
              studentId: student.id,
              studentName: student.name,
              status: "Hadir" as AttendanceStatus,
              notes: "",
            }));
            form.setValue("studentAttendances", initialAttendance);
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

  }, [selectedClassId, selectedDate, toast, form, studentsInClassForForm, isLoadingStudents, authLoading, role]);

  const handleSaveAttendance: SubmitHandler<TeacherAttendanceFormValues> = async (data) => {
    setIsSubmitting(true);
    const attendanceDate = Timestamp.fromDate(startOfDay(data.date));
    const selectedClass = classes.find(c => c.id === data.classId);

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
    if (!selectedClassId || !selectedDate || fields.length === 0) {
      toast({ title: "Data Tidak Lengkap", description: "Pilih kelas, tanggal, dan pastikan ada data kehadiran untuk diekspor.", variant: "destructive" });
      return;
    }
    setIsExporting(true);
    try {
      const selectedClassObj = classes.find(c => c.id === selectedClassId);
      const className = selectedClassObj?.name || "Kelas Tidak Diketahui";
      const formattedDate = format(selectedDate, "yyyy-MM-dd", { locale: indonesiaLocale });
      const fileName = `Kehadiran_${className.replace(/\s+/g, '_')}_${formattedDate}.xlsx`;

      const dataToExport = fields.map(record => ({
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
    if (!selectedClassId || !selectedDate || fields.length === 0) {
      toast({ title: "Data Tidak Lengkap", description: "Pilih kelas, tanggal, dan pastikan ada data kehadiran untuk diekspor.", variant: "destructive" });
      return;
    }
    setIsExporting(true);
    try {
      const selectedClassObj = classes.find(c => c.id === selectedClassId);
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
        startY: 35,
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

    const studentsSnapshot = await getDocs(query(collection(db, "students"), where("classId", "==", classId), orderBy("name")));
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

      const selectedClassObj = classes.find(c => c.id === selectedClassId);
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

      const selectedClassObj = classes.find(c => c.id === selectedClassId);
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
        startY: 35,
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
        <p className="text-muted-foreground">Catat dan pantau kehadiran siswa.</p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
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
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    {classes.length === 0 && !isLoadingClasses && <SelectItem value="no-classes" disabled>Tidak ada kelas tersedia.</SelectItem>}
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
                      disabled={isLoadingExistingAttendance || isSubmitting}
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

            {selectedClassId && selectedDate && (
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
              ) : null
            )}
            {fields.length > 0 && selectedClassId && selectedDate && !isLoadingStudents && !isLoadingExistingAttendance && (
              <div className="flex justify-end mt-6">
                <Button type="submit" disabled={isSubmitting || isLoadingExistingAttendance || isLoadingStudents}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <Label htmlFor="exportClassId">Kelas (untuk Rekap)</Label>
              <Select value={selectedClassId} onValueChange={(value) => setSelectedClassId(value)} disabled={isLoadingClasses || isExporting}>
                <SelectTrigger id="exportClassId" className="mt-1"><SelectValue placeholder={isLoadingClasses ? "Memuat..." : "Pilih kelas"} /></SelectTrigger>
                <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="exportMonth">Bulan (untuk Rekap Bulanan)</Label>
              <Select value={selectedExportMonth.toString()} onValueChange={(value) => setSelectedExportMonth(parseInt(value))} disabled={isExporting}>
                <SelectTrigger id="exportMonth" className="mt-1"><SelectValue placeholder="Pilih bulan" /></SelectTrigger>
                <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="exportYear">Tahun (untuk Rekap Bulanan)</Label>
              <Input id="exportYear" type="number" value={selectedExportYear} onChange={(e) => setSelectedExportYear(parseInt(e.target.value))} className="mt-1" placeholder="Contoh: 2024" disabled={isExporting}/>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <DropdownMenu><DropdownMenuTrigger asChild><Button disabled={isExporting}>{isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<FileDown className="mr-2 h-4 w-4" /> Ekspor</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportDailyExcel} disabled={isExporting || !selectedClassId || !selectedDate || fields.length === 0}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel Harian</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportDailyPdf} disabled={isExporting || !selectedClassId || !selectedDate || fields.length === 0}><FileDown className="mr-2 h-4 w-4" /> PDF Harian</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportMonthlyExcel} disabled={isExporting || !selectedClassId || selectedExportMonth === null || !selectedExportYear}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel Bulanan</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportMonthlyPdf} disabled={isExporting || !selectedClassId || selectedExportMonth === null || !selectedExportYear}><FileDown className="mr-2 h-4 w-4" /> PDF Bulanan</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardFooter>
      </Card>
    </div>
  );
}


function StudentAttendanceView() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [todayLessons, setTodayLessons] = useState<StudentLessonDisplay[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Map<string, StudentSelfAttendanceRecord>>(new Map());
  const [isLoadingView, setIsLoadingView] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000); // Update time every 30s
    return () => clearInterval(timer);
  }, []);

  const fetchStudentScheduleAndAttendance = async () => {
    if (!user || !user.classId || !user.uid || !user.displayName || !user.className) {
      setIsLoadingView(false);
      setTodayLessons([]);
      return;
    }
    setIsLoadingView(true);

    try {
      const todayObj = new Date();
      const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
      const currentDayName = dayNames[todayObj.getDay()];

      const lessonsQueryInstance = query(
        collection(db, "lessons"),
        where("classId", "==", user.classId),
        where("dayOfWeek", "==", currentDayName),
        orderBy("startTime", "asc")
      );
      const lessonsSnapshot = await getDocs(lessonsQueryInstance);
      const fetchedLessons: StudentLessonDisplay[] = lessonsSnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return { id: docSnap.id, subjectName: data.subjectName, dayOfWeek: data.dayOfWeek, startTime: data.startTime, endTime: data.endTime };
      });
      setTodayLessons(fetchedLessons);

      if (fetchedLessons.length > 0) {
        const lessonIds = fetchedLessons.map(l => l.id);
        const attendanceQueryInstance = query(
          collection(db, "studentAttendanceRecords"),
          where("studentId", "==", user.uid),
          where("date", "==", Timestamp.fromDate(startOfDay(todayObj))),
          where("lessonId", "in", lessonIds.length > 0 ? lessonIds : ["_empty_"]) 
        );
        const attendanceSnapshot = await getDocs(attendanceQueryInstance);
        const recordsMap = new Map<string, StudentSelfAttendanceRecord>();
        attendanceSnapshot.forEach(docSnap => {
          const data = docSnap.data() as Omit<StudentSelfAttendanceRecord, 'id'>; // Cast to ensure type correctness
          recordsMap.set(data.lessonId, { id: docSnap.id, ...data });
        });
        setAttendanceRecords(recordsMap);
      } else {
        setAttendanceRecords(new Map());
      }
    } catch (error) {
      console.error("Error fetching student schedule/attendance: ", error);
      toast({ title: "Gagal Memuat Jadwal", variant: "destructive" });
    } finally {
      setIsLoadingView(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user && user.role === 'siswa') {
      fetchStudentScheduleAndAttendance();
    } else if (!authLoading && user && user.role !== 'siswa'){
        setIsLoadingView(false);
    }
  }, [authLoading, user]);

  const handleSelfAttend = async (lesson: StudentLessonDisplay) => {
    if (!user || !user.uid || !user.classId || !user.displayName || !user.className) {
      toast({ title: "Aksi Gagal", description: "Informasi pengguna tidak lengkap.", variant: "destructive" });
      return;
    }

    const now = new Date(); // Use server-independent current time for check
    const todayForCheck = startOfDay(now); // Compare against today
    
    const lessonStartTime = parse(lesson.startTime, "HH:mm", todayForCheck);
    const lessonEndTime = parse(lesson.endTime, "HH:mm", todayForCheck);

    if (!isValid(lessonStartTime) || !isValid(lessonEndTime)) {
        toast({title: "Jadwal Error", description: `Waktu pelajaran ${lesson.subjectName} tidak valid. Hubungi admin.`, variant: "destructive"});
        return;
    }
    
    if (now < lessonStartTime || now > lessonEndTime) {
        toast({title: "Di Luar Waktu", description: "Anda hanya bisa absen selama jam pelajaran berlangsung.", variant: "destructive"});
        return;
    }

    const attendanceRecordData: Omit<StudentSelfAttendanceRecord, 'id' | 'attendedAt'> & {attendedAt: any, date: any} = { // Use 'any' for serverTimestamp initially
      studentId: user.uid,
      studentName: user.displayName,
      classId: user.classId,
      className: user.className,
      lessonId: lesson.id,
      subjectName: lesson.subjectName,
      lessonTime: `${lesson.startTime} - ${lesson.endTime}`,
      date: Timestamp.fromDate(startOfDay(new Date())), // Use a new Date() for server consistency on record creation
      status: "Hadir",
      attendedAt: serverTimestamp(),
    };

    try {
      const docRef = await addDoc(collection(db, "studentAttendanceRecords"), attendanceRecordData);
      // Optimistically update UI or re-fetch for consistency
      setAttendanceRecords(prev => new Map(prev).set(lesson.id, { 
          ...attendanceRecordData, 
          id: docRef.id, 
          attendedAt: Timestamp.now(), // Approximate client time for UI update
          date: attendanceRecordData.date // keep the date object
        } as StudentSelfAttendanceRecord ));
      toast({ title: "Kehadiran Tercatat", description: `Anda berhasil absen untuk pelajaran ${lesson.subjectName}.` });
    } catch (error) {
      console.error("Error recording self-attendance:", error);
      toast({ title: "Gagal Absen", description: "Terjadi kesalahan. Coba lagi.", variant: "destructive" });
    }
  };

  const getLessonStatus = (lesson: StudentLessonDisplay) => {
    const now = currentTime;
    const today = startOfDay(now);

    const lessonStart = parse(lesson.startTime, "HH:mm", today);
    const lessonEnd = parse(lesson.endTime, "HH:mm", today);

    if (!isValid(lessonStart) || !isValid(lessonEnd)) {
        return { text: "Jadwal Error", button: null, icon: <Info className="h-5 w-5 text-orange-400" /> };
    }
    
    const attendedRecord = attendanceRecords.get(lesson.id);
    if (attendedRecord) {
      return { text: `Hadir (${format(attendedRecord.attendedAt.toDate(), "HH:mm")})`, button: null, icon: <CheckCircle className="h-5 w-5 text-green-500" /> };
    }
    if (now < lessonStart) {
      return { text: "Belum Dimulai", button: null, icon: <Clock className="h-5 w-5 text-gray-400" /> };
    }
    if (now >= lessonStart && now <= lessonEnd) {
      return {
        text: "Sesi Absen Terbuka",
        button: <Button onClick={() => handleSelfAttend(lesson)} size="sm" className="bg-primary hover:bg-primary/90">Absen Sekarang</Button>,
        icon: <Clock className="h-5 w-5 text-blue-500" />
      };
    }
    return { text: "Sesi Absen Berakhir", button: null, icon: <XCircle className="h-5 w-5 text-red-500" /> };
  };

  if (isLoadingView) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Kehadiran Saya</h1>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardHeader><CardTitle>Jadwal Hari Ini</CardTitle></CardHeader>
          <CardContent className="pt-6"> <Skeleton className="h-10 w-full mb-4" /> <Skeleton className="h-10 w-full mb-4" /> </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!user || user.role !== 'siswa') {
     return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Kehadiran</h1>
        <Card><CardContent className="pt-6"><div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground"><AlertCircle className="w-12 h-12 mb-4 text-destructive" /><p className="font-semibold">Halaman ini hanya untuk siswa.</p></div></CardContent></Card>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
            <h1 className="text-3xl font-bold font-headline">Kehadiran Saya</h1>
            <p className="text-muted-foreground">Hari/Tanggal: {format(currentTime, "eeee, dd MMMM yyyy", { locale: indonesiaLocale })}</p>
        </div>
        <Button onClick={fetchStudentScheduleAndAttendance} variant="outline" size="sm" className="self-start sm:self-center">
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh Status
        </Button>
      </div>
      
      {todayLessons.length === 0 ? (
         <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
            <CardHeader><CardTitle>Jadwal Hari Ini</CardTitle></CardHeader>
            <CardContent className="pt-6 text-center text-muted-foreground">
                <Info className="mx-auto h-12 w-12 mb-4 text-primary" />
                Tidak ada jadwal pelajaran untukmu hari ini.
            </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {todayLessons.map(lesson => {
            const status = getLessonStatus(lesson);
            return (
              <Card key={lesson.id} className="bg-card/80 backdrop-blur-sm border shadow-md flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{lesson.subjectName || "Pelajaran Tanpa Nama"}</CardTitle>
                  <p className="text-sm text-muted-foreground"> Waktu: {lesson.startTime} - {lesson.endTime} </p>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center space-y-2 pt-2 pb-4 flex-grow">
                    <div className="flex items-center gap-2 text-sm font-medium text-center">
                        {status.icon}
                        <span>{status.text}</span>
                    </div>
                    {status.button}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
       <Card className="mt-6 bg-card/70 backdrop-blur-sm border-border shadow-sm">
            <CardHeader><CardTitle className="text-lg">Catatan Penting</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
                <p>&bull; Pastikan Anda melakukan absen selama jam pelajaran berlangsung.</p>
                <p>&bull; Jika ada kendala teknis atau alasan lain tidak bisa absen, segera hubungi guru mata pelajaran atau wali kelas Anda.</p>
            </CardContent>
        </Card>
    </div>
  );
}


export default function AttendancePageWrapper() {
  const { user, role, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Kehadiran</h1>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md"><CardContent className="pt-6"><div className="flex items-center justify-center p-8"><Loader2 className="w-8 h-8 mr-2 animate-spin text-primary" />Memuat...</div></CardContent></Card>
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
  } else {
    return (
         <div className="space-y-6">
            <h1 className="text-3xl font-bold font-headline">Kehadiran</h1>
             <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md"><CardContent className="pt-6"><div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground"><AlertCircle className="w-12 h-12 mb-4 text-destructive" /><p className="font-semibold">Akses Ditolak.</p></div></CardContent></Card>
        </div>
    );
  }
}
