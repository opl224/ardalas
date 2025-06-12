
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
import { ClipboardCheck, PlusCircle, Edit, Trash2, CalendarIcon, DownloadCloud, Send, Eye } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm, type SubmitHandler, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, isPast } from "date-fns";
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
  documentId,
  getDoc,
  writeBatch
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Minimal interfaces for dropdowns
interface SubjectMin { id: string; name: string; }
interface ClassMin { id: string; name: string; }
interface TeacherMin { id: string; name: string; }

interface AssignmentData {
  id: string;
  title: string;
  subjectId: string;
  subjectName?: string; 
  classId: string;
  className?: string; 
  teacherId: string;
  teacherName?: string; 
  dueDate: Timestamp; 
  description?: string;
  fileURL?: string; 
  createdAt?: Timestamp;
  // For student view
  submissionStatus?: "Belum Dikerjakan" | "Sudah Dikerjakan" | "Terlambat";
  studentSubmissionLink?: string;
  submissionTimestamp?: Timestamp;
  // For teacher view
  submissionCount?: number;
  totalStudentsInClass?: number; // For "X/Y submitted"
}

interface AssignmentSubmission {
  id?: string; // Firestore document ID
  assignmentId: string;
  studentId: string;
  studentName: string;
  classId: string; // Student's classId at time of submission
  className?: string; // Student's className at time of submission
  submissionLink: string;
  submittedAt: Timestamp;
  notes?: string;
  teacherFileURL?: string; // Store the teacher's file URL for student reference
}


const assignmentFormSchema = z.object({
  title: z.string().min(3, { message: "Judul tugas minimal 3 karakter." }),
  subjectId: z.string({ required_error: "Pilih mata pelajaran." }),
  classId: z.string({ required_error: "Pilih kelas." }),
  teacherId: z.string({ required_error: "Pilih guru pemberi tugas." }),
  dueDate: z.date({ required_error: "Batas waktu harus diisi." }),
  description: z.string().optional(),
  fileURL: z.string().url({ message: "Format URL file tidak valid." }).optional().or(z.literal("")),
});
type AssignmentFormValues = z.infer<typeof assignmentFormSchema>;

const editAssignmentFormSchema = assignmentFormSchema.extend({
  id: z.string(),
});
type EditAssignmentFormValues = z.infer<typeof editAssignmentFormSchema>;

const studentSubmissionFormSchema = z.object({
  submissionLink: z.string().url({ message: "Link Google Drive tidak valid."}).min(1, "Link pengumpulan harus diisi."),
  notes: z.string().optional(),
});
type StudentSubmissionFormValues = z.infer<typeof studentSubmissionFormSchema>;


