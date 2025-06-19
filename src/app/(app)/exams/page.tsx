
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
import { FileText, PlusCircle, Edit, Trash2, CalendarIcon, MoreVertical, Search, Filter as FilterIcon } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
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
  writeBatch
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
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
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";


// Minimal interfaces for dropdowns
interface SubjectMin { id: string; name: string; }
interface ClassMin { id: string; name: string; }

interface ExamData {
  id: string;
  title: string;
  subjectId: string;
  subjectName?: string; // Denormalized
  classId: string;
  className?: string; // Denormalized
  date: Timestamp; // Firestore Timestamp for date
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  description?: string;
  createdAt?: Timestamp;
}

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM format

const baseExamObjectSchema = z.object({
  title: z.string().min(3, { message: "Judul ujian minimal 3 karakter." }),
  subjectId: z.string({ required_error: "Pilih mata pelajaran." }),
  classId: z.string({ required_error: "Pilih kelas." }),
  date: z.date({ required_error: "Tanggal ujian harus diisi." }),
  startTime: z.string().regex(timeRegex, { message: "Format waktu mulai JJ:MM (e.g., 07:00)." }),
  endTime: z.string().regex(timeRegex, { message: "Format waktu selesai JJ:MM (e.g., 08:30)." }),
  description: z.string().optional(),
});

const examTimeRefinement = (data: { startTime: string; endTime: string; }) => {
  const [startH, startM] = data.startTime.split(':').map(Number);
  const [endH, endM] = data.endTime.split(':').map(Number);
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return false;
  if (endH < startH || (endH === startH && endM <= startM)) {
      return false;
  }
  return true;
};

const examFormSchema = baseExamObjectSchema.refine(examTimeRefinement, {
    message: "Waktu selesai harus setelah waktu mulai.",
    path: ["endTime"],
});
type ExamFormValues = z.infer<typeof examFormSchema>;

const editExamFormSchema = baseExamObjectSchema.extend({
  id: z.string(),
}).refine(examTimeRefinement, {
  message: "Waktu selesai harus setelah waktu mulai.",
  path: ["endTime"],
});
type EditExamFormValues = z.infer<typeof editExamFormSchema>;

const ITEMS_PER_PAGE = 10;

