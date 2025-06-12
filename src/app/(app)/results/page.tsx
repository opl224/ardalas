
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
  AlertDialogTrigger, // Added missing import
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
import { BarChart3, PlusCircle, Edit, Trash2, CalendarIcon, AlertCircle, Loader2, Save } from "lucide-react";
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

// Minimal interfaces for dropdowns
interface ClassMin { id: string; name: string; }
interface StudentMin { id: string; name: string; classId: string; }
interface SubjectMin { id: string; name: string; }

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
  score: z.coerce.number().min(0, "Nilai minimal 0.").max(1000, "Nilai maksimal 1000."), // Allow up to 1000 for flexibility
  maxScore: z.coerce.number().min(1, "Nilai maks. minimal 1.").optional(),
  grade: z.string().max(5, "Grade maksimal 5 karakter.").optional(),
  dateOfAssessment: z.date({ required_error: "Tanggal asesmen harus diisi." }),
  feedback: z.string().optional(),
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
  const [students, setStudents] = useState<StudentMin[]>([]); // All students for initial load or specific class students
  const [filteredStudents, setFilteredStudents] = useState<StudentMin[]>([]);
  const [subjects, setSubjects] = useState<SubjectMin[]>([]);

  const [isLoadingData, setIsLoadingData] = useState(true); // Combined loading state for dropdowns
  const [isLoadingResults, setIsLoadingResults] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<ResultData | null>(null);

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
    },
  });

  const editResultForm = useForm<EditResultFormValues>({
    resolver: zodResolver(editResultFormSchema),
  });

  // Fetch data for dropdowns
  const fetchDropdownData = async () => {
    setIsLoadingData(true);
    try {
      const [classesSnapshot, studentsSnapshot, subjectsSnapshot] = await Promise.all([
        getDocs(query(collection(db, "classes"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "students"), orderBy("name", "asc"))), // Fetch all students initially
        getDocs(query(collection(db, "subjects"), orderBy("name", "asc"))),
      ]);
      setClasses(classesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
      setStudents(studentsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name, classId: doc.data().classId })));
      setSubjects(subjectsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    } catch (error) {
      console.error("Error fetching dropdown data: ", error);
      toast({ title: "Gagal Memuat Data Pendukung", variant: "destructive" });
    } finally {
      setIsLoadingData(false);
    }
  };

  // Fetch results
  const fetchResults = async () => {
    setIsLoadingResults(true);
    try {
      const resultsCollectionRef = collection(db, "results");
      // TODO: Add pagination or filtering for large datasets
      const q = query(resultsCollectionRef, orderBy("dateOfAssessment", "desc"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedResults = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        dateOfAssessment: (docSnap.data().dateOfAssessment as Timestamp).toDate(), // Convert to JS Date for display
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
    if (!role || !["admin", "guru"].includes(role)) {
        setIsLoadingData(false);
        setIsLoadingResults(false);
        return;
    }
    fetchDropdownData();
    fetchResults();
  }, [authLoading, role]);

  // Filter students when classId changes in the form
  const watchClassId = addResultForm.watch("classId");
  const editWatchClassId = editResultForm.watch("classId");

  useEffect(() => {
    if (watchClassId) {
      setFilteredStudents(students.filter(s => s.classId === watchClassId));
      addResultForm.setValue("studentId", undefined); // Reset student selection
    } else {
      setFilteredStudents([]);
    }
  }, [watchClassId, students, addResultForm]);
  
  useEffect(() => {
    if (editWatchClassId) {
      setFilteredStudents(students.filter(s => s.classId === editWatchClassId));
      // Do not reset studentId here as it's for edit form
    } else {
      setFilteredStudents([]);
    }
  }, [editWatchClassId, students, editResultForm]);


  // Populate edit form
  useEffect(() => {
    if (selectedResult && isEditDialogOpen) {
      setFilteredStudents(students.filter(s => s.classId === selectedResult.classId)); // Ensure students for the class are ready
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
        dateOfAssessment: selectedResult.dateOfAssessment instanceof Timestamp ? selectedResult.dateOfAssessment.toDate() : selectedResult.dateOfAssessment,
        feedback: selectedResult.feedback || "",
      });
    }
  }, [selectedResult, isEditDialogOpen, editResultForm, students]);

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

    try {
      await addDoc(collection(db, "results"), {
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
      });
      toast({ title: "Hasil Belajar Ditambahkan", description: "Data berhasil disimpan." });
      setIsAddDialogOpen(false);
      addResultForm.reset({ dateOfAssessment: new Date(), score: 0, maxScore: 100, assessmentTitle: "", feedback: "", grade: "" });
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

    try {
      const resultDocRef = doc(db, "results", data.id);
      await updateDoc(resultDocRef, {
        ...data,
        studentName,
        className,
        subjectName,
        dateOfAssessment: Timestamp.fromDate(startOfDay(data.dateOfAssessment)),
        maxScore: data.maxScore || 100,
        recordedById: user.uid,
        recordedByName: user.displayName || user.email,
        updatedAt: serverTimestamp(),
      });
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

  if (!role || !["admin", "guru"].includes(role)) {
    return (
         <div className="space-y-6">
            <h1 className="text-3xl font-bold font-headline">Manajemen Hasil Belajar</h1>
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

  const currentForm = isEditDialogOpen ? editResultForm : addResultForm;
  const currentClassId = isEditDialogOpen ? editWatchClassId : watchClassId;


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Hasil Belajar</h1>
        <p className="text-muted-foreground">Catat, lihat, dan kelola nilai serta rapor siswa.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <BarChart3 className="h-6 w-6 text-primary" />
            <span>Daftar Hasil Belajar</span>
          </CardTitle>
          <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
            setIsAddDialogOpen(isOpen);
            if (!isOpen) { addResultForm.reset({ dateOfAssessment: new Date(), score: 0, maxScore: 100, assessmentTitle: "", feedback: "", grade: "" }); addResultForm.clearErrors(); setFilteredStudents([]); }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => {if(classes.length === 0) fetchDropdownData();}}>
                <PlusCircle className="mr-2 h-4 w-4" /> Tambah Hasil
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Tambah Hasil Belajar Baru</DialogTitle>
                <DialogDescription>Isi detail nilai siswa.</DialogDescription>
              </DialogHeader>
              <form onSubmit={addResultForm.handleSubmit(handleAddResultSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                {/* Form Fields */}
                <div>
                  <Label htmlFor="add-result-classId">Kelas</Label>
                  <Select onValueChange={(value) => {addResultForm.setValue("classId", value, { shouldValidate: true }); addResultForm.setValue("studentId", undefined);}} defaultValue={addResultForm.getValues("classId")}>
                    <SelectTrigger id="add-result-classId" className="mt-1"><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                    <SelectContent>
                      {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {addResultForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{addResultForm.formState.errors.classId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="add-result-studentId">Siswa</Label>
                  <Select onValueChange={(value) => addResultForm.setValue("studentId", value, { shouldValidate: true })} value={addResultForm.getValues("studentId")} disabled={!watchClassId || filteredStudents.length === 0}>
                    <SelectTrigger id="add-result-studentId" className="mt-1"><SelectValue placeholder={!watchClassId ? "Pilih kelas dulu" : (filteredStudents.length === 0 ? "Tidak ada siswa di kelas ini" : "Pilih siswa")} /></SelectTrigger>
                    <SelectContent>
                      {filteredStudents.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {addResultForm.formState.errors.studentId && <p className="text-sm text-destructive mt-1">{addResultForm.formState.errors.studentId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="add-result-subjectId">Mata Pelajaran</Label>
                  <Select onValueChange={(value) => addResultForm.setValue("subjectId", value, { shouldValidate: true })} defaultValue={addResultForm.getValues("subjectId")}>
                    <SelectTrigger id="add-result-subjectId" className="mt-1"><SelectValue placeholder="Pilih mata pelajaran" /></SelectTrigger>
                    <SelectContent>
                      {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {addResultForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{addResultForm.formState.errors.subjectId.message}</p>}
                </div>
                 <div>
                  <Label htmlFor="add-result-assessmentType">Tipe Asesmen</Label>
                  <Select onValueChange={(value) => addResultForm.setValue("assessmentType", value as AssessmentType, { shouldValidate: true })} defaultValue={addResultForm.getValues("assessmentType")}>
                    <SelectTrigger id="add-result-assessmentType" className="mt-1"><SelectValue placeholder="Pilih tipe asesmen" /></SelectTrigger>
                    <SelectContent>
                      {ASSESSMENT_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {addResultForm.formState.errors.assessmentType && <p className="text-sm text-destructive mt-1">{addResultForm.formState.errors.assessmentType.message}</p>}
                </div>
                <div>
                  <Label htmlFor="add-result-assessmentTitle">Judul/Nama Asesmen</Label>
                  <Input id="add-result-assessmentTitle" {...addResultForm.register("assessmentTitle")} className="mt-1" />
                  {addResultForm.formState.errors.assessmentTitle && <p className="text-sm text-destructive mt-1">{addResultForm.formState.errors.assessmentTitle.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="add-result-score">Nilai</Label>
                        <Input id="add-result-score" type="number" {...addResultForm.register("score")} className="mt-1" />
                        {addResultForm.formState.errors.score && <p className="text-sm text-destructive mt-1">{addResultForm.formState.errors.score.message}</p>}
                    </div>
                    <div>
                        <Label htmlFor="add-result-maxScore">Nilai Maks. (Opsional)</Label>
                        <Input id="add-result-maxScore" type="number" {...addResultForm.register("maxScore")} className="mt-1" placeholder="100"/>
                        {addResultForm.formState.errors.maxScore && <p className="text-sm text-destructive mt-1">{addResultForm.formState.errors.maxScore.message}</p>}
                    </div>
                </div>
                <div>
                  <Label htmlFor="add-result-grade">Grade (Opsional)</Label>
                  <Input id="add-result-grade" {...addResultForm.register("grade")} className="mt-1" placeholder="A, B+, C, dll." />
                   {addResultForm.formState.errors.grade && <p className="text-sm text-destructive mt-1">{addResultForm.formState.errors.grade.message}</p>}
                </div>
                <div>
                  <Label htmlFor="add-result-dateOfAssessment">Tanggal Asesmen</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant={"outline"} className="w-full justify-start text-left font-normal mt-1">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {addResultForm.watch("dateOfAssessment") ? format(addResultForm.watch("dateOfAssessment"), "PPP", { locale: indonesiaLocale }) : <span>Pilih tanggal</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={addResultForm.watch("dateOfAssessment")} onSelect={(date) => addResultForm.setValue("dateOfAssessment", date || new Date(), { shouldValidate: true })} initialFocus /></PopoverContent>
                  </Popover>
                  {addResultForm.formState.errors.dateOfAssessment && <p className="text-sm text-destructive mt-1">{addResultForm.formState.errors.dateOfAssessment.message}</p>}
                </div>
                <div>
                  <Label htmlFor="add-result-feedback">Umpan Balik (Opsional)</Label>
                  <Textarea id="add-result-feedback" {...addResultForm.register("feedback")} className="mt-1" />
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                  <Button type="submit" disabled={addResultForm.formState.isSubmitting}>{addResultForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Hasil"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoadingResults ? (
            <div className="space-y-2 mt-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : results.length > 0 ? (
            <div className="overflow-x-auto mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Siswa</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead>Mapel</TableHead>
                    <TableHead>Asesmen</TableHead>
                    <TableHead>Nilai</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result) => (
                    <TableRow key={result.id}>
                      <TableCell className="font-medium">{result.studentName}</TableCell>
                      <TableCell>{result.className}</TableCell>
                      <TableCell>{result.subjectName}</TableCell>
                      <TableCell>{result.assessmentTitle} ({result.assessmentType})</TableCell>
                      <TableCell>{result.score}{result.maxScore && result.maxScore !== 100 ? `/${result.maxScore}` : ''} {result.grade && `(${result.grade})`}</TableCell>
                      <TableCell>{result.dateOfAssessment instanceof Timestamp ? format(result.dateOfAssessment.toDate(), "dd MMM yyyy", { locale: indonesiaLocale }) : format(new Date(result.dateOfAssessment), "dd MMM yyyy", { locale: indonesiaLocale })}</TableCell>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
              Belum ada data hasil belajar yang ditambahkan.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
        setIsEditDialogOpen(isOpen);
        if (!isOpen) { setSelectedResult(null); editResultForm.clearErrors(); setFilteredStudents([]);}
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Hasil Belajar</DialogTitle>
            <DialogDescription>Perbarui detail nilai siswa.</DialogDescription>
          </DialogHeader>
          {selectedResult && (
            <form onSubmit={editResultForm.handleSubmit(handleEditResultSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <Input type="hidden" {...editResultForm.register("id")} />
              {/* Form Fields for Edit */}
                <div>
                  <Label htmlFor="edit-result-classId">Kelas</Label>
                  <Select onValueChange={(value) => {editResultForm.setValue("classId", value, { shouldValidate: true }); editResultForm.setValue("studentId", undefined);}} defaultValue={editResultForm.getValues("classId")}>
                    <SelectTrigger id="edit-result-classId" className="mt-1"><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                    <SelectContent>
                      {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {editResultForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{editResultForm.formState.errors.classId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="edit-result-studentId">Siswa</Label>
                  <Select onValueChange={(value) => editResultForm.setValue("studentId", value, { shouldValidate: true })} value={editResultForm.getValues("studentId")} disabled={!editWatchClassId || filteredStudents.length === 0}>
                    <SelectTrigger id="edit-result-studentId" className="mt-1"><SelectValue placeholder={!editWatchClassId ? "Pilih kelas dulu" : (filteredStudents.length === 0 ? "Tidak ada siswa di kelas ini" : "Pilih siswa")} /></SelectTrigger>
                    <SelectContent>
                      {filteredStudents.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {editResultForm.formState.errors.studentId && <p className="text-sm text-destructive mt-1">{editResultForm.formState.errors.studentId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="edit-result-subjectId">Mata Pelajaran</Label>
                  <Select onValueChange={(value) => editResultForm.setValue("subjectId", value, { shouldValidate: true })} defaultValue={editResultForm.getValues("subjectId")}>
                    <SelectTrigger id="edit-result-subjectId" className="mt-1"><SelectValue placeholder="Pilih mata pelajaran" /></SelectTrigger>
                    <SelectContent>
                      {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {editResultForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{editResultForm.formState.errors.subjectId.message}</p>}
                </div>
                 <div>
                  <Label htmlFor="edit-result-assessmentType">Tipe Asesmen</Label>
                  <Select onValueChange={(value) => editResultForm.setValue("assessmentType", value as AssessmentType, { shouldValidate: true })} defaultValue={editResultForm.getValues("assessmentType")}>
                    <SelectTrigger id="edit-result-assessmentType" className="mt-1"><SelectValue placeholder="Pilih tipe asesmen" /></SelectTrigger>
                    <SelectContent>
                      {ASSESSMENT_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {editResultForm.formState.errors.assessmentType && <p className="text-sm text-destructive mt-1">{editResultForm.formState.errors.assessmentType.message}</p>}
                </div>
                <div>
                  <Label htmlFor="edit-result-assessmentTitle">Judul/Nama Asesmen</Label>
                  <Input id="edit-result-assessmentTitle" {...editResultForm.register("assessmentTitle")} className="mt-1" />
                  {editResultForm.formState.errors.assessmentTitle && <p className="text-sm text-destructive mt-1">{editResultForm.formState.errors.assessmentTitle.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="edit-result-score">Nilai</Label>
                        <Input id="edit-result-score" type="number" {...editResultForm.register("score")} className="mt-1" />
                        {editResultForm.formState.errors.score && <p className="text-sm text-destructive mt-1">{editResultForm.formState.errors.score.message}</p>}
                    </div>
                    <div>
                        <Label htmlFor="edit-result-maxScore">Nilai Maks. (Opsional)</Label>
                        <Input id="edit-result-maxScore" type="number" {...editResultForm.register("maxScore")} className="mt-1" placeholder="100"/>
                        {editResultForm.formState.errors.maxScore && <p className="text-sm text-destructive mt-1">{editResultForm.formState.errors.maxScore.message}</p>}
                    </div>
                </div>
                <div>
                  <Label htmlFor="edit-result-grade">Grade (Opsional)</Label>
                  <Input id="edit-result-grade" {...editResultForm.register("grade")} className="mt-1" placeholder="A, B+, C, dll." />
                   {editResultForm.formState.errors.grade && <p className="text-sm text-destructive mt-1">{editResultForm.formState.errors.grade.message}</p>}
                </div>
                <div>
                  <Label htmlFor="edit-result-dateOfAssessment">Tanggal Asesmen</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant={"outline"} className="w-full justify-start text-left font-normal mt-1">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editResultForm.watch("dateOfAssessment") ? format(editResultForm.watch("dateOfAssessment"), "PPP", { locale: indonesiaLocale }) : <span>Pilih tanggal</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={editResultForm.watch("dateOfAssessment")} onSelect={(date) => editResultForm.setValue("dateOfAssessment", date || new Date(), { shouldValidate: true })} initialFocus /></PopoverContent>
                  </Popover>
                  {editResultForm.formState.errors.dateOfAssessment && <p className="text-sm text-destructive mt-1">{editResultForm.formState.errors.dateOfAssessment.message}</p>}
                </div>
                <div>
                  <Label htmlFor="edit-result-feedback">Umpan Balik (Opsional)</Label>
                  <Textarea id="edit-result-feedback" {...editResultForm.register("feedback")} className="mt-1" />
                </div>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                <Button type="submit" disabled={editResultForm.formState.isSubmitting}>{editResultForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

    

    

    