export default function AssignmentsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const [assignments, setAssignments] = useState<AssignmentData[]>([]);
  const [subjects, setSubjects] = useState<SubjectMin[]>([]);
  const [classes, setClasses] = useState<ClassMin[]>([]);
  const [teachers, setTeachers] = useState<TeacherMin[]>([]);
  
  const [studentSubmissions, setStudentSubmissions] = useState<Map<string, AssignmentSubmission>>(new Map()); // Map<assignmentId, submissionData>
  const [submissionsForCurrentAssignment, setSubmissionsForCurrentAssignment] = useState<AssignmentSubmission[]>([]);

  const [isLoading, setIsLoading] = useState(true); // General loading for initial data
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false); // For loading submissions in teacher view dialog

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentData | null>(null);

  const [isSubmitAssignmentDialogOpen, setIsSubmitAssignmentDialogOpen] = useState(false);
  const [selectedAssignmentForSubmission, setSelectedAssignmentForSubmission] = useState<AssignmentData | null>(null);
  
  const [isViewSubmissionsDialogOpen, setIsViewSubmissionsDialogOpen] = useState(false);
  const [selectedAssignmentToViewSubmissions, setSelectedAssignmentToViewSubmissions] = useState<AssignmentData | null>(null);


  const { toast } = useToast();

  const addAssignmentForm = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: { title: "", subjectId: undefined, classId: undefined, teacherId: undefined, dueDate: new Date(), description: "", fileURL: "" },
  });

  const editAssignmentForm = useForm<EditAssignmentFormValues>({ resolver: zodResolver(editAssignmentFormSchema) });

  const studentSubmitForm = useForm<StudentSubmissionFormValues>({
    resolver: zodResolver(studentSubmissionFormSchema),
    defaultValues: { submissionLink: "", notes: "" },
  });

  const isStudentRole = role === "siswa";
  const isTeacherOrAdminRole = role === "guru" || role === "admin";

  const fetchDropdownData = async () => {
    // Only needed for teacher/admin
    if (!isTeacherOrAdminRole) return;
    try {
      const [subjectsSnapshot, classesSnapshot, teachersSnapshot, studentsSnapshot] = await Promise.all([
        getDocs(query(collection(db, "subjects"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "classes"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "teachers"), orderBy("name", "asc"))),
        getDocs(collection(db, "students")) // Fetch all students to count for classes
      ]);
      setSubjects(subjectsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
      
      const classData = classesSnapshot.docs.map(doc => {
        const classId = doc.id;
        const studentCount = studentsSnapshot.docs.filter(sDoc => sDoc.data().classId === classId).length;
        return { id: classId, name: doc.data().name, totalStudents: studentCount };
      });
      setClasses(classData.map(c => ({id: c.id, name: c.name}))); // Store minimal for dropdowns

      // We'll use this full classData with student counts when fetching assignments for teachers
      // This is a bit of a workaround, ideally this count would be on the class doc or aggregated elsewhere

      setTeachers(teachersSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    } catch (error) {
      console.error("Error fetching dropdown data: ", error);
      toast({ title: "Gagal Memuat Data Pendukung", variant: "destructive" });
    }
  };
  
  const fetchAssignments = async () => {
    setIsLoading(true);
    try {
      if (isTeacherOrAdminRole) {
        await fetchDropdownData(); // Ensure dropdowns are loaded for teacher/admin if they open the add/edit dialog
      }
      
      let assignmentsQuery = query(collection(db, "assignments"), orderBy("dueDate", "desc"));
      
      // This 'user' is from useAuth() hook, which should have classId if role is siswa
      if (isStudentRole && user?.classId && user.classId.trim() !== "") {
        assignmentsQuery = query(collection(db, "assignments"), where("classId", "==", user.classId), orderBy("dueDate", "desc"));
      } else if (isStudentRole && (!user?.classId || user.classId.trim() === "")) {
        // Student not associated with a class, or classId is empty, show no assignments
        // This condition is also handled in the useEffect that calls fetchAssignments
        setAssignments([]);
        setIsLoading(false);
        return;
      }

      const querySnapshot = await getDocs(assignmentsQuery);
      let fetchedAssignments: AssignmentData[] = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title,
          subjectId: data.subjectId,
          subjectName: data.subjectName,
          classId: data.classId,
          className: data.className,
          teacherId: data.teacherId,
          teacherName: data.teacherName,
          dueDate: data.dueDate, 
          description: data.description,
          fileURL: data.fileURL,
          createdAt: data.createdAt,
        };
      });

      if (isStudentRole && user) {
        const submissionsSnapshot = await getDocs(query(collection(db, "assignmentSubmissions"), where("studentId", "==", user.uid)));
        const userSubs = new Map<string, AssignmentSubmission>();
        submissionsSnapshot.forEach(doc => {
          const subData = doc.data() as AssignmentSubmission;
          userSubs.set(subData.assignmentId, { ...subData, id: doc.id });
        });
        setStudentSubmissions(userSubs);

        fetchedAssignments = fetchedAssignments.map(assignment => {
          const submission = userSubs.get(assignment.id);
          let submissionStatus: AssignmentData["submissionStatus"] = "Belum Dikerjakan";
          if (submission) {
            submissionStatus = isPast(assignment.dueDate.toDate()) && !submission ? "Terlambat" : "Sudah Dikerjakan";
          } else if (isPast(assignment.dueDate.toDate())) {
            submissionStatus = "Terlambat";
          }
          return { 
            ...assignment, 
            submissionStatus,
            studentSubmissionLink: submission?.submissionLink,
            submissionTimestamp: submission?.submittedAt
          };
        });

      } else if (isTeacherOrAdminRole) {
        // For teacher/admin, fetch submission counts for each assignment's class
        const classStudentCounts: Record<string, number> = {};
        const studentsSnapshot = await getDocs(collection(db, "students"));
        studentsSnapshot.forEach(sDoc => {
            const classId = sDoc.data().classId;
            if(classId) classStudentCounts[classId] = (classStudentCounts[classId] || 0) + 1;
        });

        const assignmentsWithCounts = await Promise.all(fetchedAssignments.map(async assignment => {
            const submissionsSnapshot = await getDocs(query(collection(db, "assignmentSubmissions"), where("assignmentId", "==", assignment.id)));
            return {
                ...assignment,
                submissionCount: submissionsSnapshot.size,
                totalStudentsInClass: classStudentCounts[assignment.classId] || 0,
            };
        }));
        fetchedAssignments = assignmentsWithCounts;
      }

      setAssignments(fetchedAssignments);
    } catch (error) {
      console.error("Error fetching assignments: ", error);
      toast({ title: "Gagal Memuat Data Tugas", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) {
      setIsLoading(true); 
      return;
    }

    if (!user) { 
      setIsLoading(false);
      setAssignments([]);
      return;
    }

    if (isStudentRole) {
      if (user.classId && user.classId.trim() !== "") {
        fetchAssignments();
      } else {
        toast({
          title: "Tidak Terdaftar di Kelas",
          description: "Anda belum terdaftar di kelas manapun atau ID kelas tidak valid. Tugas tidak dapat ditampilkan.",
          variant: "destructive",
        });
        setAssignments([]);
        setIsLoading(false);
      }
    } else if (isTeacherOrAdminRole) {
      fetchAssignments(); 
    } else {
      setAssignments([]);
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, role, user?.classId]);


  useEffect(() => {
    if (selectedAssignment && isEditDialogOpen) {
      editAssignmentForm.reset({
        id: selectedAssignment.id,
        title: selectedAssignment.title,
        subjectId: selectedAssignment.subjectId,
        classId: selectedAssignment.classId,
        teacherId: selectedAssignment.teacherId,
        dueDate: selectedAssignment.dueDate.toDate(),
        description: selectedAssignment.description || "",
        fileURL: selectedAssignment.fileURL || "",
      });
    }
  }, [selectedAssignment, isEditDialogOpen, editAssignmentForm]);

  const getDenormalizedNames = (data: AssignmentFormValues | EditAssignmentFormValues) => {
    const subject = subjects.find(s => s.id === data.subjectId);
    const aClass = classes.find(c => c.id === data.classId);
    const teacher = teachers.find(t => t.id === data.teacherId);
    return { subjectName: subject?.name, className: aClass?.name, teacherName: teacher?.name };
  };

  // --- Teacher/Admin Handlers ---
  const handleAddAssignmentSubmit: SubmitHandler<AssignmentFormValues> = async (data) => { 
    addAssignmentForm.clearErrors();
    const { subjectName, className, teacherName } = getDenormalizedNames(data);
    if (!subjectName || !className || !teacherName) {
      toast({title: "Data Tidak Lengkap", description: "Pastikan subjek, kelas, dan guru valid.", variant: "destructive"});
      return;
    }
    try {
      await addDoc(collection(db, "assignments"), { ...data, dueDate: Timestamp.fromDate(data.dueDate), subjectName, className, teacherName, createdAt: serverTimestamp() });
      toast({ title: "Tugas Ditambahkan" });
      setIsAddDialogOpen(false);
      addAssignmentForm.reset({ dueDate: new Date(), title: "", subjectId: undefined, classId: undefined, teacherId: undefined, description: "", fileURL: "" });
      fetchAssignments();
    } catch (error: any) {
      toast({ title: "Gagal Menambahkan Tugas", variant: "destructive" });
    }
  };
  const handleEditAssignmentSubmit: SubmitHandler<EditAssignmentFormValues> = async (data) => { 
    if (!selectedAssignment) return;
    editAssignmentForm.clearErrors();
    const { subjectName, className, teacherName } = getDenormalizedNames(data);
    if (!subjectName || !className || !teacherName) {
      toast({title: "Data Tidak Lengkap", variant: "destructive"});
      return;
    }
    try {
      const assignmentDocRef = doc(db, "assignments", data.id);
      await updateDoc(assignmentDocRef, { ...data,  dueDate: Timestamp.fromDate(data.dueDate), subjectName, className, teacherName });
      toast({ title: "Tugas Diperbarui" });
      setIsEditDialogOpen(false);
      setSelectedAssignment(null);
      fetchAssignments();
    } catch (error) {
      toast({ title: "Gagal Memperbarui Tugas", variant: "destructive" });
    }
  };
  const handleDeleteAssignment = async (assignmentId: string) => { 
    try {
      // Also delete submissions related to this assignment
      const submissionsQuery = query(collection(db, "assignmentSubmissions"), where("assignmentId", "==", assignmentId));
      const submissionsSnapshot = await getDocs(submissionsQuery);
      const batch = writeBatch(db);
      submissionsSnapshot.forEach(doc => batch.delete(doc.ref));
      batch.delete(doc(db, "assignments", assignmentId));
      await batch.commit();

      toast({ title: "Tugas Dihapus" });
      setSelectedAssignment(null);
      fetchAssignments();
    } catch (error) {
      toast({ title: "Gagal Menghapus Tugas", variant: "destructive" });
    }
  };
  
  const openEditDialog = (assignment: AssignmentData) => { setSelectedAssignment(assignment); setIsEditDialogOpen(true); };
  const openDeleteDialog = (assignment: AssignmentData) => { setSelectedAssignment(assignment); };

  const handleOpenViewSubmissions = async (assignment: AssignmentData) => {
    setSelectedAssignmentToViewSubmissions(assignment);
    setIsViewSubmissionsDialogOpen(true);
    setIsLoadingSubmissions(true);
    try {
        const q = query(collection(db, "assignmentSubmissions"), where("assignmentId", "==", assignment.id), orderBy("submittedAt", "desc"));
        const snapshot = await getDocs(q);
        setSubmissionsForCurrentAssignment(snapshot.docs.map(d => ({id: d.id, ...d.data() } as AssignmentSubmission)));
    } catch (error) {
        console.error("Error fetching submissions for assignment:", error);
        toast({ title: "Gagal memuat pengumpulan", variant: "destructive" });
        setSubmissionsForCurrentAssignment([]);
    } finally {
        setIsLoadingSubmissions(false);
    }
  };

  // --- Student Handlers ---
  const handleOpenSubmitAssignmentDialog = (assignment: AssignmentData) => {
    setSelectedAssignmentForSubmission(assignment);
    const existingSubmission = studentSubmissions.get(assignment.id);
    studentSubmitForm.reset({
      submissionLink: existingSubmission?.submissionLink || "",
      notes: existingSubmission?.notes || "",
    });
    setIsSubmitAssignmentDialogOpen(true);
  };

  const handleStudentSubmitAssignment: SubmitHandler<StudentSubmissionFormValues> = async (data) => {
    if (!user || !selectedAssignmentForSubmission || !user.uid || !user.displayName || !user.classId) {
      toast({ title: "Aksi Gagal", description: "Data pengguna atau tugas tidak lengkap.", variant: "destructive" });
      return;
    }

    studentSubmitForm.clearErrors();

    const submissionData: Omit<AssignmentSubmission, "id"> = {
      assignmentId: selectedAssignmentForSubmission.id,
      studentId: user.uid,
      studentName: user.displayName,
      classId: user.classId,
      className: user.className || "", // Assuming className is in AuthContext user
      submissionLink: data.submissionLink,
      submittedAt: Timestamp.now(),
      notes: data.notes,
      teacherFileURL: selectedAssignmentForSubmission.fileURL || "",
    };

    try {
      // Check if student already submitted this assignment
      const existingSubmission = studentSubmissions.get(selectedAssignmentForSubmission.id);
      if (existingSubmission?.id) {
        // Update existing submission
        await updateDoc(doc(db, "assignmentSubmissions", existingSubmission.id), submissionData);
        toast({ title: "Pengumpulan Diperbarui" });
      } else {
        // Add new submission
        await addDoc(collection(db, "assignmentSubmissions"), submissionData);
        toast({ title: "Tugas Terkirim" });
      }
      setIsSubmitAssignmentDialogOpen(false);
      setSelectedAssignmentForSubmission(null);
      studentSubmitForm.reset();
      fetchAssignments(); // Re-fetch to update status
    } catch (error) {
      console.error("Error submitting assignment:", error);
      toast({ title: "Gagal Mengirim Tugas", variant: "destructive" });
    }
  };


  if (authLoading || (!user && !authLoading)) { // Show loading if auth is loading OR if not logged in and not done loading auth
    return <div className="space-y-6"><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Tugas</h1>
        <p className="text-muted-foreground">
          {isStudentRole ? "Lihat dan kerjakan tugas Anda." : "Kelola pemberian tugas, pengumpulan, dan penilaian."}
        </p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            <span>Daftar Tugas</span>
          </CardTitle>
          {isTeacherOrAdminRole && (
            <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
              setIsAddDialogOpen(isOpen);
              if (!isOpen) { addAssignmentForm.reset({ dueDate: new Date(), title: "", subjectId: undefined, classId: undefined, teacherId: undefined, description: "", fileURL: "" }); addAssignmentForm.clearErrors(); }
            }}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => { if (subjects.length === 0 || classes.length === 0 || teachers.length === 0) fetchDropdownData(); }}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Tambah Tugas
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>Tambah Tugas Baru</DialogTitle><DialogDescription>Isi detail tugas.</DialogDescription></DialogHeader>
                <form onSubmit={addAssignmentForm.handleSubmit(handleAddAssignmentSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                  {/* Teacher/Admin Add Form Fields (Existing) */}
                  <div><Label htmlFor="add-assignment-title">Judul Tugas</Label><Input id="add-assignment-title" {...addAssignmentForm.register("title")} className="mt-1" />{addAssignmentForm.formState.errors.title && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.title.message}</p>}</div>
                  <div><Label htmlFor="add-assignment-subjectId">Mata Pelajaran</Label><Select onValueChange={(value) => addAssignmentForm.setValue("subjectId", value, { shouldValidate: true })} defaultValue={addAssignmentForm.getValues("subjectId")}><SelectTrigger id="add-assignment-subjectId" className="mt-1"><SelectValue placeholder="Pilih mata pelajaran" /></SelectTrigger><SelectContent>{subjects.length === 0 && <SelectItem value="loading" disabled>Memuat...</SelectItem>}{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>{addAssignmentForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.subjectId.message}</p>}</div>
                  <div><Label htmlFor="add-assignment-classId">Kelas</Label><Select onValueChange={(value) => addAssignmentForm.setValue("classId", value, { shouldValidate: true })} defaultValue={addAssignmentForm.getValues("classId")}><SelectTrigger id="add-assignment-classId" className="mt-1"><SelectValue placeholder="Pilih kelas" /></SelectTrigger><SelectContent>{classes.length === 0 && <SelectItem value="loading" disabled>Memuat...</SelectItem>}{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>{addAssignmentForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.classId.message}</p>}</div>
                  <div><Label htmlFor="add-assignment-teacherId">Guru Pemberi Tugas</Label><Select onValueChange={(value) => addAssignmentForm.setValue("teacherId", value, { shouldValidate: true })} defaultValue={addAssignmentForm.getValues("teacherId")}><SelectTrigger id="add-assignment-teacherId" className="mt-1"><SelectValue placeholder="Pilih guru" /></SelectTrigger><SelectContent>{teachers.length === 0 && <SelectItem value="loading" disabled>Memuat...</SelectItem>}{teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>{addAssignmentForm.formState.errors.teacherId && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.teacherId.message}</p>}</div>
                  <div><Label htmlFor="add-assignment-dueDate">Batas Waktu Pengumpulan</Label><Popover><PopoverTrigger asChild><Button variant={"outline"} className="w-full justify-start text-left font-normal mt-1"><CalendarIcon className="mr-2 h-4 w-4" />{addAssignmentForm.watch("dueDate") ? format(addAssignmentForm.watch("dueDate"), "PPP", { locale: indonesiaLocale }) : <span>Pilih tanggal</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={addAssignmentForm.watch("dueDate")} onSelect={(date) => addAssignmentForm.setValue("dueDate", date || new Date(), { shouldValidate: true })} initialFocus /></PopoverContent></Popover>{addAssignmentForm.formState.errors.dueDate && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.dueDate.message}</p>}</div>
                  <div><Label htmlFor="add-assignment-description">Deskripsi Tugas</Label><Textarea id="add-assignment-description" {...addAssignmentForm.register("description")} className="mt-1" placeholder="Jelaskan detail tugas di sini..." /></div>
                  <div><Label htmlFor="add-assignment-fileURL">URL File Tugas (Opsional)</Label><Input id="add-assignment-fileURL" {...addAssignmentForm.register("fileURL")} className="mt-1" placeholder="https://contoh.com/file_tugas.pdf" />{addAssignmentForm.formState.errors.fileURL && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.fileURL.message}</p>}</div>
                  <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose><Button type="submit" disabled={addAssignmentForm.formState.isSubmitting}>{addAssignmentForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Tugas"}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2 mt-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : assignments.length > 0 ? (
            <div className="overflow-x-auto mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Judul Tugas</TableHead>
                    <TableHead>Mata Pelajaran</TableHead>
                    {isStudentRole && <TableHead>Guru</TableHead>}
                    {!isStudentRole && <TableHead>Kelas</TableHead>}
                    {!isStudentRole && <TableHead>Guru</TableHead>}
                    <TableHead>Batas Waktu</TableHead>
                    {isStudentRole && <TableHead>File Tugas</TableHead>}
                    {isStudentRole && <TableHead>Status</TableHead>}
                    {isTeacherOrAdminRole && <TableHead>Pengumpulan</TableHead>}
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell className="font-medium">{assignment.title}</TableCell>
                      <TableCell>{assignment.subjectName || assignment.subjectId}</TableCell>
                      {isStudentRole && <TableCell>{assignment.teacherName || assignment.teacherId}</TableCell>}
                      {!isStudentRole && <TableCell>{assignment.className || assignment.classId}</TableCell>}
                      {!isStudentRole && <TableCell>{assignment.teacherName || assignment.teacherId}</TableCell>}
                      <TableCell className={cn(isStudentRole && isPast(assignment.dueDate.toDate()) && assignment.submissionStatus === "Belum Dikerjakan" && "text-destructive font-semibold")}>
                        {format(assignment.dueDate.toDate(), "dd MMM yyyy, HH:mm", { locale: indonesiaLocale })}
                      </TableCell>
                      
                      {isStudentRole && (
                        <>
                          <TableCell>
                            {assignment.fileURL ? (
                              <Button variant="outline" size="icon" asChild>
                                <Link href={assignment.fileURL} target="_blank" rel="noopener noreferrer" aria-label={`Unduh file tugas ${assignment.title}`}>
                                  <DownloadCloud className="h-4 w-4" />
                                </Link>
                              </Button>
                            ) : "-"}
                          </TableCell>
                          <TableCell>
                            <span className={cn(
                                assignment.submissionStatus === "Sudah Dikerjakan" && "text-green-600",
                                assignment.submissionStatus === "Terlambat" && "text-destructive",
                                "font-medium"
                            )}>
                                {assignment.submissionStatus}
                                {assignment.submissionStatus === "Sudah Dikerjakan" && assignment.submissionTimestamp && (
                                    <span className="text-xs text-muted-foreground block"> ({format(assignment.submissionTimestamp.toDate(), "dd MMM, HH:mm")})</span>
                                )}
                            </span>
                          </TableCell>
                        </>
                      )}

                      {isTeacherOrAdminRole && (
                        <TableCell>
                          {assignment.submissionCount !== undefined && assignment.totalStudentsInClass !== undefined
                            ? `${assignment.submissionCount}/${assignment.totalStudentsInClass} siswa`
                            : "Memuat..."}
                        </TableCell>
                      )}

                      <TableCell className="text-right space-x-2">
                        {isTeacherOrAdminRole && (
                          <>
                            <Button variant="outline" size="icon" onClick={() => handleOpenViewSubmissions(assignment)} aria-label={`Lihat pengumpulan ${assignment.title}`}>
                                <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => openEditDialog(assignment)} aria-label={`Edit tugas ${assignment.title}`}><Edit className="h-4 w-4" /></Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild><Button variant="destructive" size="icon" onClick={() => openDeleteDialog(assignment)} aria-label={`Hapus tugas ${assignment.title}`}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                              {selectedAssignment && selectedAssignment.id === assignment.id && (<AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle><AlertDialogDescription>Tindakan ini akan menghapus tugas <span className="font-semibold">{selectedAssignment?.title}</span> beserta semua data pengumpulannya.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setSelectedAssignment(null)}>Batal</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteAssignment(selectedAssignment.id)}>Ya, Hapus Tugas</AlertDialogAction></AlertDialogFooter></AlertDialogContent>)}
                            </AlertDialog>
                          </>
                        )}
                        {isStudentRole && (
                           assignment.submissionStatus === "Sudah Dikerjakan" ? (
                             <Button variant="outline" size="sm" onClick={() => handleOpenSubmitAssignmentDialog(assignment)}>
                                Lihat/Edit Pengumpulan
                             </Button>
                           ) : (
                             <Button size="sm" onClick={() => handleOpenSubmitAssignmentDialog(assignment)} disabled={isPast(assignment.dueDate.toDate()) && assignment.submissionStatus !== "Sudah Dikerjakan"}>
                                <Send className="mr-2 h-4 w-4" /> Kerjakan Tugas
                             </Button>
                           )
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : ( <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">Belum ada tugas.</div> )}
        </CardContent>
      </Card>

      {/* Edit Assignment Dialog (Teacher/Admin) */}
      {isTeacherOrAdminRole && selectedAssignment && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => { setIsEditDialogOpen(isOpen); if (!isOpen) { setSelectedAssignment(null); editAssignmentForm.clearErrors(); } }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Edit Tugas</DialogTitle><DialogDescription>Perbarui detail tugas.</DialogDescription></DialogHeader>
            <form onSubmit={editAssignmentForm.handleSubmit(handleEditAssignmentSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <Input type="hidden" {...editAssignmentForm.register("id")} />
              {/* Teacher/Admin Edit Form Fields (Existing) - Simplified for brevity */}
              <div><Label htmlFor="edit-assignment-title">Judul Tugas</Label><Input id="edit-assignment-title" {...editAssignmentForm.register("title")} className="mt-1" />{editAssignmentForm.formState.errors.title && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.title.message}</p>}</div>
              <div><Label htmlFor="edit-assignment-subjectId">Mata Pelajaran</Label><Select onValueChange={(value) => editAssignmentForm.setValue("subjectId", value, { shouldValidate: true })} defaultValue={editAssignmentForm.getValues("subjectId")}><SelectTrigger id="edit-assignment-subjectId" className="mt-1"><SelectValue placeholder="Pilih mata pelajaran" /></SelectTrigger><SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>{editAssignmentForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.subjectId.message}</p>}</div>
              <div><Label htmlFor="edit-assignment-classId">Kelas</Label><Select onValueChange={(value) => editAssignmentForm.setValue("classId", value, { shouldValidate: true })} defaultValue={editAssignmentForm.getValues("classId")}><SelectTrigger id="edit-assignment-classId" className="mt-1"><SelectValue placeholder="Pilih kelas" /></SelectTrigger><SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>{editAssignmentForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.classId.message}</p>}</div>
              <div><Label htmlFor="edit-assignment-teacherId">Guru</Label><Select onValueChange={(value) => editAssignmentForm.setValue("teacherId", value, { shouldValidate: true })} defaultValue={editAssignmentForm.getValues("teacherId")}><SelectTrigger id="edit-assignment-teacherId" className="mt-1"><SelectValue placeholder="Pilih guru" /></SelectTrigger><SelectContent>{teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>{editAssignmentForm.formState.errors.teacherId && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.teacherId.message}</p>}</div>
              <div><Label htmlFor="edit-assignment-dueDate">Batas Waktu</Label><Popover><PopoverTrigger asChild><Button variant={"outline"} className="w-full justify-start text-left font-normal mt-1"><CalendarIcon className="mr-2 h-4 w-4" />{editAssignmentForm.watch("dueDate") ? format(editAssignmentForm.watch("dueDate"), "PPP", { locale: indonesiaLocale }) : <span>Pilih tanggal</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={editAssignmentForm.watch("dueDate")} onSelect={(date) => editAssignmentForm.setValue("dueDate", date || new Date(), { shouldValidate: true })} initialFocus /></PopoverContent></Popover>{editAssignmentForm.formState.errors.dueDate && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.dueDate.message}</p>}</div>
              <div><Label htmlFor="edit-assignment-description">Deskripsi</Label><Textarea id="edit-assignment-description" {...editAssignmentForm.register("description")} className="mt-1" /></div>
              <div><Label htmlFor="edit-assignment-fileURL">URL File</Label><Input id="edit-assignment-fileURL" {...editAssignmentForm.register("fileURL")} className="mt-1" />{editAssignmentForm.formState.errors.fileURL && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.fileURL.message}</p>}</div>
              <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose><Button type="submit" disabled={editAssignmentForm.formState.isSubmitting}>{editAssignmentForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Student Submit Assignment Dialog */}
      {isStudentRole && selectedAssignmentForSubmission && (
        <Dialog open={isSubmitAssignmentDialogOpen} onOpenChange={(isOpen) => { setIsSubmitAssignmentDialogOpen(isOpen); if (!isOpen) setSelectedAssignmentForSubmission(null); studentSubmitForm.reset(); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Kerjakan Tugas: {selectedAssignmentForSubmission.title}</DialogTitle>
              <DialogDescription>
                <p className="text-sm text-muted-foreground">Mata Pelajaran: {selectedAssignmentForSubmission.subjectName}</p>
                <p className="text-sm text-muted-foreground">Batas Waktu: {format(selectedAssignmentForSubmission.dueDate.toDate(), "dd MMMM yyyy, HH:mm", { locale: indonesiaLocale })}</p>
                {selectedAssignmentForSubmission.description && <p className="mt-2 whitespace-pre-line">{selectedAssignmentForSubmission.description}</p>}
                {selectedAssignmentForSubmission.fileURL && (
                    <Button variant="link" asChild className="p-0 h-auto mt-2">
                        <Link href={selectedAssignmentForSubmission.fileURL} target="_blank" rel="noopener noreferrer">
                            <DownloadCloud className="mr-2 h-4 w-4"/> Unduh File Tugas dari Guru
                        </Link>
                    </Button>
                )}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={studentSubmitForm.handleSubmit(handleStudentSubmitAssignment)} className="space-y-4 py-4">
              <div>
                <Label htmlFor="submissionLink">Link Google Drive Pengumpulan</Label>
                <Input id="submissionLink" {...studentSubmitForm.register("submissionLink")} className="mt-1" placeholder="https://drive.google.com/..." />
                {studentSubmitForm.formState.errors.submissionLink && <p className="text-sm text-destructive mt-1">{studentSubmitForm.formState.errors.submissionLink.message}</p>}
              </div>
              <div>
                <Label htmlFor="notes">Catatan (Opsional)</Label>
                <Textarea id="notes" {...studentSubmitForm.register("notes")} className="mt-1" placeholder="Tambahkan catatan untuk guru..." />
              </div>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                <Button type="submit" disabled={studentSubmitForm.formState.isSubmitting}>
                  {studentSubmitForm.formState.isSubmitting ? "Mengirim..." : (studentSubmissions.has(selectedAssignmentForSubmission.id) ? "Perbarui Pengumpulan" : "Kirim Tugas")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Teacher View Submissions Dialog */}
       {isTeacherOrAdminRole && selectedAssignmentToViewSubmissions && (
        <Dialog open={isViewSubmissionsDialogOpen} onOpenChange={(isOpen) => { setIsViewSubmissionsDialogOpen(isOpen); if (!isOpen) setSelectedAssignmentToViewSubmissions(null); }}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Pengumpulan Tugas: {selectedAssignmentToViewSubmissions.title}</DialogTitle>
                    <DialogDescription>Daftar siswa yang telah mengumpulkan tugas.</DialogDescription>
                </DialogHeader>
                <div className="py-4 max-h-[60vh] overflow-y-auto">
                    {isLoadingSubmissions ? (
                        <p>Memuat data pengumpulan...</p>
                    ) : submissionsForCurrentAssignment.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nama Siswa</TableHead>
                                    <TableHead>Link Pengumpulan</TableHead>
                                    <TableHead>Waktu Kirim</TableHead>
                                    <TableHead>Catatan</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {submissionsForCurrentAssignment.map(sub => (
                                    <TableRow key={sub.id}>
                                        <TableCell>{sub.studentName}</TableCell>
                                        <TableCell>
                                            <Button variant="link" asChild className="p-0 h-auto text-sm">
                                                <Link href={sub.submissionLink} target="_blank" rel="noopener noreferrer">Lihat File</Link>
                                            </Button>
                                        </TableCell>
                                        <TableCell>{format(sub.submittedAt.toDate(), "dd MMM yy, HH:mm", { locale: indonesiaLocale })}</TableCell>
                                        <TableCell className="text-xs max-w-xs truncate" title={sub.notes}>{sub.notes || "-"}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <p className="text-muted-foreground text-center py-8">Belum ada siswa yang mengumpulkan tugas ini.</p>
                    )}
                </div>
                 <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Tutup</Button></DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
       )}
    </div>
  );
}
