
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
import { CalendarCheck, CalendarIcon, AlertCircle, Loader2, Save, FileDown, FileSpreadsheet } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm, useFieldArray, type SubmitHandler, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, startOfDay, getMonth, getYear, setMonth, setYear, lastDayOfMonth } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase/config";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  getDoc,
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


interface ClassMin { id: string; name: string; }
interface StudentMin { id: string; name: string; }

const ATTENDANCE_STATUSES = ["Hadir", "Sakit", "Izin", "Alpa"] as const;
type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

interface StudentAttendanceRecord {
  studentId: string;
  studentName: string; 
  status: AttendanceStatus;
  notes?: string;
}

interface MonthlyAttendanceSummary {
  studentId: string;
  studentName: string;
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  totalDays: number; // Total instructional days in the month for this class
}


const attendanceFormSchema = z.object({
  classId: z.string({ required_error: "Pilih kelas." }),
  date: z.date({ required_error: "Tanggal harus diisi." }),
  studentAttendances: z.array(z.object({
    studentId: z.string(),
    studentName: z.string(),
    status: z.enum(ATTENDANCE_STATUSES, { required_error: "Status harus dipilih." }),
    notes: z.string().optional(),
  })).min(1, "Minimal ada satu siswa untuk mencatat kehadiran."),
});
type AttendanceFormValues = z.infer<typeof attendanceFormSchema>;

const months = [
  { value: 0, label: "Januari" }, { value: 1, label: "Februari" }, { value: 2, label: "Maret" },
  { value: 3, label: "April" }, { value: 4, label: "Mei" }, { value: 5, label: "Juni" },
  { value: 6, label: "Juli" }, { value: 7, label: "Agustus" }, { value: 8, label: "September" },
  { value: 9, label: "Oktober" }, { value: 10, label: "November" }, { value: 11, label: "Desember" }
];


