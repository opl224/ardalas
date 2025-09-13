
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen, PlusCircle, Edit, Trash2, Search, MoreVertical, FileDown } from "lucide-react";
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
  where
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import LottieLoader from "@/components/ui/LottieLoader";
import { format } from "date-fns";

interface AuthUserMin {
  id: string; // Firebase Auth UID
  name: string;
  email: string;
}

interface Subject {
  id: string;
  name: string;
  description?: string;
  teacherUid?: string; // UID of the responsible teacher from Auth
  teacherName?: string; // Denormalized name of the responsible teacher
  classIds?: string[]; // Array of class IDs
  classNames?: string[]; // Denormalized class names
  createdAt?: Timestamp;
}

interface TeacherWithClasses {
  id: string; // Teacher's Document ID from 'teachers' collection
  uid: string; // Teacher's Auth UID
  name: string;
  email: string;
  subject: string; // Main subject from teacher's profile
  classIds: string[];
  classNames: string[];
}

const ALL_SUBJECT_OPTIONS = [
    "Guru Kelas", "Pendidikan Agama Islam", "Pendidikan Agama Kristen", "PJOK", "Bahasa Inggris"
].sort();

const subjectFormSchema = z.object({
  name: z.string({ required_error: "Nama wajib diisi." }).min(1, { message: "Nama wajib diisi" }),
  description: z.string().optional(),
  teacherUid: z.string().optional(),
  classIds: z.array(z.string()).optional(),
});
type SubjectFormValues = z.infer<typeof subjectFormSchema>;

const editSubjectFormSchema = subjectFormSchema.extend({
  id: z.string(),
});
type EditSubjectFormValues = z.infer<typeof editSubjectFormSchema>;

