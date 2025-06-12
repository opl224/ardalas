
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { CalendarCheck, CalendarIcon, AlertCircle, Loader2, Save } from "lucide-react";
import { useState, useEffect } from "react";
import { useForm, useFieldArray, type SubmitHandler, Controller } from "react-hook-form";
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
    if (authLoading) return; // Wait for auth to load
    if (!role || !["admin", "guru"].includes(role)) return; // Early exit if not authorized

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
        // Assumes students have 'classId' field that matches doc ID from 'classes'
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
      createdAt: existingAttendanceDocId ? undefined : serverTimestamp(), // Only set createdAt on new doc
    };
    // Remove createdAt if it's undefined to avoid writing it during an update
    if (attendanceData.createdAt === undefined) {
      delete attendanceData.createdAt;
    }


    try {
      let docIdToSave = existingAttendanceDocId;
      if (!docIdToSave) {
        // Firestore will auto-generate an ID if we don't specify one for a new doc
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
    </div>
  );
}

