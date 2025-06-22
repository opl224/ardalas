
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
import { School, PlusCircle, Edit, Trash2, Eye, AlertCircle, MoreVertical, Search, Filter as FilterIcon } from "lucide-react"; 
import { useState, useEffect, useMemo } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
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
  where,
  limit,
  getDoc 
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


interface TeacherMin { 
  id: string;
  name: string;
}

interface ClassData {
  id: string; 
  name: string; 
  teacherId?: string; 
  teacherName?: string; 
  createdAt?: Timestamp; 
}

interface StudentInClass {
  id: string;
  name: string;
  nis: string;
  attendanceNumber?: number;
}

const classFormSchema = z.object({
  name: z.string().min(3, { message: "Nama kelas minimal 3 karakter." }),
  teacherId: z.string().optional(), 
});
type ClassFormValues = z.infer<typeof classFormSchema>;

const editClassFormSchema = classFormSchema.extend({
  id: z.string(),
});
type EditClassFormValues = z.infer<typeof editClassFormSchema>;

const NO_TEACHER_VALUE = "_NONE_";
const ITEMS_PER_PAGE = 10;

export default function ClassesPage() {
  const { user, role: authRole, loading: authLoading } = useAuth(); 
  const [allRawClasses, setAllRawClasses] = useState<ClassData[]>([]);
  const [teachers, setTeachers] = useState<TeacherMin[]>([]); 
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassNameFilter, setSelectedClassNameFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const [isViewStudentsDialogOpen, setIsViewStudentsDialogOpen] = useState(false);
  const [selectedClassForViewingStudents, setSelectedClassForViewingStudents] = useState<ClassData | null>(null);
  const [studentsInClass, setStudentsInClass] = useState<StudentInClass[]>([]);
  const [isLoadingStudentsInClass, setIsLoadingStudentsInClass] = useState(false);

  const { toast } = useToast();
  const { isMobile } = useSidebar();

  const addClassForm = useForm<ClassFormValues>({
    resolver: zodResolver(classFormSchema),
    defaultValues: {
      name: "",
      teacherId: undefined,
    },
  });

  const editClassForm = useForm<EditClassFormValues>({
    resolver: zodResolver(editClassFormSchema),
  });

  const fetchTeachersForDropdown = async () => {
    try {
      const teachersCollectionRef = collection(db, "teachers");
      const q = query(teachersCollectionRef, orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const fetchedTeachers: TeacherMin[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name,
      }));
      setTeachers(fetchedTeachers);
    } catch (error) {
      console.error("Error fetching teachers for dropdown: ", error);
      toast({
        title: "Gagal Memuat Data Guru",
        description: "Terjadi kesalahan saat mengambil daftar guru untuk pilihan wali kelas.",
        variant: "destructive",
      });
    }
  };
  
  const fetchClasses = async () => {
    if (authLoading) return;
    setIsLoading(true);
    try {
      const classesCollectionRef = collection(db, "classes");
      let q;

      if (authRole === "admin") {
        if (teachers.length === 0) { 
          await fetchTeachersForDropdown();
        }
        q = query(classesCollectionRef, orderBy("name", "asc"));
        const querySnapshot = await getDocs(q);
        setAllRawClasses(querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ClassData)));
      } else if (authRole === "guru" && user?.uid) {
         if (teachers.length === 0) { 
          await fetchTeachersForDropdown();
        }
        const teacherProfileQuery = query(collection(db, "teachers"), where("uid", "==", user.uid), limit(1));
        const teacherProfileSnapshot = await getDocs(teacherProfileQuery);

        if (!teacherProfileSnapshot.empty) {
          const teacherDocId = teacherProfileSnapshot.docs[0].id;
          q = query(classesCollectionRef, where("teacherId", "==", teacherDocId), orderBy("name", "asc"));
          const querySnapshot = await getDocs(q);
          setAllRawClasses(querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ClassData)));
        } else {
          setAllRawClasses([]);
        }
      } else if (authRole === "orangtua" && user?.linkedStudentClassId) {
        const classDocRef = doc(db, "classes", user.linkedStudentClassId);
        const classDocSnap = await getDoc(classDocRef);
        if (classDocSnap.exists()) {
          setAllRawClasses([{ id: classDocSnap.id, ...classDocSnap.data() } as ClassData]);
        } else {
          setAllRawClasses([]);
        }
      } else {
        setAllRawClasses([]);
      }
    } catch (error) {
      console.error("Error fetching classes: ", error);
      toast({
        title: "Gagal Memuat Data Kelas",
        description: "Terjadi kesalahan saat mengambil data kelas.",
        variant: "destructive",
      });
      setAllRawClasses([]);
    } finally {
      setIsLoading(false);
    }
  };


  useEffect(() => {
    fetchClasses();
  }, [authRole, user, authLoading]); 

  useEffect(() => {
    if (selectedClass && isEditDialogOpen && authRole === "admin") {
      editClassForm.reset({
        id: selectedClass.id,
        name: selectedClass.name,
        teacherId: selectedClass.teacherId || undefined, 
      });
    }
  }, [selectedClass, isEditDialogOpen, editClassForm, authRole]);

  const handleAddClassSubmit: SubmitHandler<ClassFormValues> = async (data) => {
    if (authRole !== "admin") return; 
    addClassForm.clearErrors();
    const selectedTeacher = data.teacherId ? teachers.find(t => t.id === data.teacherId) : undefined;
    
    try {
      const classesCollectionRef = collection(db, "classes");
      await addDoc(classesCollectionRef, {
        name: data.name,
        teacherId: data.teacherId === NO_TEACHER_VALUE ? null : data.teacherId || null, 
        teacherName: selectedTeacher?.name || null, 
        createdAt: serverTimestamp(),
      });
      
      toast({ title: "Kelas Ditambahkan", description: `${data.name} berhasil ditambahkan.` });
      setIsAddDialogOpen(false);
      addClassForm.reset();
      fetchClasses(); 
    } catch (error: any) {
      console.error("Error adding class:", error);
      toast({
        title: "Gagal Menambahkan Kelas",
        description: "Terjadi kesalahan.",
        variant: "destructive",
      });
    }
  };

  const handleEditClassSubmit: SubmitHandler<EditClassFormValues> = async (data) => {
    if (authRole !== "admin" || !selectedClass) return;
    editClassForm.clearErrors();
    const selectedTeacher = data.teacherId ? teachers.find(t => t.id === data.teacherId) : undefined;

    try {
      const classDocRef = doc(db, "classes", data.id);
      await updateDoc(classDocRef, {
        name: data.name,
        teacherId: data.teacherId === NO_TEACHER_VALUE ? null : data.teacherId || null,
        teacherName: selectedTeacher?.name || null,
      });
      
      toast({ title: "Data Kelas Diperbarui", description: `${data.name} berhasil diperbarui.` });
      setIsEditDialogOpen(false);
      setSelectedClass(null);
      fetchClasses();
    } catch (error) {
      console.error("Error editing class:", error);
      toast({
        title: "Gagal Memperbarui Data Kelas",
        description: "Terjadi kesalahan.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClass = async (classId: string, className?: string) => {
    if (authRole !== "admin") return;
    try {
      await deleteDoc(doc(db, "classes", classId));
      toast({ title: "Data Kelas Dihapus", description: `${className || 'Kelas'} berhasil dihapus.` });
      setSelectedClass(null); 
      fetchClasses();
    } catch (error) {
      console.error("Error deleting class:", error);
      toast({
        title: "Gagal Menghapus Kelas",
        description: "Terjadi kesalahan.",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (classItem: ClassData) => {
    if (authRole !== "admin") return;
    setSelectedClass(classItem);
    setIsEditDialogOpen(true);
  };
  
  const openDeleteDialog = (classItem: ClassData) => {
    if (authRole !== "admin") return;
    setSelectedClass(classItem); 
  };

  const fetchStudentsForClass = async (classId: string) => {
    if (!classId) return;
    setIsLoadingStudentsInClass(true);
    setStudentsInClass([]); 
    try {
      const studentsQuery = query(
        collection(db, "users"), 
        where("role", "==", "siswa"),
        where("classId", "==", classId),
        orderBy("name", "asc")
      );
      const querySnapshot = await getDocs(studentsQuery);
      const fetchedStudents: StudentInClass[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id, 
        name: docSnap.data().name,
        nis: docSnap.data().nis || "N/A", 
        attendanceNumber: docSnap.data().attendanceNumber,
      }));
      setStudentsInClass(fetchedStudents);
    } catch (error) {
      console.error("Error fetching students for class: ", error);
      toast({
        title: "Gagal Memuat Siswa Kelas",
        description: "Terjadi kesalahan saat mengambil data siswa untuk kelas ini.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingStudentsInClass(false);
    }
  };


  const openViewStudentsDialog = (classItem: ClassData) => {
    setSelectedClassForViewingStudents(classItem);
    setIsViewStudentsDialogOpen(true);
    fetchStudentsForClass(classItem.id);
  };

  const pageTitle = authRole === "orangtua" ? `Kelas Anak Saya (${user?.linkedStudentName || 'Siswa'})` : "Manajemen Kelas";
  const pageDescription = authRole === "orangtua" 
    ? "Informasi mengenai kelas anak Anda."
    : "Kelola daftar kelas, wali kelas, dan siswa per kelas.";


  const filteredClasses = useMemo(() => {
    let tempClasses = allRawClasses;

    if (selectedClassNameFilter !== "all") {
      tempClasses = tempClasses.filter(c => c.name === selectedClassNameFilter);
    }

    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      tempClasses = tempClasses.filter(c => 
        c.name.toLowerCase().includes(lowerSearchTerm) ||
        (c.teacherName && c.teacherName.toLowerCase().includes(lowerSearchTerm))
      );
    }
    return tempClasses;
  }, [allRawClasses, searchTerm, selectedClassNameFilter]);

  const totalPages = Math.ceil(filteredClasses.length / ITEMS_PER_PAGE);
  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ITEMS_PER_PAGE;
    return filteredClasses.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, filteredClasses]);

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
  }, [searchTerm, selectedClassNameFilter]);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">{pageTitle}</h1>
        <p className="text-muted-foreground">{pageDescription}</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <School className="h-6 w-6 text-primary" />
            <span>{authRole === "orangtua" ? "Detail Kelas Anak" : "Daftar Kelas"}</span>
          </CardTitle>
          {authRole === "admin" && (
            <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
              setIsAddDialogOpen(isOpen);
              if (!isOpen) {
                addClassForm.reset();
                addClassForm.clearErrors();
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => { if (teachers.length === 0) fetchTeachersForDropdown(); }}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Tambah Kelas
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Tambah Kelas Baru</DialogTitle>
                  <DialogDescription>
                    Isi detail kelas dan pilih wali kelas jika ada.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={addClassForm.handleSubmit(handleAddClassSubmit)} className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="add-class-name">Nama Kelas</Label>
                    <Input id="add-class-name" {...addClassForm.register("name")} className="mt-1" placeholder="Contoh: 10A, XI IPA 1" />
                    {addClassForm.formState.errors.name && (
                      <p className="text-sm text-destructive mt-1">{addClassForm.formState.errors.name.message}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="add-class-teacherId">Wali Kelas (Opsional)</Label>
                    <Select
                      onValueChange={(value) => addClassForm.setValue("teacherId", value === NO_TEACHER_VALUE ? undefined : value, { shouldValidate: true })}
                      defaultValue={addClassForm.getValues("teacherId")}
                    >
                      <SelectTrigger id="add-class-teacherId" className="mt-1">
                        <SelectValue placeholder="Pilih wali kelas" />
                      </SelectTrigger>
                      <SelectContent>
                        {teachers.length === 0 && <SelectItem value="loading" disabled>Memuat guru...</SelectItem>}
                        <SelectItem value={NO_TEACHER_VALUE}>Tidak Ada Wali Kelas</SelectItem>
                        {teachers.map((teacher) => (
                          <SelectItem key={teacher.id} value={teacher.id}>
                            {teacher.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {addClassForm.formState.errors.teacherId && (
                      <p className="text-sm text-destructive mt-1">{addClassForm.formState.errors.teacherId.message}</p>
                    )}
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                       <Button type="button" variant="outline">Batal</Button>
                    </DialogClose>
                    <Button type="submit" disabled={addClassForm.formState.isSubmitting}>
                      {addClassForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Kelas"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {(authRole === 'admin' || authRole === 'guru') && (
             <div className="my-4 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama kelas atau wali kelas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-full"
                />
              </div>
               <Select
                  value={selectedClassNameFilter}
                  onValueChange={setSelectedClassNameFilter}
                  disabled={isLoading || allRawClasses.length === 0}
                >
                  <SelectTrigger className="w-full sm:w-[220px]">
                    <FilterIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Filter Nama Kelas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Nama Kelas</SelectItem>
                    {isLoading && <SelectItem value="loading-classes" disabled>Memuat kelas...</SelectItem>}
                    {!isLoading && allRawClasses.length === 0 && <SelectItem value="no-classes" disabled>Tidak ada kelas</SelectItem>}
                    {Array.from(new Set(allRawClasses.map(c => c.name))).sort().map((className) => (
                      <SelectItem key={className} value={className}>{className}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
            </div>
          )}
          {isLoading || authLoading ? (
             <div className="space-y-2 mt-4">
                {[...Array(ITEMS_PER_PAGE)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
             </div>
          ) : currentTableData.length > 0 ? (
            <>
            <div className="overflow-x-auto">
              <Table className={cn(isMobile && "table-fixed w-full")}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={cn("w-[50px]", isMobile && "w-10 px-2 text-center")}>No.</TableHead>
                    <TableHead className={cn(isMobile ? "w-2/5 px-2" : "")}>Nama Kelas</TableHead>
                    <TableHead className={cn(isMobile ? "w-2/5 px-2" : "")}>Wali Kelas</TableHead>
                    <TableHead className={cn("text-right", isMobile ? "w-12 px-1" : "")}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentTableData.map((classItem, index) => (
                    <TableRow key={classItem.id}>
                      <TableCell className={cn(isMobile ? "px-2 text-center" : "")}>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                      <TableCell className={cn("font-medium", isMobile ? "truncate px-2" : "")} title={classItem.name}>{classItem.name}</TableCell>
                      <TableCell className={cn("truncate", isMobile ? "px-2" : "")} title={classItem.teacherName || "-"}>{classItem.teacherName || "-"}</TableCell>
                      <TableCell className={cn("text-right", isMobile && "px-1")}>
                        {authRole === "guru" || authRole === "orangtua" ? (
                           <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openViewStudentsDialog(classItem)}
                            aria-label={`Lihat Siswa di Kelas ${classItem.name}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Opsi untuk ${classItem.name}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openViewStudentsDialog(classItem)}>
                                <Eye className="mr-2 h-4 w-4" />
                                Lihat Siswa
                              </DropdownMenuItem>
                              {authRole === "admin" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => openEditDialog(classItem)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <DropdownMenuItem
                                        onSelect={(e) => { e.preventDefault(); openDeleteDialog(classItem); }}
                                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Hapus
                                      </DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    {selectedClass && selectedClass.id === classItem.id && ( 
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Tindakan ini akan menghapus kelas <span className="font-semibold">{selectedClass?.name}</span>. Data yang dihapus tidak dapat dikembalikan.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel onClick={() => setSelectedClass(null)}>Batal</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => handleDeleteClass(selectedClass.id, selectedClass.name)}>
                                            Ya, Hapus Kelas
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    )}
                                  </AlertDialog>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
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
                {searchTerm || selectedClassNameFilter !== "all" ? 'Tidak ada kelas yang cocok dengan filter atau pencarian Anda.' :
                 authRole === 'admin' ? 'Tidak ada data kelas untuk ditampilkan. Klik "Tambah Kelas" untuk membuat data baru.' : 
                 authRole === 'guru' ? 'Anda tidak ditugaskan sebagai wali kelas untuk kelas manapun saat ini.' :
                 authRole === 'orangtua' && !user?.linkedStudentClassId ? (
                   <div className="flex flex-col items-center">
                     <AlertCircle className="w-10 h-10 mb-2 text-destructive" />
                     <span className="font-semibold">Data Kelas Anak Tidak Ditemukan.</span>
                     <span>Pastikan anak sudah terdaftar di kelas dan akun orang tua sudah ditautkan dengan benar.</span>
                   </div>
                 ) :
                 authRole === 'orangtua' ? 'Data kelas anak Anda tidak ditemukan.' :
                 'Tidak ada data kelas untuk ditampilkan.'
                }
            </div>
          )}
        </CardContent>
      </Card>

      {authRole === "admin" && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
            setIsEditDialogOpen(isOpen);
            if (!isOpen) {
              setSelectedClass(null);
              editClassForm.clearErrors();
            }
        }}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Data Kelas</DialogTitle>
              <DialogDescription>
                Perbarui detail data kelas.
              </DialogDescription>
            </DialogHeader>
            {selectedClass && (
              <form onSubmit={editClassForm.handleSubmit(handleEditClassSubmit)} className="space-y-4 py-4">
                <Input type="hidden" {...editClassForm.register("id")} />
                <div>
                  <Label htmlFor="edit-class-name">Nama Kelas</Label>
                  <Input id="edit-class-name" {...editClassForm.register("name")} className="mt-1" />
                  {editClassForm.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">{editClassForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div>
                    <Label htmlFor="edit-class-teacherId">Wali Kelas (Opsional)</Label>
                    <Select
                      onValueChange={(value) => editClassForm.setValue("teacherId", value === NO_TEACHER_VALUE ? undefined : value, { shouldValidate: true })}
                      defaultValue={editClassForm.getValues("teacherId") || undefined}
                    >
                      <SelectTrigger id="edit-class-teacherId" className="mt-1">
                        <SelectValue placeholder="Pilih wali kelas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_TEACHER_VALUE}>Tidak Ada Wali Kelas</SelectItem>
                        {teachers.map((teacher) => (
                          <SelectItem key={teacher.id} value={teacher.id}>
                            {teacher.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editClassForm.formState.errors.teacherId && (
                      <p className="text-sm text-destructive mt-1">{editClassForm.formState.errors.teacherId.message}</p>
                    )}
                  </div>
                <DialogFooter>
                   <DialogClose asChild>
                      <Button type="button" variant="outline" onClick={() => { setIsEditDialogOpen(false); setSelectedClass(null); }}>Batal</Button>
                   </DialogClose>
                  <Button type="submit" disabled={editClassForm.formState.isSubmitting}>
                    {editClassForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={isViewStudentsDialogOpen} onOpenChange={(isOpen) => {
        setIsViewStudentsDialogOpen(isOpen);
        if (!isOpen) {
          setSelectedClassForViewingStudents(null);
          setStudentsInClass([]); 
        }
      }}>
        <DialogContent className="sm:max-w-lg"> 
          <DialogHeader>
            <DialogTitle>Daftar Siswa di Kelas: {selectedClassForViewingStudents?.name || "Memuat..."}</DialogTitle>
            <DialogDescription>
              Berikut adalah daftar siswa yang terdaftar di kelas ini.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-[60vh] overflow-y-auto pr-2">
            {isLoadingStudentsInClass ? (
              <div className="space-y-3 my-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-5/6" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : studentsInClass.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">No.</TableHead>
                    <TableHead>Nama Siswa</TableHead>
                    {authRole !== 'orangtua' && <TableHead>NIS</TableHead>}
                    <TableHead>No. Absen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studentsInClass.map((student, index) => (
                    <TableRow key={student.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium truncate" title={student.name}>{student.name}</TableCell>
                      {authRole !== 'orangtua' && <TableCell className="truncate" title={student.nis}>{student.nis}</TableCell>}
                      <TableCell>{student.attendanceNumber ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-6">Tidak ada siswa di kelas ini.</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Tutup</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