const NO_RESPONSIBLE_TEACHER = "_NONE_";
const ITEMS_PER_PAGE = 10;

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachersWithClasses, setTeachersWithClasses] = useState<TeacherWithClasses[]>([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(true);
  const [isLoadingInitialData, setIsLoadingInitialData] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const { user, role, loading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const { isMobile } = useSidebar();
  const [isExporting, setIsExporting] = useState(false);

  const { toast } = useToast();

  const addSubjectForm = useForm<SubjectFormValues>({
    resolver: zodResolver(subjectFormSchema),
    defaultValues: {
      name: undefined,
      description: "",
      teacherUid: undefined,
      classIds: [],
    },
  });

  const editSubjectForm = useForm<EditSubjectFormValues>({
    resolver: zodResolver(editSubjectFormSchema),
  });

  const fetchInitialData = useCallback(async () => {
    if (role !== "admin") {
      setIsLoadingInitialData(false);
      return;
    }
    setIsLoadingInitialData(true);
    try {
      const [teachersSnapshot, classesSnapshot, lessonsSnapshot] = await Promise.all([
        getDocs(query(collection(db, "teachers"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "classes"))),
        getDocs(query(collection(db, "lessons")))
      ]);
      
      const classesMap = new Map(classesSnapshot.docs.map(doc => [doc.id, doc.data().name]));
      
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

      lessonsSnapshot.forEach(lessonDoc => {
        const lesson = lessonDoc.data();
        if (lesson.teacherId && lesson.classId) {
          if (!teacherClassMap.has(lesson.teacherId)) {
            teacherClassMap.set(lesson.teacherId, new Set());
          }
          teacherClassMap.get(lesson.teacherId)!.add(lesson.classId);
        }
      });

      const processedTeachers: TeacherWithClasses[] = teachersSnapshot.docs.map(doc => {
        const teacher = doc.data();
        const teacherClassesSet = teacherClassMap.get(doc.id) || new Set();
        const classIds = Array.from(teacherClassesSet);
        const classNames = classIds.map(id => classesMap.get(id) || "Nama Kelas Tidak Ditemukan").sort();
        return {
          id: doc.id,
          uid: teacher.uid,
          name: teacher.name,
          email: teacher.email,
          subject: teacher.subject,
          classIds,
          classNames
        };
      });
      setTeachersWithClasses(processedTeachers);

    } catch (error) {
      console.error("Error fetching initial data: ", error);
      toast({ title: "Gagal Memuat Data Guru & Kelas", variant: "destructive" });
    } finally {
      setIsLoadingInitialData(false);
    }
  }, [role, toast]);


  const fetchSubjects = async () => {
    if (authLoading) return;
    setIsLoadingSubjects(true);
    try {
      const subjectsCollectionRef = collection(db, "subjects");
      let q;
      if (role === "guru" && user?.uid) {
        q = query(subjectsCollectionRef, where("teacherUid", "==", user.uid), orderBy("name", "asc"));
      } else if (role === "admin") {
        q = query(subjectsCollectionRef, orderBy("name", "asc"));
      } else {
        setSubjects([]);
        setIsLoadingSubjects(false);
        return;
      }

      const querySnapshot = await getDocs(q);
      const fetchedSubjects: Subject[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name,
        description: docSnap.data().description,
        teacherUid: docSnap.data().teacherUid,
        teacherName: docSnap.data().teacherName,
        classIds: docSnap.data().classIds,
        classNames: docSnap.data().classNames,
        createdAt: docSnap.data().createdAt,
      }));
      setSubjects(fetchedSubjects);
    } catch (error) {
      console.error("Error fetching subjects: ", error);
      toast({ title: "Gagal Memuat Mata Pelajaran", variant: "destructive" });
    } finally {
      setIsLoadingSubjects(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    if (!authLoading && role) {
        fetchSubjects();
    }
  }, [role, user, authLoading]);

  // Auto-fill classes when teacher is selected in the 'Add' form
  const watchAddTeacherUid = addSubjectForm.watch("teacherUid");
  useEffect(() => {
    const selectedSubjectName = addSubjectForm.getValues("name");
    if (!watchAddTeacherUid || selectedSubjectName !== 'Guru Kelas') {
      addSubjectForm.setValue("classIds", []);
      return;
    }
    const selectedTeacher = teachersWithClasses.find(t => t.uid === watchAddTeacherUid);
    if (selectedTeacher) {
      addSubjectForm.setValue("classIds", selectedTeacher.classIds);
    } else {
      addSubjectForm.setValue("classIds", []);
    }
  }, [watchAddTeacherUid, teachersWithClasses, addSubjectForm]);
  
  // Auto-fill classes when teacher is selected in the 'Edit' form
  const watchEditTeacherUid = editSubjectForm.watch("teacherUid");
  useEffect(() => {
    const selectedSubjectName = editSubjectForm.getValues("name");
    if (!watchEditTeacherUid || selectedSubjectName !== 'Guru Kelas') {
      editSubjectForm.setValue("classIds", []);
      return;
    }
    const selectedTeacher = teachersWithClasses.find(t => t.uid === watchEditTeacherUid);
    if (selectedTeacher) {
      editSubjectForm.setValue("classIds", selectedTeacher.classIds);
    } else {
      editSubjectForm.setValue("classIds", []);
    }
  }, [watchEditTeacherUid, teachersWithClasses, editSubjectForm]);


  useEffect(() => {
    if (selectedSubject && isEditDialogOpen && role === "admin") {
      editSubjectForm.reset({
        id: selectedSubject.id,
        name: selectedSubject.name,
        description: selectedSubject.description || "",
        teacherUid: selectedSubject.teacherUid || undefined,
        classIds: selectedSubject.classIds || [],
      });
    }
  }, [selectedSubject, isEditDialogOpen, editSubjectForm, role]);

  const handleAddSubjectSubmit: SubmitHandler<SubjectFormValues> = async (data) => {
    if (role !== "admin") return;
    addSubjectForm.clearErrors();
    const selectedTeacher = teachersWithClasses.find(userAuth => userAuth.uid === data.teacherUid);
    
    if(!user?.uid) {
      toast({title: "Aksi Gagal", description: "Pengguna tidak terautentikasi.", variant: "destructive"});
      return;
    }

    try {
      const subjectsCollectionRef = collection(db, "subjects");
      await addDoc(subjectsCollectionRef, {
        name: data.name,
        description: data.description || null,
        teacherUid: data.teacherUid === NO_RESPONSIBLE_TEACHER ? null : data.teacherUid || null,
        teacherName: selectedTeacher?.name || null,
        classIds: data.name === 'Guru Kelas' && selectedTeacher ? selectedTeacher.classIds : [],
        classNames: data.name === 'Guru Kelas' && selectedTeacher ? selectedTeacher.classNames : [],
        createdAt: serverTimestamp(),
      });

      toast({ title: "Mata Pelajaran Ditambahkan", description: `${data.name} berhasil ditambahkan.` });
      setIsAddDialogOpen(false);
      addSubjectForm.reset();
      fetchSubjects();
    } catch (error: any) {
      console.error("Error adding subject:", error);
      toast({
        title: "Gagal Menambahkan Mata Pelajaran",
        variant: "destructive",
      });
    }
  };

  const handleEditSubjectSubmit: SubmitHandler<EditSubjectFormValues> = async (data) => {
    if (role !== "admin" || !selectedSubject) return;
    editSubjectForm.clearErrors();
    const selectedTeacher = teachersWithClasses.find(userAuth => userAuth.uid === data.teacherUid);

    try {
      const subjectDocRef = doc(db, "subjects", data.id);
      await updateDoc(subjectDocRef, {
        name: data.name,
        description: data.description || null,
        teacherUid: data.teacherUid === NO_RESPONSIBLE_TEACHER ? null : data.teacherUid || null,
        teacherName: selectedTeacher?.name || null,
        classIds: data.name === 'Guru Kelas' && selectedTeacher ? selectedTeacher.classIds : [],
        classNames: data.name === 'Guru Kelas' && selectedTeacher ? selectedTeacher.classNames : [],
      });

      toast({ title: "Mata Pelajaran Diperbarui", description: `${data.name} berhasil diperbarui.` });
      setIsEditDialogOpen(false);
      setSelectedSubject(null);
      fetchSubjects();
    } catch (error) {
      console.error("Error editing subject:", error);
      toast({
        title: "Gagal Memperbarui Mata Pelajaran",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSubject = async (subjectId: string, subjectName?: string) => {
    if (role !== "admin") return;
    try {
      await deleteDoc(doc(db, "subjects", subjectId));
      toast({ title: "Mata Pelajaran Dihapus", description: `${subjectName || 'Mata Pelajaran'} berhasil dihapus.` });
      setSelectedSubject(null);
      fetchSubjects();
    } catch (error) {
      console.error("Error deleting subject:", error);
      toast({
        title: "Gagal Menghapus Mata Pelajaran",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (subject: Subject) => {
    if (role !== "admin") return;
    if (teachersWithClasses.length === 0 && !isLoadingInitialData) {
        fetchInitialData();
    }
    setSelectedSubject(subject);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (subject: Subject) => {
     if (role !== "admin") return;
    setSelectedSubject(subject);
  };
  
  const addFormSelectedSubjectName = addSubjectForm.watch("name");
  const filteredTeachersForAdd = useMemo(() => {
    if (!addFormSelectedSubjectName) return teachersWithClasses;
    return teachersWithClasses.filter(teacher => teacher.subject === addFormSelectedSubjectName);
  }, [addFormSelectedSubjectName, teachersWithClasses]);

  const editFormSelectedSubjectName = editSubjectForm.watch("name");
  const filteredTeachersForEdit = useMemo(() => {
    if (!editFormSelectedSubjectName) return teachersWithClasses;
    return teachersWithClasses.filter(teacher => teacher.subject === editFormSelectedSubjectName);
  }, [editFormSelectedSubjectName, teachersWithClasses]);


  const renderSubjectFormFields = (formInstance: typeof addSubjectForm | typeof editSubjectForm, formType: 'add' | 'edit') => {
    const selectedSubjectName = formInstance.watch("name");
    const teacherUid = formInstance.watch("teacherUid");
    const selectedTeacher = teachersWithClasses.find(t => t.uid === teacherUid);
    const filteredTeachers = formType === 'add' ? filteredTeachersForAdd : filteredTeachersForEdit;
    
    return (
      <>
        <div>
          <Label htmlFor={`${formType}-subject-name`}>Nama Mata Pelajaran <span className="text-destructive">*</span></Label>
          <Controller
              name="name"
              control={formInstance.control}
              render={({ field }) => (
                  <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        const currentTeacherUid = formInstance.getValues("teacherUid");
                        if (currentTeacherUid) {
                            const currentTeacher = teachersWithClasses.find(t => t.uid === currentTeacherUid);
                            if (currentTeacher && currentTeacher.subject !== value) {
                                formInstance.setValue("teacherUid", undefined);
                            }
                        }
                      }}
                      value={field.value || undefined}
                  >
                  <SelectTrigger id={`${formType}-subject-name`} className="mt-1">
                      <SelectValue placeholder="Pilih mata pelajaran" />
                  </SelectTrigger>
                  <SelectContent>
                      {ALL_SUBJECT_OPTIONS.map((subject) => (
                          <SelectItem key={subject} value={subject}>
                              {subject}
                          </SelectItem>
                      ))}
                  </SelectContent>
                  </Select>
              )}
          />
          {formInstance.formState.errors.name && (
            <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.name.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor={`${formType}-subject-description`}>Deskripsi</Label>
          <Textarea id={`${formType}-subject-description`} {...formInstance.register("description")} className="mt-1" />
        </div>
        {role === "admin" && (
          <>
            <div>
              <Label htmlFor={`${formType}-subject-teacherUid`}>Guru Penanggung Jawab</Label>
              <Controller
                name="teacherUid"
                control={formInstance.control}
                render={({ field }) => (
                  <Select
                    onValueChange={(value) => field.onChange(value === NO_RESPONSIBLE_TEACHER ? undefined : value)}
                    value={field.value || NO_RESPONSIBLE_TEACHER}
                    disabled={isLoadingInitialData || !selectedSubjectName}
                  >
                    <SelectTrigger id={`${formType}-subject-teacherUid`} className="mt-1">
                      <SelectValue placeholder={!selectedSubjectName ? "Pilih mapel dulu" : (isLoadingInitialData ? "Memuat guru..." : "Pilih guru")} />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingInitialData && <SelectItem value="loading-auth" disabled>Memuat...</SelectItem>}
                      <SelectItem value={NO_RESPONSIBLE_TEACHER}>Tidak Ada / Kosongkan</SelectItem>
                      {filteredTeachers.length > 0 ? (
                        filteredTeachers
                        .filter(teacher => teacher && typeof teacher.uid === 'string' && teacher.uid.length > 0)
                        .map((teacher) => (
                        <SelectItem key={teacher.uid} value={teacher.uid}>
                          {teacher.name} ({teacher.email})
                        </SelectItem>
                      ))) : (
                         <SelectItem value="no-teachers" disabled>Tidak ada guru untuk mapel ini.</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
              {formInstance.formState.errors.teacherUid && (
                <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.teacherUid.message}</p>
              )}
            </div>
            {selectedSubjectName === 'Guru Kelas' && (
             <div>
              <Label>Kelas Diajar (Wali Kelas)</Label>
              <div className="mt-1 min-h-[40px] w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                {selectedTeacher ? selectedTeacher.classNames.join(', ') || 'Guru ini belum menjadi wali kelas manapun.' : 'Pilih guru untuk melihat kelas.'}
              </div>
            </div>
            )}
          </>
        )}
      </>
    );
  };

  const pageDescription = role === "guru"
    ? "Daftar mata pelajaran yang menjadi tanggung jawab."
    : "Kelola daftar mata pelajaran yang diajarkan.";

  const showSkeleton = isLoadingSubjects || authLoading || (role === "admin" && isLoadingInitialData);

  const displayedSubjects = useMemo(() => {
    if (role !== 'admin') return subjects;

    return subjects.filter(subject => {
      const lowerSearchTerm = searchTerm.toLowerCase();
      const nameMatch = subject.name.toLowerCase().includes(lowerSearchTerm);
      const teacherMatch = subject.teacherName ? subject.teacherName.toLowerCase().includes(lowerSearchTerm) : false;
      return nameMatch || teacherMatch;
    });
  }, [subjects, searchTerm, role]);

  const handleExport = async (formatType: 'pdf' | 'xlsx') => {
    if (displayedSubjects.length === 0) {
        toast({ title: "Tidak ada data untuk diekspor", variant: "info" });
        return;
    }
    setIsExporting(true);

    const fileName = `Data_Mata_Pelajaran_${format(new Date(), "yyyyMMdd")}`;
    const title = `Data Mata Pelajaran - Ardalas`;

    const dataToExport = displayedSubjects.map((subject, index) => ({
        "No.": index + 1,
        "Nama Mata Pelajaran": subject.name,
        "Deskripsi": subject.description || '-',
        "Guru Penanggung Jawab": subject.teacherName || '-',
        "Diajarkan di Kelas": subject.classNames?.join(', ') || '-',
    }));

    try {
        if (formatType === 'pdf') {
            const doc = new jsPDF({ orientation: 'landscape' });
            doc.setFontSize(16);
            doc.text(title, 14, 15);
            autoTable(doc, {
                startY: 22,
                head: [Object.keys(dataToExport[0])],
                body: dataToExport.map(Object.values),
                theme: 'grid',
            });
            doc.save(`${fileName}.pdf`);
        } else if (formatType === 'xlsx') {
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Mata Pelajaran");
            XLSX.writeFile(workbook, `${fileName}.xlsx`);
        }
        toast({ title: `Ekspor ${formatType.toUpperCase()} Berhasil`, description: `${fileName}.${formatType} telah diunduh.` });
    } catch (error) {
        console.error("Export error:", error);
        toast({ title: "Gagal Mengekspor Data", variant: "destructive" });
    } finally {
        setIsExporting(false);
    }
  };


  const totalPages = Math.ceil(displayedSubjects.length / ITEMS_PER_PAGE);
  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ITEMS_PER_PAGE;
    return displayedSubjects.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, displayedSubjects]);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Mata Pelajaran</h1>
        <p className="text-muted-foreground">{pageDescription}</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="pb-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-xl">
                    <BookOpen className="h-6 w-6 text-primary" />
                    <span>Daftar Mata Pelajaran</span>
                </CardTitle>
                 {role === "admin" && (
                    <div className="flex items-center gap-2">
                        <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
                          setIsAddDialogOpen(isOpen);
                          if (!isOpen) {
                            addSubjectForm.reset();
                            addSubjectForm.clearErrors();
                          } else {
                            if (teachersWithClasses.length === 0 && !isLoadingInitialData) fetchInitialData();
                          }
                        }}>
                          <DialogTrigger asChild>
                            <Button size="sm" className="w-full sm:w-auto">
                              <PlusCircle className="mr-2 h-4 w-4" /> Tambah Mata Pelajaran
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Tambah Mata Pelajaran Baru</DialogTitle>
                              <DialogDescription>
                                Isi detail mata pelajaran baru.
                              </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={addSubjectForm.handleSubmit(handleAddSubjectSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                              {renderSubjectFormFields(addSubjectForm, 'add')}
                              <DialogFooter>
                                <DialogClose asChild>
                                   <Button type="button" variant="outline">Batal</Button>
                                </DialogClose>
                                <Button type="submit" disabled={addSubjectForm.formState.isSubmitting || isLoadingInitialData}>
                                  {(addSubjectForm.formState.isSubmitting || isLoadingInitialData) && <LottieLoader width={16} height={16} className="mr-2" />}
                                  {(addSubjectForm.formState.isSubmitting || isLoadingInitialData) ? "Menyimpan..." : "Simpan Mata Pelajaran"}
                                </Button>
                              </DialogFooter>
                            </form>
                          </DialogContent>
                        </Dialog>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" disabled={isExporting}>
                                {isExporting ? <LottieLoader width={16} height={16} /> : <FileDown className="h-4 w-4" />}
                                <span className="ml-2">{isExporting ? 'Mengekspor...' : 'Ekspor'}</span>
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => handleExport('xlsx')} disabled={isExporting}>Excel (.xlsx)</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport('pdf')} disabled={isExporting}>PDF (.pdf)</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </div>
        </CardHeader>
        <CardContent>
          {role === "admin" && (
            <div className="my-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari berdasarkan nama mata pelajaran atau guru..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-full"
                />
              </div>
            </div>
          )}
          {showSkeleton ? (
             <div className="space-y-2 mt-4">
                {[...Array(ITEMS_PER_PAGE)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
             </div>
          ) : currentTableData.length > 0 ? (
            <>
            <div className="overflow-x-auto">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">No.</TableHead>
                    <TableHead className={cn("w-1/4", isMobile && "w-1/3 px-2")}>Nama Mapel</TableHead>
                    {!isMobile && <TableHead className="w-1/3">Deskripsi</TableHead>}
                    <TableHead className={cn("w-1/4", isMobile && "w-1/3 px-2")}>Guru Penanggung Jawab</TableHead>
                    {!isMobile && <TableHead className="w-1/4">Kelas Diajar</TableHead>}
                    {role === "admin" && <TableHead className={cn("text-right", isMobile ? "w-12 px-1" : "w-16")}>Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentTableData.map((subject, index) => (
                    <TableRow key={subject.id}>
                      <TableCell className="text-center">{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                      <TableCell className="font-medium truncate" title={subject.name}>{subject.name}</TableCell>
                      {!isMobile && <TableCell className="truncate" title={subject.description || "-"}>{subject.description || "-"}</TableCell>}
                      <TableCell className="truncate" title={subject.teacherName || subject.teacherUid || "-"}>{subject.teacherName || subject.teacherUid || "-"}</TableCell>
                      {!isMobile && <TableCell className="truncate" title={subject.classNames?.join(', ') || "-"}>{subject.classNames?.join(', ') || "-"}</TableCell>}
                      {role === "admin" && (
                        <TableCell className={cn("text-right", isMobile && "px-1")}>
                           <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Opsi untuk ${subject.name}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditDialog(subject)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem
                                    onSelect={(e) => { e.preventDefault(); openDeleteDialog(subject); }}
                                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Hapus
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                {selectedSubject && selectedSubject.id === subject.id && (
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Apakah Kamu Yakin?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Tindakan ini akan menghapus mata pelajaran <span className="font-semibold">{selectedSubject?.name}</span>. Data yang dihapus tidak dapat dikembalikan.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel onClick={() => setSelectedSubject(null)}>Batal</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteSubject(selectedSubject.id, selectedSubject.name)}>
                                        Ya, Hapus Mata Pelajaran
                                      </AlertDialogAction>
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
              {role === "admin" ? (searchTerm ? 'Tidak ada mata pelajaran yang cocok dengan pencarian.' : 'Tidak ada data mata pelajaran. Klik "Tambah Mata Pelajaran" untuk membuat data baru.') : 'Tidak ada mata pelajaran yang ditugaskan kepada anda.'}
            </div>
          )}
        </CardContent>
      </Card>

      {role === "admin" && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
            setIsEditDialogOpen(isOpen);
            if (!isOpen) {
              setSelectedSubject(null);
              editSubjectForm.clearErrors();
            }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Mata Pelajaran</DialogTitle>
              <DialogDescription>
                Perbarui detail mata pelajaran.
              </DialogDescription>
            </DialogHeader>
            {selectedSubject && (
              <form onSubmit={editSubjectForm.handleSubmit(handleEditSubjectSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <Input type="hidden" {...editSubjectForm.register("id")} />
                {renderSubjectFormFields(editSubjectForm, 'edit')}
                <DialogFooter>
                   <DialogClose asChild>
                      <Button type="button" variant="outline" onClick={() => { setIsEditDialogOpen(false); setSelectedSubject(null); }}>Batal</Button>
                   </DialogClose>
                  <Button type="submit" disabled={editSubjectForm.formState.isSubmitting || isLoadingInitialData}>
                    {editSubjectForm.formState.isSubmitting || isLoadingInitialData ? <LottieLoader width={16} height={16} className="mr-2" /> : null}
                    {editSubjectForm.formState.isSubmitting || isLoadingInitialData ? "Menyimpan..." : "Simpan Perubahan"}
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