export default function AttendancePage() {
  const { user, role, loading: authLoading } = useAuth(); 
  const [classes, setClasses] = useState<ClassMin[]>([]);
  const [students, setStudents] = useState<StudentMin[]>([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | undefined>();
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [existingAttendanceDocId, setExistingAttendanceDocId] = useState<string | null>(null);

  // State for export
  const [selectedExportMonth, setSelectedExportMonth] = useState<number>(getMonth(new Date()));
  const [selectedExportYear, setSelectedExportYear] = useState<number>(getYear(new Date()));
  const [isExporting, setIsExporting] = useState(false);


  const { toast } = useToast();

  const form = useForm<AttendanceFormValues>({
    resolver: zodResolver(attendanceFormSchema),
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

    const fetchClasses = async () => {
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
    fetchClasses();
  }, [toast, authLoading, role]);

  useEffect(() => {
    if (authLoading || (!role || !["admin", "guru"].includes(role))) return;
    if (!selectedClassId) {
      setStudents([]);
      replace([]); 
      return;
    }
    const fetchStudents = async () => {
      setIsLoadingStudents(true);
      form.setValue("studentAttendances", []); 
      try {
        const studentsQuery = query(collection(db, "students"), where("classId", "==", selectedClassId), orderBy("name", "asc"));
        const studentsSnapshot = await getDocs(studentsQuery);

        const fetchedStudents: StudentMin[] = studentsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
        setStudents(fetchedStudents);
        
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
        setStudents([]);
        replace([]);
      } finally {
        setIsLoadingStudents(false);
      }
    };
    fetchStudents();
  }, [selectedClassId, toast, replace, form, authLoading, role]);


  useEffect(() => {
    if (authLoading || (!role || !["admin", "guru"].includes(role))) return;
    if (!selectedClassId || !selectedDate) {
      setExistingAttendanceDocId(null);
      if (students.length > 0) {
         const resetAttendance = students.map(student => ({
          studentId: student.id,
          studentName: student.name,
          status: "Hadir" as AttendanceStatus,
          notes: "",
        }));
        form.setValue("studentAttendances", resetAttendance);
      }
      return;
    }

    const fetchAttendance = async () => {
      setIsLoadingAttendance(true);
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
          const data = attendanceDoc.data() as Omit<AttendanceFormValues, 'date'> & { date: Timestamp, studentAttendances: StudentAttendanceRecord[] };
          
          const currentClassStudents = students.length > 0 ? students : (await getDocs(query(collection(db, "students"), where("classId", "==", selectedClassId), orderBy("name", "asc")))).docs.map(d => ({id: d.id, name: d.data().name}));

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
          if (students.length > 0) {
            const initialAttendance = students.map(student => ({
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
        setIsLoadingAttendance(false);
      }
    };

    if(students.length > 0 || !isLoadingStudents) {
        fetchAttendance();
    }

  }, [selectedClassId, selectedDate, toast, form, students, isLoadingStudents, authLoading, role]);


  const handleSaveAttendance: SubmitHandler<AttendanceFormValues> = async (data) => {
    setIsSubmitting(true);
    const attendanceDate = Timestamp.fromDate(startOfDay(data.date));
    const selectedClass = classes.find(c => c.id === data.classId);

    if (!user || !selectedClass) {
        toast({ title: "Data tidak lengkap", description: "Pengguna atau kelas tidak ditemukan.", variant: "destructive"});
        setIsSubmitting(false);
        return;
    }

    const attendanceData = {
      classId: data.classId,
      className: selectedClass.name,
      date: attendanceDate,
      studentAttendances: data.studentAttendances,
      recordedById: user.uid,
      recordedByName: user.displayName || user.email || "N/A",
      lastUpdatedAt: serverTimestamp(),
      createdAt: existingAttendanceDocId ? undefined : serverTimestamp(), 
    };
    if (attendanceData.createdAt === undefined) {
      delete attendanceData.createdAt;
    }


    try {
      let docIdToSave = existingAttendanceDocId;
      if (!docIdToSave) {
        docIdToSave = doc(collection(db, "attendances")).id; 
      }
      
      await setDoc(doc(db, "attendances", docIdToSave), attendanceData, { merge: true }); 

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
    setStudents([]); 
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

  // --- Export Functions ---
  const handleExportDailyExcel = () => {
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

  const handleExportDailyPdf = () => {
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
        const attendanceDayData = docSnap.data() as Omit<AttendanceFormValues, 'date'> & { date: Timestamp };
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


  if (authLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Manajemen Kehadiran</h1>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 mr-2 animate-spin text-primary" />
              Memuat data pengguna...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!role || !["admin", "guru"].includes(role)) {
    return (
         <div className="space-y-6">
            <h1 className="text-3xl font-bold font-headline">Manajemen Kehadiran</h1>
             <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
                <CardContent className="pt-6">
                    <div className="flex items-center justify-center p-8 text-muted-foreground">
                        <AlertCircle className="w-8 h-8 mr-2 text-destructive" />
                        Anda tidak memiliki izin untuk mengakses halaman ini.
                    </div>
                </CardContent>
            </Card>
        </div>
    );
  }

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
                <Label htmlFor="classId">Kelas</Label>
                <Select
                  value={selectedClassId}
                  onValueChange={handleClassChange}
                  disabled={isLoadingClasses || isSubmitting}
                >
                  <SelectTrigger id="classId" className="mt-1">
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
                <Label htmlFor="date">Tanggal</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className="w-full justify-start text-left font-normal mt-1"
                      disabled={isLoadingAttendance || isSubmitting}
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
                      disabled={isLoadingAttendance || isSubmitting}
                    />
                  </PopoverContent>
                </Popover>
                 {form.formState.errors.date && <p className="text-sm text-destructive mt-1">{form.formState.errors.date.message}</p>}
              </div>
            </div>

            {selectedClassId && selectedDate && (
              isLoadingStudents || isLoadingAttendance ? (
                <div className="space-y-2 mt-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : students.length === 0 && !isLoadingStudents ? (
                 <div className="mt-4 p-4 border border-dashed border-border rounded-md text-center text-muted-foreground">
                    Tidak ada siswa di kelas ini atau data siswa belum termuat.
                 </div>
              ) : fields.length > 0 ? (
                <div className="mt-4 space-y-4">
                  <h3 className="text-lg font-medium">Daftar Siswa ({students.length} siswa)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="border-b">
                            <tr>
                                <th className="p-2 text-left">Nama Siswa</th>
                                <th className="p-2 text-left w-36">Status</th>
                                <th className="p-2 text-left">Catatan (Opsional)</th>
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
                                    <SelectContent>
                                        {ATTENDANCE_STATUSES.map(status => (
                                        <SelectItem key={status} value={status}>{status}</SelectItem>
                                        ))}
                                    </SelectContent>
                                    </Select>
                                )}
                                />
                                {form.formState.errors.studentAttendances?.[index]?.status && (
                                    <p className="text-sm text-destructive mt-1">
                                    {form.formState.errors.studentAttendances?.[index]?.status?.message}
                                    </p>
                                )}
                            </td>
                            <td className="p-2">
                                <Input
                                {...form.register(`studentAttendances.${index}.notes`)}
                                placeholder="Catatan..."
                                className="mt-0"
                                disabled={isSubmitting}
                                />
                            </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                  </div>
                  {form.formState.errors.studentAttendances && !form.formState.errors.studentAttendances.message && (
                    <p className="text-sm text-destructive mt-1">Periksa kembali input kehadiran siswa.</p>
                  )}
                   {form.formState.errors.studentAttendances?.message && (
                    <p className="text-sm text-destructive mt-1">{form.formState.errors.studentAttendances?.message}</p>
                  )}
                </div>
              ) : null
            )}

            {fields.length > 0 && selectedClassId && selectedDate && !isLoadingStudents && !isLoadingAttendance && (
              <div className="flex justify-end mt-6">
                <Button type="submit" disabled={isSubmitting || isLoadingAttendance || isLoadingStudents}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSubmitting ? "Menyimpan..." : (existingAttendanceDocId ? "Perbarui Kehadiran" : "Simpan Kehadiran")}
                  {!isSubmitting && <Save className="ml-2 h-4 w-4" />}
                </Button>
              </div>
            )}
             {form.formState.errors.root && (
                <p className="text-sm font-medium text-destructive">{form.formState.errors.root.message}</p>
             )}
          </CardContent>
        </Card>
      </form>

      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDown className="h-6 w-6 text-primary" />
            <span>Rekap & Ekspor Kehadiran</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <Label htmlFor="exportClassId">Kelas (untuk Rekap)</Label>
              <Select
                value={selectedClassId} 
                onValueChange={(value) => setSelectedClassId(value)} 
                disabled={isLoadingClasses || isExporting}
              >
                <SelectTrigger id="exportClassId" className="mt-1">
                  <SelectValue placeholder={isLoadingClasses ? "Memuat..." : "Pilih kelas"} />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="exportMonth">Bulan (untuk Rekap Bulanan)</Label>
              <Select
                value={selectedExportMonth.toString()}
                onValueChange={(value) => setSelectedExportMonth(parseInt(value))}
                disabled={isExporting}
              >
                <SelectTrigger id="exportMonth" className="mt-1">
                  <SelectValue placeholder="Pilih bulan" />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="exportYear">Tahun (untuk Rekap Bulanan)</Label>
              <Input
                id="exportYear"
                type="number"
                value={selectedExportYear}
                onChange={(e) => setSelectedExportYear(parseInt(e.target.value))}
                className="mt-1"
                placeholder="Contoh: 2024"
                disabled={isExporting}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={isExporting}>
                {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <FileDown className="mr-2 h-4 w-4" /> Ekspor
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleExportDailyExcel}
                disabled={isExporting || !selectedClassId || !selectedDate || fields.length === 0}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel Harian
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportDailyPdf}
                disabled={isExporting || !selectedClassId || !selectedDate || fields.length === 0}
              >
                <FileDown className="mr-2 h-4 w-4" /> PDF Harian
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportMonthlyExcel}
                disabled={isExporting || !selectedClassId || selectedExportMonth === null || !selectedExportYear}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel Bulanan
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportMonthlyPdf}
                disabled={isExporting || !selectedClassId || selectedExportMonth === null || !selectedExportYear}
              >
                <FileDown className="mr-2 h-4 w-4" /> PDF Bulanan
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardFooter>
      </Card>
    </div>
  );
}

