
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
import { BarChart3, PlusCircle, Edit, Trash2, CalendarIcon, AlertCircle, Loader2, Save, Filter } from "lucide-react";
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
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { Form } from "@/components/ui/form"; 


// Minimal interfaces for dropdowns
interface ClassMin { id: string; name: string; }
interface StudentMin { id: string; name: string; classId: string; }
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
  maxScore?: number;
  grade?: string;
  dateOfAssessment: Timestamp; 
  feedback?: string;
  assignmentId?: string; 
  meetingNumber?: number; 
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  recordedById?: string;
  recordedByName?: string;
}

const baseResultFormSchema = z.object({
  classId: z.string({ required_error: "Pilih kelas." }),
  studentId: z.string({ required_error: "Pilih siswa." }),
  subjectId: z.string({ required_error: "Pilih mata pelajaran." }),
  assessmentType: z.enum(ASSESSMENT_TYPES, { required_error: "Pilih tipe asesmen." }),
  assessmentTitle: z.string().min(3, { message: "Judul asesmen minimal 3 karakter." }),
  score: z.coerce.number().min(0, "Nilai minimal 0.").max(1000, "Nilai maksimal 1000."), 
  maxScore: z.coerce.number().min(1, "Nilai maks. minimal 1.").optional(),
  grade: z.string().max(5, "Grade maksimal 5 karakter.").optional(),
  dateOfAssessment: z.date({ required_error: "Tanggal asesmen harus diisi." }),
  feedback: z.string().optional(),
  assignmentId: z.string().optional(),
  meetingNumber: z.coerce.number().positive("Pertemuan harus angka positif.").optional(),
});

const resultValidationRefinement = (data: { score: number; maxScore?: number | undefined }) => !data.maxScore || data.score <= data.maxScore;

const resultFormSchema = baseResultFormSchema.refine(resultValidationRefinement, {
  message: "Nilai tidak boleh melebihi nilai maksimal.",
  path: ["score"],
});
type ResultFormValues = z.infer<typeof resultFormSchema>;

const editResultFormSchema = baseResultFormSchema.extend({ id: z.string() }).refine(resultValidationRefinement, {
  message: "Nilai tidak boleh melebihi nilai maksimal.",
  path: ["score"],
});
type EditResultFormValues = z.infer<typeof editResultFormSchema>;


