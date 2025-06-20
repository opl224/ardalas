
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
import { BookOpen, PlusCircle, Edit, Trash2, Search, MoreVertical } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
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
  createdAt?: Timestamp;
}

const subjectFormSchema = z.object({
  name: z.string().min(3, { message: "Nama mata pelajaran minimal 3 karakter." }),
  description: z.string().optional(),
  teacherUid: z.string().optional(), // To store the selected Firebase Auth UID
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
  const [authGuruUsers, setAuthGuruUsers] = useState<AuthUserMin[]>([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(true);
  const [isLoadingAuthUsers, setIsLoadingAuthUsers] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const { user, role, loading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const { isMobile } = useSidebar();

  const { toast } = useToast();

  const addSubjectForm = useForm<SubjectFormValues>({
    resolver: zodResolver(subjectFormSchema),
    defaultValues: {
      name: "",
      description: "",
      teacherUid: undefined,
    },
  });

  const editSubjectForm = useForm<EditSubjectFormValues>({
    resolver: zodResolver(editSubjectFormSchema),
  });

  const fetchAuthGuruUsers = async () => {
    if (role !== "admin") {
      setIsLoadingAuthUsers(false);
      return;
    }
    setIsLoadingAuthUsers(true);
    try {
      const usersCollectionRef = collection(db, "users");
      const q = query(usersCollectionRef, where("role", "==", "guru"), orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const fetchedUsers: AuthUserMin[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.data().uid,
        name: docSnap.data().name,
        email: docSnap.data().email,
      }));
      setAuthGuruUsers(fetchedUsers);
    } catch (error) {
      console.error("Error fetching auth guru users: ", error);
      toast({
        title: "Gagal Memuat Akun Guru",
        variant: "destructive",
      });
    } finally {
      setIsLoadingAuthUsers(false);
    }
  };

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
        createdAt: docSnap.data().createdAt,
      }));
      setSubjects(fetchedSubjects);
    } catch (error) {
      console.error("Error fetching subjects: ", error);
      toast({
        title: "Gagal Memuat Mata Pelajaran",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSubjects(false);
    }
  };

  useEffect(() => {
    if (role === "admin" && !authLoading) {
      fetchAuthGuruUsers();
    } else {
        setIsLoadingAuthUsers(false);
    }
  }, [role, authLoading]);

  useEffect(() => {
    if (!authLoading && role) {
        fetchSubjects();
    }
  }, [role, user, authLoading]);


  useEffect(() => {
    if (selectedSubject && isEditDialogOpen && role === "admin") {
      if (authGuruUsers.length === 0 && !isLoadingAuthUsers && role === "admin") {
        fetchAuthGuruUsers();
      }
      editSubjectForm.reset({
        id: selectedSubject.id,
        name: selectedSubject.name,
        description: selectedSubject.description || "",
        teacherUid: selectedSubject.teacherUid || undefined,
      });
    }
  }, [selectedSubject, isEditDialogOpen, editSubjectForm, role, authGuruUsers, isLoadingAuthUsers]);

  const handleAddSubjectSubmit: SubmitHandler<SubjectFormValues> = async (data) => {
    if (role !== "admin") return;
    addSubjectForm.clearErrors();
    const selectedTeacher = authGuruUsers.find(userAuth => userAuth.id === data.teacherUid);

    try {
      const subjectsCollectionRef = collection(db, "subjects");
      await addDoc(subjectsCollectionRef, {
        name: data.name,
        description: data.description || null,
        teacherUid: data.teacherUid === NO_RESPONSIBLE_TEACHER ? null : data.teacherUid || null,
        teacherName: selectedTeacher?.name || null,
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
    const selectedTeacher = authGuruUsers.find(userAuth => userAuth.id === data.teacherUid);

    try {
      const subjectDocRef = doc(db, "subjects", data.id);
      await updateDoc(subjectDocRef, {
        name: data.name,
        description: data.description || null,
        teacherUid: data.teacherUid === NO_RESPONSIBLE_TEACHER ? null : data.teacherUid || null,
        teacherName: selectedTeacher?.name || null,
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
    if (authGuruUsers.length === 0 && !isLoadingAuthUsers && role === "admin") {
        fetchAuthGuruUsers();
    }
    setSelectedSubject(subject);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (subject: Subject) => {
     if (role !== "admin") return;
    setSelectedSubject(subject);
  };

  const renderSubjectFormFields = (formInstance: typeof addSubjectForm | typeof editSubjectForm, formType: 'add' | 'edit') => (
    <>
      <div>
        <Label htmlFor={`${formType}-subject-name`}>Nama Mata Pelajaran</Label>
        <Input id={`${formType}-subject-name`} {...formInstance.register("name")} className="mt-1" />
        {formInstance.formState.errors.name && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.name.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-subject-description`}>Deskripsi (Opsional)</Label>
        <Textarea id={`${formType}-subject-description`} {...formInstance.register("description")} className="mt-1" />
      </div>
      {role === "admin" && (
        <div>
          <Label htmlFor={`${formType}-subject-teacherUid`}>Guru Penanggung Jawab (Opsional)</Label>
          <Controller
            name="teacherUid"
            control={formInstance.control}
            render={({ field }) => (
              <Select
                onValueChange={(value) => field.onChange(value === NO_RESPONSIBLE_TEACHER ? undefined : value)}
                value={field.value || NO_RESPONSIBLE_TEACHER}
                disabled={isLoadingAuthUsers}
              >
                <SelectTrigger id={`${formType}-subject-teacherUid`} className="mt-1">
                  <SelectValue placeholder={isLoadingAuthUsers ? "Memuat guru..." : "Pilih guru"} />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingAuthUsers && <SelectItem value="loading-auth" disabled>Memuat...</SelectItem>}
                  <SelectItem value={NO_RESPONSIBLE_TEACHER}>Tidak Ada / Kosongkan</SelectItem>
                  {authGuruUsers
                    .filter(authUser => authUser && typeof authUser.id === 'string' && authUser.id.length > 0)
                    .map((authUser) => (
                    <SelectItem key={authUser.id} value={authUser.id}>
                      {authUser.name} ({authUser.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
           {formInstance.formState.errors.teacherUid && (
            <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.teacherUid.message}</p>
          )}
        </div>
      )}
    </>
  );

  const pageDescription = role === "guru"
    ? "Daftar mata pelajaran yang menjadi tanggung jawab Anda."
    : "Kelola daftar mata pelajaran yang diajarkan.";

  const showSkeleton = isLoadingSubjects || authLoading || (role === "admin" && isLoadingAuthUsers);

  const displayedSubjects = useMemo(() => {
    if (role !== 'admin') return subjects;

    return subjects.filter(subject => {
      const lowerSearchTerm = searchTerm.toLowerCase();
      const nameMatch = subject.name.toLowerCase().includes(lowerSearchTerm);
      const teacherMatch = subject.teacherName ? subject.teacherName.toLowerCase().includes(lowerSearchTerm) : false;
      return nameMatch || teacherMatch;
    });
  }, [subjects, searchTerm, role]);

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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <BookOpen className="h-6 w-6 text-primary" />
            <span>Daftar Mata Pelajaran</span>
          </CardTitle>
          {role === "admin" && (
            <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
              setIsAddDialogOpen(isOpen);
              if (!isOpen) {
                addSubjectForm.reset();
                addSubjectForm.clearErrors();
              } else {
                if (authGuruUsers.length === 0 && !isLoadingAuthUsers) fetchAuthGuruUsers();
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
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
                    <Button type="submit" disabled={addSubjectForm.formState.isSubmitting || isLoadingAuthUsers}>
                      {addSubjectForm.formState.isSubmitting || isLoadingAuthUsers ? "Menyimpan..." : "Simpan Mata Pelajaran"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {role === 'admin' && (
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
              <Table className={cn(isMobile && "table-fixed w-full")}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={cn(isMobile ? "w-10 px-2 text-center" : "w-[50px]")}>No.</TableHead>
                    <TableHead className={cn("min-w-[150px]", isMobile && "px-2")}>Nama Mata Pelajaran</TableHead>
                    {!isMobile && <TableHead className="min-w-[250px]">Deskripsi</TableHead>}
                    <TableHead className={cn("min-w-[150px]", isMobile && "px-2")}>Guru Penanggung Jawab</TableHead>
                    {role === "admin" && <TableHead className={cn("text-right min-w-[100px]", isMobile ? "w-12 px-1" : "")}>Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentTableData.map((subject, index) => (
                    <TableRow key={subject.id}>
                      <TableCell className={cn(isMobile ? "px-2 text-center" : "")}>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                      <TableCell className={cn("font-medium truncate", isMobile && "px-2")} title={subject.name}>{subject.name}</TableCell>
                      {!isMobile && <TableCell className="truncate max-w-sm" title={subject.description || "-"}>{subject.description || "-"}</TableCell>}
                      <TableCell className={cn("truncate", isMobile && "px-2")} title={subject.teacherName || subject.teacherUid || "-"}>{subject.teacherName || subject.teacherUid || "-"}</TableCell>
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
                                      <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
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
              {role === "admin" ? (searchTerm ? 'Tidak ada mata pelajaran yang cocok dengan pencarian Anda.' : 'Tidak ada data mata pelajaran. Klik "Tambah Mata Pelajaran" untuk membuat data baru.') : 'Tidak ada mata pelajaran yang ditugaskan kepada Anda.'}
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
                  <Button type="submit" disabled={editSubjectForm.formState.isSubmitting || isLoadingAuthUsers}>
                    {editSubjectForm.formState.isSubmitting || isLoadingAuthUsers ? "Menyimpan..." : "Simpan Perubahan"}
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