export default function ExamsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const [exams, setExams] = useState<ExamData[]>([]);
  const [subjects, setSubjects] = useState<SubjectMin[]>([]);
  const [classes, setClasses] = useState<ClassMin[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<ExamData | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const { toast } = useToast();
  const { isMobile } = useSidebar();


  const addExamForm = useForm<ExamFormValues>({
    resolver: zodResolver(examFormSchema),
    defaultValues: {
      title: "",
      subjectId: undefined,
      classId: undefined,
      date: new Date(),
      startTime: "",
      endTime: "",
      description: "",
    },
  });

  const editExamForm = useForm<EditExamFormValues>({
    resolver: zodResolver(editExamFormSchema),
  });

  const fetchDropdownData = async () => {
    try {
      const [subjectsSnapshot, classesSnapshot] = await Promise.all([
        getDocs(query(collection(db, "subjects"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "classes"), orderBy("name", "asc"))),
      ]);
      setSubjects(subjectsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
      setClasses(classesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    } catch (error) {
      console.error("Error fetching dropdown data: ", error);
      toast({ title: "Gagal Memuat Data Pendukung", description: "Terjadi kesalahan saat memuat data subjek atau kelas.", variant: "destructive" });
    }
  };

  const fetchExams = async () => {
    setIsLoading(true);
    try {
      if (role === "admin" || role === "guru") { // Fetch dropdowns only if needed for forms/filters
        await fetchDropdownData();
      }
      const examsCollectionRef = collection(db, "exams");
      let q = query(examsCollectionRef, orderBy("date", "desc"), orderBy("startTime", "asc"));

      if (role === "siswa" && user?.classId) {
          q = query(examsCollectionRef, where("classId", "==", user.classId), orderBy("date", "desc"), orderBy("startTime", "asc"));
      } else if (role === "orangtua" && user?.linkedStudentClassId) {
          q = query(examsCollectionRef, where("classId", "==", user.linkedStudentClassId), orderBy("date", "desc"), orderBy("startTime", "asc"));
      } else if (role === 'orangtua' && !user?.linkedStudentClassId) {
          setExams([]);
          setIsLoading(false);
          return;
      }


      const querySnapshot = await getDocs(q);

      const fetchedExams: ExamData[] = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title,
          subjectId: data.subjectId,
          subjectName: data.subjectName,
          classId: data.classId,
          className: data.className,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
          description: data.description,
          createdAt: data.createdAt,
        };
      });
      setExams(fetchedExams);
    } catch (error) {
      console.error("Error fetching exams: ", error);
      toast({ title: "Gagal Memuat Jadwal Ujian", description: "Terjadi kesalahan.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) { // Ensure auth state is resolved before fetching
        fetchExams();
    }
  }, [authLoading, user, role]); // Re-fetch if user or role changes

  useEffect(() => {
    if (selectedExam && isEditDialogOpen) {
      editExamForm.reset({
        id: selectedExam.id,
        title: selectedExam.title,
        subjectId: selectedExam.subjectId,
        classId: selectedExam.classId,
        date: selectedExam.date.toDate(),
        startTime: selectedExam.startTime,
        endTime: selectedExam.endTime,
        description: selectedExam.description || "",
      });
    }
  }, [selectedExam, isEditDialogOpen, editExamForm]);

  const getDenormalizedNames = (data: ExamFormValues | EditExamFormValues) => {
    const subject = subjects.find(s => s.id === data.subjectId);
    const aClass = classes.find(c => c.id === data.classId);
    return {
      subjectName: subject?.name,
      className: aClass?.name,
    };
  };

  const handleAddExamSubmit: SubmitHandler<ExamFormValues> = async (data) => {
    addExamForm.clearErrors();
    const { subjectName, className } = getDenormalizedNames(data);

    if (!subjectName || !className) {
      toast({title: "Data Tidak Lengkap", description: "Pastikan subjek dan kelas valid.", variant: "destructive"});
      return;
    }
    if (!user) {
        toast({ title: "Aksi Gagal", description: "Pengguna tidak terautentikasi.", variant: "destructive" });
        return;
    }

    try {
      const examData = {
        ...data,
        date: Timestamp.fromDate(data.date),
        subjectName,
        className,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "exams"), examData);
      toast({ title: "Ujian Ditambahkan", description: "Jadwal ujian berhasil disimpan." });

      const batch = writeBatch(db);
      const notificationBase = {
        title: `Jadwal Ujian: ${data.title.substring(0,25)}${data.title.length > 25 ? "..." : ""} (${subjectName})`,
        description: `Tanggal: ${format(data.date, "dd MMM yyyy", {locale: indonesiaLocale})}, Pukul ${data.startTime} - ${data.endTime}`,
        href: `/exams`,
        read: false,
        createdAt: serverTimestamp(),
        type: "new_exam",
      };

      const usersRef = collection(db, "users");
      const qStudents = query(usersRef, where("role", "==", "siswa"), where("classId", "==", data.classId));
      const studentsSnapshot = await getDocs(qStudents);

      studentsSnapshot.forEach((studentDoc) => {
        const studentNotificationRef = doc(collection(db, "notifications"));
        batch.set(studentNotificationRef, { ...notificationBase, userId: studentDoc.id });
      });

      const creatorNotificationRef = doc(collection(db, "notifications"));
      batch.set(creatorNotificationRef, { ...notificationBase, userId: user.uid, title: `Anda membuat jadwal ujian: ${data.title} (${subjectName})` });

      await batch.commit();

      setIsAddDialogOpen(false);
      addExamForm.reset({ date: new Date(), title: "", subjectId: undefined, classId: undefined, startTime: "", endTime: "", description: "" });
      fetchExams();
    } catch (error: any) {
      console.error("Error adding exam or notifications:", error);
      toast({ title: "Gagal Menambahkan Ujian", description: "Terjadi kesalahan.", variant: "destructive" });
    }
  };

  const handleEditExamSubmit: SubmitHandler<EditExamFormValues> = async (data) => {
    if (!selectedExam) return;
    editExamForm.clearErrors();
    const { subjectName, className } = getDenormalizedNames(data);

    if (!subjectName || !className) {
      toast({title: "Data Tidak Lengkap", description: "Pastikan subjek dan kelas valid.", variant: "destructive"});
      return;
    }

    try {
      const examDocRef = doc(db, "exams", data.id);
      await updateDoc(examDocRef, {
        ...data,
        date: Timestamp.fromDate(data.date),
        subjectName,
        className,
      });
      toast({ title: "Ujian Diperbarui", description: "Jadwal ujian berhasil diperbarui." });
      setIsEditDialogOpen(false);
      setSelectedExam(null);
      fetchExams();
    } catch (error) {
      console.error("Error editing exam:", error);
      toast({ title: "Gagal Memperbarui Ujian", description: "Terjadi kesalahan.", variant: "destructive" });
    }
  };

  const handleDeleteExam = async (examId: string) => {
    try {
      await deleteDoc(doc(db, "exams", examId));
      toast({ title: "Ujian Dihapus", description: "Jadwal ujian berhasil dihapus." });
      setSelectedExam(null);
      fetchExams();
    } catch (error) {
      console.error("Error deleting exam:", error);
      toast({ title: "Gagal Menghapus Ujian", description: "Terjadi kesalahan.", variant: "destructive" });
    }
  };

  const openEditDialog = (exam: ExamData) => {
    setSelectedExam(exam);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (exam: ExamData) => {
    setSelectedExam(exam);
  };

  const canManageExams = role === "admin" || role === "guru";

  const uniqueSubjectNamesForFilter = useMemo(() => {
    const subjectNames = new Set<string>();
    exams.forEach(exam => {
        if (exam.subjectName) subjectNames.add(exam.subjectName);
    });
    return Array.from(subjectNames).sort();
  }, [exams]);

  const filteredAndSearchedExams = useMemo(() => {
    return exams.filter(exam => {
        const matchesSubject = selectedSubjectFilter === "all" || exam.subjectName === selectedSubjectFilter;
        const matchesSearchTerm = searchTerm === "" ||
            exam.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (exam.subjectName && exam.subjectName.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (exam.className && exam.className.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchesSubject && matchesSearchTerm;
    });
  }, [exams, searchTerm, selectedSubjectFilter]);

  const totalPages = Math.ceil(filteredAndSearchedExams.length / ITEMS_PER_PAGE);
  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ITEMS_PER_PAGE;
    return filteredAndSearchedExams.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, filteredAndSearchedExams]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedSubjectFilter]);

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


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Ujian</h1>
        <p className="text-muted-foreground">Kelola jadwal ujian, input soal, dan pelaksanaan ujian.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileText className="h-6 w-6 text-primary" />
            <span>Daftar Ujian</span>
          </CardTitle>
          {canManageExams && (
            <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
              setIsAddDialogOpen(isOpen);
              if (!isOpen) { addExamForm.reset({ date: new Date(), title: "", subjectId: undefined, classId: undefined, startTime: "", endTime: "", description: "" }); addExamForm.clearErrors(); }
            }}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => { if (subjects.length === 0 || classes.length === 0) fetchDropdownData(); }}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Tambah Ujian
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Tambah Jadwal Ujian Baru</DialogTitle>
                  <DialogDescription>
                    Isi detail jadwal ujian.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={addExamForm.handleSubmit(handleAddExamSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                  <div>
                    <Label htmlFor="add-exam-title">Judul Ujian</Label>
                    <Input id="add-exam-title" {...addExamForm.register("title")} className="mt-1" />
                    {addExamForm.formState.errors.title && <p className="text-sm text-destructive mt-1">{addExamForm.formState.errors.title.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="add-exam-subjectId">Mata Pelajaran</Label>
                    <Select onValueChange={(value) => addExamForm.setValue("subjectId", value, { shouldValidate: true })} defaultValue={addExamForm.getValues("subjectId")}>
                      <SelectTrigger id="add-exam-subjectId" className="mt-1"><SelectValue placeholder="Pilih mata pelajaran" /></SelectTrigger>
                      <SelectContent>
                        {subjects.length === 0 && <SelectItem value="loading" disabled>Memuat...</SelectItem>}
                        {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {addExamForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{addExamForm.formState.errors.subjectId.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="add-exam-classId">Kelas</Label>
                    <Select onValueChange={(value) => addExamForm.setValue("classId", value, { shouldValidate: true })} defaultValue={addExamForm.getValues("classId")}>
                      <SelectTrigger id="add-exam-classId" className="mt-1"><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                      <SelectContent>
                        {classes.length === 0 && <SelectItem value="loading" disabled>Memuat...</SelectItem>}
                        {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {addExamForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{addExamForm.formState.errors.classId.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="add-exam-date">Tanggal Ujian</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className="w-full justify-start text-left font-normal mt-1"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {addExamForm.watch("date") ? format(addExamForm.watch("date"), "PPP", { locale: indonesiaLocale }) : <span>Pilih tanggal</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={addExamForm.watch("date")}
                          onSelect={(date) => addExamForm.setValue("date", date || new Date(), { shouldValidate: true })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {addExamForm.formState.errors.date && <p className="text-sm text-destructive mt-1">{addExamForm.formState.errors.date.message}</p>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                          <Label htmlFor="add-exam-startTime">Waktu Mulai</Label>
                          <Input id="add-exam-startTime" type="time" {...addExamForm.register("startTime")} className="mt-1" />
                          {addExamForm.formState.errors.startTime && <p className="text-sm text-destructive mt-1">{addExamForm.formState.errors.startTime.message}</p>}
                      </div>
                      <div>
                          <Label htmlFor="add-exam-endTime">Waktu Selesai</Label>
                          <Input id="add-exam-endTime" type="time" {...addExamForm.register("endTime")} className="mt-1" />
                          {addExamForm.formState.errors.endTime && <p className="text-sm text-destructive mt-1">{addExamForm.formState.errors.endTime.message}</p>}
                      </div>
                  </div>
                  <div>
                    <Label htmlFor="add-exam-description">Deskripsi (Opsional)</Label>
                    <Textarea id="add-exam-description" {...addExamForm.register("description")} className="mt-1" />
                  </div>
                  <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                    <Button type="submit" disabled={addExamForm.formState.isSubmitting}>{addExamForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Jadwal"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {canManageExams && (
            <div className="my-4 flex flex-col sm:flex-row gap-2">
                <div className="relative flex-grow">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cari ujian, mapel, atau kelas..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 w-full"
                    />
                </div>
                <Select
                    value={selectedSubjectFilter}
                    onValueChange={setSelectedSubjectFilter}
                    disabled={isLoading || uniqueSubjectNamesForFilter.length === 0}
                >
                    <SelectTrigger className="w-full sm:w-[200px]">
                        <FilterIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                        <SelectValue placeholder="Filter Mata Pelajaran" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Semua Mapel</SelectItem>
                        {uniqueSubjectNamesForFilter.map((subjectName) => (
                            <SelectItem key={subjectName} value={subjectName}>{subjectName}</SelectItem>
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
                    <TableHead className={cn(isMobile ? "w-10 px-2 text-center" : "w-[50px]")}>No.</TableHead>
                    <TableHead className={cn(isMobile ? "px-2" : "min-w-[180px]")}>Judul Ujian</TableHead>
                    <TableHead className={cn(isMobile ? "px-2" : "min-w-[150px]")}>Mata Pelajaran</TableHead>
                    {!isMobile && <TableHead className="min-w-[100px]">Kelas</TableHead>}
                    <TableHead className={cn(isMobile ? "px-2" : "min-w-[120px]")}>Tanggal</TableHead>
                    {!isMobile && <TableHead className="min-w-[120px]">Waktu</TableHead>}
                    {canManageExams && <TableHead className={cn("text-right min-w-[100px]", isMobile ? "w-12 px-1" : "")}>Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentTableData.map((exam, index) => (
                    <TableRow key={exam.id}>
                      <TableCell className={cn(isMobile ? "px-2 text-center" : "")}>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                      <TableCell className={cn("font-medium truncate", isMobile && "px-2")} title={exam.title}>{exam.title}</TableCell>
                      <TableCell className={cn("truncate", isMobile && "px-2")} title={exam.subjectName || exam.subjectId}>{exam.subjectName || exam.subjectId}</TableCell>
                      {!isMobile && <TableCell className="truncate" title={exam.className || exam.classId}>{exam.className || exam.classId}</TableCell>}
                      <TableCell className={cn(isMobile && "px-2 text-xs")}>
                          {format(exam.date.toDate(), isMobile ? "dd/MM/yy" : "dd MMM yyyy", { locale: indonesiaLocale })}
                          {isMobile && <span className="block text-muted-foreground">{exam.startTime}</span>}
                      </TableCell>
                      {!isMobile && <TableCell>{exam.startTime} - {exam.endTime}</TableCell>}
                      {canManageExams && (
                        <TableCell className={cn("text-right", isMobile && "px-1")}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`Opsi untuk ${exam.title}`}>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditDialog(exam)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem
                                      onSelect={(e) => { e.preventDefault(); openDeleteDialog(exam); }}
                                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Hapus
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  {selectedExam && selectedExam.id === exam.id && (
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Tindakan ini akan menghapus jadwal ujian <span className="font-semibold">{selectedExam?.title}</span>.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel onClick={() => setSelectedExam(null)}>Batal</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteExam(selectedExam.id)}>Ya, Hapus Jadwal</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  )}
                                </AlertDialog>
                              </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
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
              {searchTerm || selectedSubjectFilter !== "all"
                ? "Tidak ada ujian yang cocok dengan filter atau pencarian Anda."
                : "Belum ada jadwal ujian yang ditambahkan."
              }
            </div>
          )}
        </CardContent>
      </Card>

      {canManageExams && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
          setIsEditDialogOpen(isOpen);
          if (!isOpen) { setSelectedExam(null); editExamForm.clearErrors(); }
        }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Jadwal Ujian</DialogTitle>
              <DialogDescription>Perbarui detail jadwal ujian.</DialogDescription>
            </DialogHeader>
            {selectedExam && (
              <form onSubmit={editExamForm.handleSubmit(handleEditExamSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <Input type="hidden" {...editExamForm.register("id")} />
                <div>
                  <Label htmlFor="edit-exam-title">Judul Ujian</Label>
                  <Input id="edit-exam-title" {...editExamForm.register("title")} className="mt-1" />
                  {editExamForm.formState.errors.title && <p className="text-sm text-destructive mt-1">{editExamForm.formState.errors.title.message}</p>}
                </div>
                <div>
                  <Label htmlFor="edit-exam-subjectId">Mata Pelajaran</Label>
                  <Select onValueChange={(value) => editExamForm.setValue("subjectId", value, { shouldValidate: true })} defaultValue={editExamForm.getValues("subjectId")}>
                    <SelectTrigger id="edit-exam-subjectId" className="mt-1"><SelectValue placeholder="Pilih mata pelajaran" /></SelectTrigger>
                    <SelectContent>
                      {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {editExamForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{editExamForm.formState.errors.subjectId.message}</p>}
                </div>
                <div>
                  <Label htmlFor="edit-exam-classId">Kelas</Label>
                  <Select onValueChange={(value) => editExamForm.setValue("classId", value, { shouldValidate: true })} defaultValue={editExamForm.getValues("classId")}>
                    <SelectTrigger id="edit-exam-classId" className="mt-1"><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                    <SelectContent>
                      {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {editExamForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{editExamForm.formState.errors.classId.message}</p>}
                </div>
                <div>
                    <Label htmlFor="edit-exam-date">Tanggal Ujian</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className="w-full justify-start text-left font-normal mt-1"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {editExamForm.watch("date") ? format(editExamForm.watch("date"), "PPP", { locale: indonesiaLocale }) : <span>Pilih tanggal</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={editExamForm.watch("date")}
                          onSelect={(date) => editExamForm.setValue("date", date || new Date(), { shouldValidate: true })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {editExamForm.formState.errors.date && <p className="text-sm text-destructive mt-1">{editExamForm.formState.errors.date.message}</p>}
                  </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="edit-exam-startTime">Waktu Mulai</Label>
                        <Input id="edit-exam-startTime" type="time" {...editExamForm.register("startTime")} className="mt-1" />
                        {editExamForm.formState.errors.startTime && <p className="text-sm text-destructive mt-1">{editExamForm.formState.errors.startTime.message}</p>}
                    </div>
                    <div>
                        <Label htmlFor="edit-exam-endTime">Waktu Selesai</Label>
                        <Input id="edit-exam-endTime" type="time" {...editExamForm.register("endTime")} className="mt-1" />
                        {editExamForm.formState.errors.endTime && <p className="text-sm text-destructive mt-1">{editExamForm.formState.errors.endTime.message}</p>}
                    </div>
                </div>
                <div>
                  <Label htmlFor="edit-exam-description">Deskripsi (Opsional)</Label>
                  <Textarea id="edit-exam-description" {...editExamForm.register("description")} className="mt-1" />
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                  <Button type="submit" disabled={editExamForm.formState.isSubmitting}>{editExamForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}</Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