export default function ResultsPage() {
  const { user, role, loading: authLoading } = useAuth();
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
  const [selectedAssessmentTypeFilter, setSelectedAssessmentTypeFilter] = useState<AssessmentType | "all">("all");


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
      maxScore: 100,
      grade: "",
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
      const [classesSnapshot, studentsSnapshot, subjectsSnapshot, assignmentsSnapshot] = await Promise.all([
        getDocs(query(collection(db, "classes"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "students"), orderBy("name", "asc"))), 
        getDocs(query(collection(db, "subjects"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "assignments"), orderBy("title", "asc"))), 
      ]);
      setClasses(classesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
      setStudents(studentsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name, classId: doc.data().classId })));
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
    if (!user && !authLoading) {
        setIsLoadingResults(false);
        setResults([]);
        return;
    }
    setIsLoadingResults(true);
    try {
      const resultsCollectionRef = collection(db, "results");
      let q;

      if (role === 'siswa' && user?.uid) {
        q = query(resultsCollectionRef, where("studentId", "==", user.uid), orderBy("dateOfAssessment", "desc"));
      } else if (role === 'orangtua' && user?.linkedStudentId) {
        q = query(resultsCollectionRef, where("studentId", "==", user.linkedStudentId), orderBy("dateOfAssessment", "desc"));
      } else if (role === 'admin' || role === 'guru') {
        q = query(resultsCollectionRef, orderBy("dateOfAssessment", "desc"), orderBy("createdAt", "desc"));
      } else {
        setResults([]);
        setIsLoadingResults(false);
        return;
      }
      
      const querySnapshot = await getDocs(q);
      const fetchedResults = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as ResultData[];
      setResults(fetchedResults);
    } catch (error) {
      console.error("Error fetching results: ", error);
      toast({ title: "Gagal Memuat Hasil Belajar", variant: "destructive" });
    } finally {
      setIsLoadingResults(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    fetchDropdownData(); 
    fetchResults();
  }, [authLoading, user?.uid, user?.linkedStudentId, role]);


  const watchClassId = addResultForm.watch("classId");
  const watchSubjectId = addResultForm.watch("subjectId");
  const watchAssignmentId = addResultForm.watch("assignmentId");

  const editWatchClassId = editResultForm.watch("classId");
  const editWatchSubjectId = editResultForm.watch("subjectId");
  const editWatchAssignmentId = editResultForm.watch("assignmentId");


  useEffect(() => {
    if (watchClassId) {
      setFilteredStudents(students.filter(s => s.classId === watchClassId));
      addResultForm.setValue("studentId", undefined); 
    } else {
      setFilteredStudents([]);
    }
    
    if (watchClassId && watchSubjectId) {
      setFilteredAssignments(assignments.filter(a => a.classId === watchClassId && a.subjectId === watchSubjectId));
    } else {
      setFilteredAssignments([]);
    }
    addResultForm.setValue("assignmentId", undefined);
  }, [watchClassId, watchSubjectId, students, assignments, addResultForm]);

  useEffect(() => {
     const selectedAssignment = assignments.find(a => a.id === watchAssignmentId);
     if (selectedAssignment) {
         addResultForm.setValue("assessmentTitle", selectedAssignment.title);
         if (selectedAssignment.meetingNumber) {
             addResultForm.setValue("meetingNumber", selectedAssignment.meetingNumber);
         } else {
             addResultForm.setValue("meetingNumber", undefined);
         }
     } else if (watchAssignmentId === "" || watchAssignmentId === undefined) { 
         addResultForm.setValue("assessmentTitle", ""); 
         addResultForm.setValue("meetingNumber", undefined);
     }
  }, [watchAssignmentId, assignments, addResultForm]);
  
  useEffect(() => {
    if (editWatchClassId) {
      setFilteredStudents(students.filter(s => s.classId === editWatchClassId));
    } else if (role === "admin" || role === "guru") { 
      setFilteredStudents(students); 
    } else {
        setFilteredStudents([]);
    }

    if (editWatchClassId && editWatchSubjectId) {
        setFilteredAssignments(assignments.filter(a => a.classId === editWatchClassId && a.subjectId === editWatchSubjectId));
    } else {
        setFilteredAssignments([]);
    }
    
  }, [editWatchClassId, editWatchSubjectId, students, assignments, editResultForm, role]);

   useEffect(() => {
     const selectedAssignment = assignments.find(a => a.id === editWatchAssignmentId);
     if (selectedAssignment) {
         editResultForm.setValue("assessmentTitle", selectedAssignment.title);
          if (selectedAssignment.meetingNumber) {
             editResultForm.setValue("meetingNumber", selectedAssignment.meetingNumber);
         } else {
             editResultForm.setValue("meetingNumber", undefined);
         }
     } else if (editWatchAssignmentId === "" || editWatchAssignmentId === undefined) {
        
     }
  }, [editWatchAssignmentId, assignments, editResultForm]);


  useEffect(() => {
    if (selectedResult && isEditDialogOpen) {
      
      setFilteredStudents(students.filter(s => s.classId === selectedResult.classId)); 
      
      if (selectedResult.classId && selectedResult.subjectId) {
        setFilteredAssignments(assignments.filter(a => a.classId === selectedResult.classId && a.subjectId === selectedResult.subjectId));
      }

      editResultForm.reset({
        id: selectedResult.id,
        classId: selectedResult.classId,
        studentId: selectedResult.studentId,
        subjectId: selectedResult.subjectId,
        assessmentType: selectedResult.assessmentType,
        assessmentTitle: selectedResult.assessmentTitle,
        score: selectedResult.score,
        maxScore: selectedResult.maxScore || 100,
        grade: selectedResult.grade || "",
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
      className: aClass?.name,
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
      toast({ title: "Data Tidak Lengkap", description: "Pastikan siswa, kelas, dan subjek valid.", variant: "destructive" });
      return;
    }

    const resultData: any = {
        ...data,
        studentName,
        className,
        subjectName,
        dateOfAssessment: Timestamp.fromDate(startOfDay(data.dateOfAssessment)),
        maxScore: data.maxScore || 100,
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
      addResultForm.reset({ dateOfAssessment: new Date(), score: 0, maxScore: 100, assessmentTitle: "", feedback: "", grade: "", meetingNumber: undefined, assignmentId: undefined });
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
      toast({ title: "Data Tidak Lengkap", description: "Pastikan siswa, kelas, dan subjek valid.", variant: "destructive" });
      return;
    }
    
    const resultData: any = {
        ...data,
        studentName,
        className,
        subjectName,
        dateOfAssessment: Timestamp.fromDate(startOfDay(data.dateOfAssessment)),
        maxScore: data.maxScore || 100,
        recordedById: user.uid, 
        recordedByName: user.displayName || user.email,
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
  
  const openEditDialog = (result: ResultData) => {
    setSelectedResult(result);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (result: ResultData) => {
    setSelectedResult(result);
  };

  const canManageResults = role === "admin" || role === "guru";

  const filteredResults = useMemo(() => {
    if (selectedAssessmentTypeFilter === "all") {
      return results;
    }
    return results.filter(result => result.assessmentType === selectedAssessmentTypeFilter);
  }, [results, selectedAssessmentTypeFilter]);


  if (authLoading || isLoadingData) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Manajemen Hasil Belajar</h1>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 mr-2 animate-spin text-primary" />
              Memuat data...
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
        ? (watchClassId ? students.filter(s => s.classId === watchClassId) : [])
        : (editWatchClassId ? students.filter(s => s.classId === editWatchClassId) : (role === 'admin' || role === 'guru' ? students : []));
    
    
    const assignmentsForDropdown = (currentClassId && currentSubjectId)
        ? assignments.filter(a => a.classId === currentClassId && a.subjectId === currentSubjectId)
        : [];

    return (
        <>
            <div>
                <Label htmlFor={`${dialogType}-result-classId`}>Kelas</Label>
                <Select onValueChange={(value) => {formInstance.setValue("classId", value, { shouldValidate: true }); formInstance.setValue("studentId", undefined); formInstance.setValue("assignmentId", undefined);}} value={currentClassId || undefined}>
                    <SelectTrigger id={`${dialogType}-result-classId`} className="mt-1"><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                    <SelectContent>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                {formInstance.formState.errors.classId && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.classId.message}</p>}
            </div>
            <div>
                <Label htmlFor={`${dialogType}-result-studentId`}>Siswa</Label>
                <Select onValueChange={(value) => formInstance.setValue("studentId", value, { shouldValidate: true })} value={formInstance.getValues("studentId") || undefined} disabled={!currentClassId || studentsForDropdown.length === 0}>
                    <SelectTrigger id={`${dialogType}-result-studentId`} className="mt-1"><SelectValue placeholder={!currentClassId ? "Pilih kelas dulu" : (studentsForDropdown.length === 0 ? "Tidak ada siswa di kelas ini" : "Pilih siswa")} /></SelectTrigger>
                    <SelectContent>
                    {studentsForDropdown.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                {formInstance.formState.errors.studentId && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.studentId.message}</p>}
            </div>
            <div>
                <Label htmlFor={`${dialogType}-result-subjectId`}>Mata Pelajaran</Label>
                <Select onValueChange={(value) => {formInstance.setValue("subjectId", value, { shouldValidate: true }); formInstance.setValue("assignmentId", undefined);}} value={currentSubjectId || undefined}>
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
                            if (dialogType === 'add' || !formInstance.getValues("assessmentTitle")) { 
                                formInstance.setValue("assessmentTitle", "", {shouldValidate: true});
                            }
                             if (dialogType === 'add' || !formInstance.getValues("meetingNumber")) {
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
                <Select onValueChange={(value) => formInstance.setValue("assessmentType", value as AssessmentType, { shouldValidate: true })} value={formInstance.getValues("assessmentType")}>
                    <SelectTrigger id={`${dialogType}-result-assessmentType`} className="mt-1"><SelectValue placeholder="Pilih tipe asesmen" /></SelectTrigger>
                    <SelectContent>
                    {ASSESSMENT_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                    </SelectContent>
                </Select>
                {formInstance.formState.errors.assessmentType && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.assessmentType.message}</p>}
            </div>
           
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label htmlFor={`${dialogType}-result-score`}>Nilai</Label>
                    <Input id={`${dialogType}-result-score`} type="number" {...formInstance.register("score")} className="mt-1" />
                    {formInstance.formState.errors.score && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.score.message}</p>}
                </div>
                <div>
                    <Label htmlFor={`${dialogType}-result-maxScore`}>Nilai Maks. (Default: 100)</Label>
                    <Input id={`${dialogType}-result-maxScore`} type="number" {...formInstance.register("maxScore")} className="mt-1" placeholder="100"/>
                    {formInstance.formState.errors.maxScore && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.maxScore.message}</p>}
                </div>
            </div>
            <div>
                <Label htmlFor={`${dialogType}-result-grade`}>Grade (Opsional)</Label>
                <Input id={`${dialogType}-result-grade`} {...formInstance.register("grade")} className="mt-1" placeholder="A, B+, C, dll." />
                {formInstance.formState.errors.grade && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.grade.message}</p>}
            </div>
            <div>
                <Label htmlFor={`${dialogType}-result-dateOfAssessment`}>Tanggal Asesmen</Label>
                <Popover>
                    <PopoverTrigger asChild>
                    <Button variant={"outline"} className="w-full justify-start text-left font-normal mt-1">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formInstance.watch("dateOfAssessment") ? format(formInstance.watch("dateOfAssessment"), "PPP", { locale: indonesiaLocale }) : <span>Pilih tanggal</span>}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={formInstance.watch("dateOfAssessment")} onSelect={(date) => formInstance.setValue("dateOfAssessment", date || new Date(), { shouldValidate: true })} initialFocus /></PopoverContent>
                </Popover>
                {formInstance.formState.errors.dateOfAssessment && <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.dateOfAssessment.message}</p>}
            </div>
            <div>
                <Label htmlFor={`${dialogType}-result-feedback`}>Umpan Balik (Opsional)</Label>
                <Textarea id={`${dialogType}-result-feedback`} {...formInstance.register("feedback")} className="mt-1" />
            </div>
        </>
    );
  };


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">{pageTitle}</h1>
        <p className="text-muted-foreground">{pageDescription}</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-col md:flex-row items-center justify-between space-y-2 md:space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2 text-xl">
            <BarChart3 className="h-6 w-6 text-primary" />
            <span>Daftar Hasil Belajar</span>
          </CardTitle>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Select
              value={selectedAssessmentTypeFilter}
              onValueChange={(value) => setSelectedAssessmentTypeFilter(value as AssessmentType | "all")}
            >
              <SelectTrigger className="w-full md:w-[200px]">
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
            {canManageResults && (
              <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
                  setIsAddDialogOpen(isOpen);
                  if (!isOpen) { addResultForm.reset({ classId: undefined, studentId: undefined, subjectId: undefined, assessmentType: undefined, dateOfAssessment: new Date(), score: 0, maxScore: 100, assessmentTitle: "", feedback: "", grade: "", meetingNumber: undefined, assignmentId: undefined }); addResultForm.clearErrors(); setFilteredStudents([]); setFilteredAssignments([]);}
              }}>
                  <DialogTrigger asChild>
                  <Button size="sm" onClick={() => {if(classes.length === 0 && students.length === 0 && subjects.length === 0 && (role === 'admin' || role === 'guru')) fetchDropdownData();}}>
                      <PlusCircle className="mr-2 h-4 w-4" /> Tambah Hasil
                  </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh]">
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
                        <DialogFooter className="pt-4 border-t">
                        <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                        <Button type="submit" disabled={addResultForm.formState.isSubmitting}>{addResultForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Hasil"}</Button>
                        </DialogFooter>
                    </form>
                  </Form>
                  </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingResults ? (
            <div className="space-y-2 mt-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : filteredResults.length > 0 ? (
            <div className="overflow-x-auto mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    {canManageResults && <TableHead>Siswa</TableHead>}
                    {canManageResults && <TableHead>Kelas</TableHead>}
                    <TableHead>Mapel</TableHead>
                    <TableHead>Asesmen</TableHead>
                    <TableHead>Nilai</TableHead>
                    <TableHead>Tanggal</TableHead>
                    {canManageResults && <TableHead className="text-right">Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredResults.map((result) => (
                    <TableRow key={result.id}>
                      {canManageResults && <TableCell className="font-medium">{result.studentName}</TableCell>}
                      {canManageResults && <TableCell>{result.className}</TableCell>}
                      <TableCell>{result.subjectName}</TableCell>
                      <TableCell>
                        {result.assessmentTitle} ({result.assessmentType})
                        {result.meetingNumber && <span className="text-xs text-muted-foreground ml-1">(P{result.meetingNumber})</span>}
                      </TableCell>
                      <TableCell>{result.score}{result.maxScore && result.maxScore !== 100 ? `/${result.maxScore}` : ''} {result.grade && `(${result.grade})`}</TableCell>
                      <TableCell>{format(result.dateOfAssessment.toDate(), "dd MMM yyyy", { locale: indonesiaLocale })}</TableCell>
                      {canManageResults && (
                        <TableCell className="text-right space-x-2">
                            <Button variant="outline" size="icon" onClick={() => openEditDialog(result)} aria-label={`Edit hasil ${result.studentName}`}>
                            <Edit className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="icon" onClick={() => openDeleteDialog(result)} aria-label={`Hapus hasil ${result.studentName}`}>
                                <Trash2 className="h-4 w-4" />
                                </Button>
                            </AlertDialogTrigger>
                            {selectedResult && selectedResult.id === result.id && (
                                <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                    Tindakan ini akan menghapus hasil belajar <span className="font-semibold">{selectedResult?.assessmentTitle}</span> untuk siswa <span className="font-semibold">{selectedResult?.studentName}</span>.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel onClick={() => setSelectedResult(null)}>Batal</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteResult(selectedResult.id)}>Ya, Hapus Hasil</AlertDialogAction>
                                </AlertDialogFooter>
                                </AlertDialogContent>
                            )}
                            </AlertDialog>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
                {role === 'orangtua' && !user?.linkedStudentId ? "Akun Anda belum terhubung ke data siswa. Hubungi administrator." : 
                 role === 'siswa' && !user?.uid ? "Tidak dapat memuat data siswa. Silakan coba lagi." :
                 selectedAssessmentTypeFilter !== "all" ? `Tidak ada hasil belajar untuk tipe asesmen "${selectedAssessmentTypeFilter}". Coba filter lain.` :
                 "Belum ada data hasil belajar yang sesuai."}
            </div>
          )}
        </CardContent>
      </Card>

      
      {canManageResults && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
            setIsEditDialogOpen(isOpen);
            if (!isOpen) { setSelectedResult(null); editResultForm.clearErrors(); setFilteredStudents([]); setFilteredAssignments([]);}
        }}>
            <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh]">
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
                <DialogFooter className="pt-4 border-t">
                    <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                    <Button type="submit" disabled={editResultForm.formState.isSubmitting}>{editResultForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}</Button>
                </DialogFooter>
                </form>
                </Form>
            )}
            </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

