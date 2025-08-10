

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
import { Users, PlusCircle, Edit, Trash2, LinkIcon as UidLinkIcon, MoreVertical, Eye, Search, Filter as FilterIcon, FileDown } from "lucide-react";
import Image from "next/image";
import { useState, useEffect, useMemo, type ReactNode } from "react";
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
import { format } from 'date-fns';
import { id as indonesiaLocale } from 'date-fns/locale';
import LottieLoader from "@/components/ui/LottieLoader";
import { useSidebar } from "@/components/ui/sidebar";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';


interface AuthUserMin {
  id: string; 
  name: string;
  email: string;
}

interface Teacher {
  id: string; 
  name: string;
  email: string; 
  subject: string; 
  nip?: string;
  address?: string;
  phone?: string;
  gender?: "laki-laki" | "perempuan";
  agama?: string;
  uid?: string; 
  createdAt?: Timestamp; 
}

const GENDERS = ["laki-laki", "perempuan"] as const;
const AGAMA_OPTIONS = ["Islam", "Kristen Protestan", "Katolik", "Hindu", "Buddha", "Khonghucu", "Lainnya"] as const;
const MAIN_SUBJECT_OPTIONS = ["Guru Kelas", "PAI", "Penjas"] as const;

const teacherFormSchema = z.object({
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }),
  email: z.string().email({ message: "Format email tidak valid." }), 
  nip: z.string().min(5, { message: "NIP minimal 5 karakter." }).optional().or(z.literal('')),
  subject: z.string().min(2, { message: "Mata pelajaran harus dipilih." }),
  address: z.string().trim().optional(),
  phone: z.string().trim().min(9, { message: "Nomor telepon minimal 9 digit." }).optional().or(z.literal('')),
  gender: z.enum(GENDERS, { required_error: "Pilih jenis kelamin." }),
  agama: z.string().optional(),
  authUserId: z.string().optional(), 
});
type TeacherFormValues = z.infer<typeof teacherFormSchema>;

const editTeacherFormSchema = teacherFormSchema.extend({
  id: z.string(),
});
type EditTeacherFormValues = z.infer<typeof editTeacherFormSchema>;

const NO_AUTH_USER_SELECTED = "_NO_AUTH_USER_";
const ITEMS_PER_PAGE = 10;

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [authGuruUsers, setAuthGuruUsers] = useState<AuthUserMin[]>([]);
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(true);
  const [isLoadingAuthUsers, setIsLoadingAuthUsers] = useState(true);
  const [isAddTeacherDialogOpen, setIsAddTeacherDialogOpen] = useState(false);
  const [isEditTeacherDialogOpen, setIsEditTeacherDialogOpen] = useState(false);
  const [isViewTeacherDialogOpen, setIsViewTeacherDialogOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [selectedTeacherForView, setSelectedTeacherForView] = useState<Teacher | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  const { toast } = useToast();
  const { isMobile } = useSidebar();

  const addTeacherForm = useForm<TeacherFormValues>({
    resolver: zodResolver(teacherFormSchema),
    defaultValues: {
      name: "",
      email: "",
      nip: "",
      subject: undefined,
      address: "",
      phone: "",
      gender: undefined,
      agama: undefined,
      authUserId: undefined,
    },
  });

  const editTeacherForm = useForm<EditTeacherFormValues>({
    resolver: zodResolver(editTeacherFormSchema),
  });

  const fetchAuthGuruUsers = async () => {
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

  const fetchTeachers = async () => {
    setIsLoadingTeachers(true);
    try {
      await fetchAuthGuruUsers(); 
      const teachersCollectionRef = collection(db, "teachers");
      const q = query(teachersCollectionRef, orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const fetchedTeachers: Teacher[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name,
        email: docSnap.data().email,
        subject: docSnap.data().subject,
        nip: docSnap.data().nip,
        address: docSnap.data().address,
        phone: docSnap.data().phone,
        gender: docSnap.data().gender,
        agama: docSnap.data().agama,
        uid: docSnap.data().uid, 
        createdAt: docSnap.data().createdAt,
      }));
      setTeachers(fetchedTeachers);
    } catch (error) {
      console.error("Error fetching teachers: ", error);
      toast({
        title: "Gagal Memuat Data Guru",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTeachers(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  useEffect(() => {
    if (selectedTeacher && isEditTeacherDialogOpen) {
      editTeacherForm.reset({
        id: selectedTeacher.id,
        name: selectedTeacher.name,
        email: selectedTeacher.email,
        subject: selectedTeacher.subject,
        nip: selectedTeacher.nip || "",
        address: selectedTeacher.address || "",
        phone: selectedTeacher.phone || "",
        gender: selectedTeacher.gender,
        agama: selectedTeacher.agama || "",
        authUserId: selectedTeacher.uid || undefined, 
      });
    }
  }, [selectedTeacher, isEditTeacherDialogOpen, editTeacherForm]);

  const handleAddTeacherSubmit: SubmitHandler<TeacherFormValues> = async (data) => {
    addTeacherForm.clearErrors();
    try {
      const teachersCollectionRef = collection(db, "teachers");
      // For adding, we no longer need to check for selectedTeacher as we are not linking it here.
      await addDoc(teachersCollectionRef, {
        name: data.name,
        email: data.email,
        subject: data.subject,
        nip: data.nip || null,
        address: data.address || null,
        phone: data.phone || null,
        gender: data.gender,
        agama: data.agama || null,
        uid: null, // Always null on creation from this form.
        createdAt: serverTimestamp(),
      });
      
      toast({ title: "Guru Ditambahkan", description: `${data.name} berhasil ditambahkan.` });
      setIsAddTeacherDialogOpen(false);
      addTeacherForm.reset({name: "", email: "", subject: undefined, nip: "", address: "", phone: "", gender: undefined, authUserId: undefined});
      fetchTeachers(); 
    } catch (error: any) {
      console.error("Error adding teacher profile:", error);
      toast({
        title: "Gagal Menambahkan Guru",
        variant: "destructive",
      });
    }
  };

  const handleEditTeacherSubmit: SubmitHandler<EditTeacherFormValues> = async (data) => {
    if (!selectedTeacher) return;
    editTeacherForm.clearErrors();
    try {
      const teacherDocRef = doc(db, "teachers", data.id);
      const selectedTeacherAuthUser = authGuruUsers.find(userAuth => userAuth.id === data.authUserId);
      await updateDoc(teacherDocRef, {
        name: data.name,
        email: data.email,
        subject: data.subject,
        nip: data.nip || null,
        address: data.address || null,
        phone: data.phone || null,
        gender: data.gender,
        agama: data.agama || null,
        uid: data.authUserId === NO_AUTH_USER_SELECTED ? null : data.authUserId || null, 
      });
      
      toast({ title: "Data Guru Diperbarui", description: `${data.name} berhasil diperbarui.` });
      setIsEditTeacherDialogOpen(false);
      setSelectedTeacher(null);
      fetchTeachers();
    } catch (error) {
      console.error("Error editing teacher profile:", error);
      toast({
        title: "Gagal Memperbarui Guru",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTeacher = async (teacherId: string, teacherName?: string) => {
    try {
      await deleteDoc(doc(db, "teachers", teacherId));
      toast({ title: "Data Guru Dihapus", description: `${teacherName || 'Guru'} berhasil dihapus.` });
      setSelectedTeacher(null); 
      fetchTeachers();
    } catch (error) {
      console.error("Error deleting teacher profile:", error);
      toast({
        title: "Gagal Menghapus Guru",
        variant: "destructive",
      });
    }
  };

  const openViewDialog = (teacher: Teacher) => {
    setSelectedTeacherForView(teacher);
    setIsViewTeacherDialogOpen(true);
  };

  const openEditDialog = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setIsEditTeacherDialogOpen(true);
  };
  
  const openDeleteDialog = (teacher: Teacher) => {
    setSelectedTeacher(teacher); 
  };

  const uniqueSubjects = useMemo(() => {
    const subjectsSet = new Set<string>();
    teachers.forEach(teacher => subjectsSet.add(teacher.subject));
    return Array.from(subjectsSet).sort();
  }, [teachers]);

  const filteredAndSearchedTeachers = useMemo(() => {
    return teachers
      .filter(teacher => {
        const matchesSubject = subjectFilter === "all" || teacher.subject === subjectFilter;
        const matchesSearchTerm = searchTerm === "" ||
          teacher.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          teacher.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          teacher.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (teacher.nip && teacher.nip.includes(searchTerm));
        return matchesSubject && matchesSearchTerm;
      });
  }, [teachers, searchTerm, subjectFilter]);

  const handleExport = async (formatType: 'pdf' | 'xlsx') => {
    if (filteredAndSearchedTeachers.length === 0) {
        toast({ title: "Tidak ada data untuk diekspor", variant: "info" });
        return;
    }
    setIsExporting(true);

    const fileName = `Data_Guru_${format(new Date(), "yyyyMMdd")}`;
    const title = `Data Guru - ${subjectFilter === 'all' ? 'Semua Mata Pelajaran' : subjectFilter}`;

    const dataToExport = filteredAndSearchedTeachers.map((teacher, index) => ({
      "No.": index + 1,
      "Nama": teacher.name,
      "NIP": teacher.nip || '-',
      "Email": teacher.email,
      "Mapel Utama": teacher.subject,
      "UID Akun": teacher.uid || 'Belum tertaut',
    }));

    try {
      if (formatType === 'pdf') {
        const doc = new jsPDF();
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
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data Guru");
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

  const totalPages = Math.ceil(filteredAndSearchedTeachers.length / ITEMS_PER_PAGE);
  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ITEMS_PER_PAGE;
    return filteredAndSearchedTeachers.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, filteredAndSearchedTeachers]);

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
  }, [searchTerm, subjectFilter]);


  const renderTeacherFormFields = (formInstance: typeof addTeacherForm | typeof editTeacherForm, formType: 'add' | 'edit') => (
    <>
      <div>
        <Label htmlFor={`${formType}-name`}>Nama Lengkap<span className="text-destructive">*</span></Label>
        <Input id={`${formType}-name`} {...formInstance.register("name")} className="mt-1" />
        {formInstance.formState.errors.name && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.name.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-nip`}>NIP</Label>
        <Input id={`${formType}-nip`} {...formInstance.register("nip")} className="mt-1" placeholder="Nomor Induk Pegawai" />
        {formInstance.formState.errors.nip && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.nip.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-email`}>Email<span className="text-destructive">*</span></Label>
        <Input id={`${formType}-email`} type="email" {...formInstance.register("email")} className="mt-1" />
        {formInstance.formState.errors.email && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.email.message}</p>
        )}
      </div>
       {formType === 'edit' && (
        <div>
          <Label htmlFor={`${formType}-authUserId`}>Akun Pengguna Terkait (Firebase Auth)</Label>
          <Controller
            name="authUserId"
            control={formInstance.control}
            render={({ field }) => (
              <Select
                onValueChange={(value) => field.onChange(value === NO_AUTH_USER_SELECTED ? undefined : value)}
                value={field.value || NO_AUTH_USER_SELECTED}
                disabled={isLoadingAuthUsers}
              >
                <SelectTrigger id={`${formType}-authUserId`} className="mt-1">
                  <SelectValue placeholder={isLoadingAuthUsers ? "Memuat akun..." : "Pilih akun pengguna guru"} />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingAuthUsers && <SelectItem key="loading-auth-users" value="loading" disabled>Memuat...</SelectItem>}
                  <SelectItem key="no-auth-user-option" value={NO_AUTH_USER_SELECTED}>Tidak ditautkan / Tautkan nanti</SelectItem>
                  {authGuruUsers
                    .filter(authUser => authUser && typeof authUser.id === 'string' && authUser.id.length > 0)
                    .map((authUser) => (
                    <SelectItem key={authUser.id} value={authUser.id}>
                      {authUser.name} ({authUser.email})
                    </SelectItem>
                  ))}
                  {!isLoadingAuthUsers && authGuruUsers.length === 0 && (
                    <SelectItem key="no-auth-users-found" value="no-users" disabled>Tidak ada akun guru di User Admin.</SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Pilih akun pengguna yang sudah terdaftar di Administrasi Pengguna dengan peran 'Guru'.
          </p>
          {formInstance.formState.errors.authUserId && (
            <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.authUserId.message}</p>
          )}
        </div>
      )}
      <div>
        <Label htmlFor={`${formType}-subject`}>Mata Pelajaran Utama <span className="text-destructive">*</span></Label>
        <Controller
            name="subject"
            control={formInstance.control}
            render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger id={`${formType}-subject`} className="mt-1">
                        <SelectValue placeholder="Pilih mata pelajaran utama" />
                    </SelectTrigger>
                    <SelectContent>
                        {MAIN_SUBJECT_OPTIONS.map((subject) => (
                            <SelectItem key={subject} value={subject}>
                                {subject}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        />
        {formInstance.formState.errors.subject && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.subject.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-address`}>Alamat</Label>
        <Textarea id={`${formType}-address`} {...formInstance.register("address")} className="mt-1" />
      </div>
      <div>
        <Label htmlFor={`${formType}-phone`}>Nomor Telepon</Label>
        <Input id={`${formType}-phone`} type="tel" {...formInstance.register("phone")} className="mt-1" />
        {formInstance.formState.errors.phone && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.phone.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-gender`}>Jenis Kelamin <span className="text-destructive">*</span></Label>
        <Controller
            name="gender"
            control={formInstance.control}
            render={({ field }) => (
                <Select
                    onValueChange={(value) => field.onChange(value as "laki-laki" | "perempuan")}
                    value={field.value || undefined}
                >
                <SelectTrigger id={`${formType}-gender`} className="mt-1">
                    <SelectValue placeholder="Pilih jenis kelamin" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="laki-laki">Laki-laki</SelectItem>
                    <SelectItem value="perempuan">Perempuan</SelectItem>
                </SelectContent>
                </Select>
            )}
        />
        {formInstance.formState.errors.gender && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.gender.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-agama`}>Agama</Label>
        <Controller
          name="agama"
          control={formInstance.control}
          render={({ field }) => (
            <Select
              onValueChange={(value) => field.onChange(value === "_NONE_" ? undefined : value)}
              value={field.value || "_NONE_"}
            >
              <SelectTrigger id={`${formType}-agama`} className="mt-1">
                <SelectValue placeholder="Pilih agama" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_NONE_">Tidak ditentukan</SelectItem>
                {AGAMA_OPTIONS.map((agama) => (
                  <SelectItem key={agama} value={agama}>
                    {agama}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Guru</h1>
        <p className="text-muted-foreground">Kelola data guru. Akun login dibuat terpisah di Administrasi Pengguna.</p>
      </div>
      <Dialog open={isAddTeacherDialogOpen} onOpenChange={(isOpen) => {
        setIsAddTeacherDialogOpen(isOpen);
        if (!isOpen) {
          addTeacherForm.reset({name: "", email: "", subject: undefined, nip: "", address: "", phone: "", gender: undefined, authUserId: undefined});
          addTeacherForm.clearErrors();
        }
      }}>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardHeader className="pb-4">
              {/* Desktop Header */}
              <div className="hidden md:flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Users className="h-6 w-6 text-primary" />
                  <span>Daftar Guru</span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <DialogTrigger asChild>
                    <Button size="sm"><PlusCircle className="mr-2 h-4 w-4" />Tambah Guru</Button>
                  </DialogTrigger>
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
              </div>
              {/* Mobile Header */}
              <div className="flex flex-col gap-4 md:hidden">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Users className="h-6 w-6 text-primary" />
                    <span>Daftar Guru</span>
                  </CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" disabled={isExporting}>
                        {isExporting ? <LottieLoader width={16} height={16} /> : <FileDown className="h-4 w-4" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleExport('xlsx')} disabled={isExporting}>Excel (.xlsx)</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExport('pdf')} disabled={isExporting}>PDF (.pdf)</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <DialogTrigger asChild>
                  <Button size="sm" className="w-full"><PlusCircle className="mr-2 h-4 w-4" />Tambah Guru</Button>
                </DialogTrigger>
              </div>
          </CardHeader>
          <CardContent>
            <div className="my-4 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-grow">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, email, NIP, atau mapel..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-full"
                />
              </div>
              <Select
                value={subjectFilter}
                onValueChange={setSubjectFilter}
                disabled={isLoadingTeachers || uniqueSubjects.length === 0}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <FilterIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Filter per Mapel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Mata Pelajaran</SelectItem>
                  {uniqueSubjects.map((subject) => (
                    <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isLoadingTeachers || isLoadingAuthUsers ? (
              <div className="space-y-2 mt-4">
                  {[...Array(ITEMS_PER_PAGE)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : currentTableData.length > 0 ? (
              <>
              <div className="overflow-x-auto">
                <Table className="w-full table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className={cn(isMobile ? "w-10 px-2 text-center" : "w-[50px]")}>No.</TableHead>
                      <TableHead className={cn(isMobile ? "w-2/5 px-2" : "w-1/4")}>Nama</TableHead>
                      {!isMobile && <TableHead className="w-1/6">NIP</TableHead>}
                      {!isMobile && <TableHead className="w-1/5">Email</TableHead>}
                      <TableHead className={cn(isMobile ? "w-2/5 px-2" : "w-1/6")}>Mapel</TableHead>
                      {!isMobile && <TableHead className="w-[80px]">Gender</TableHead>}
                      {!isMobile && <TableHead className="w-1/6">UID Akun Tertaut</TableHead>}
                      <TableHead className={cn("text-center", isMobile ? "w-12 px-1" : "w-16")}>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentTableData.map((teacher, index) => (
                      <TableRow key={teacher.id}>
                        <TableCell className={cn(isMobile ? "px-2 text-center" : "")}>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className={cn("font-medium truncate", isMobile ? "px-2" : "")} title={teacher.name}>{teacher.name}</TableCell>
                        {!isMobile && <TableCell className="truncate" title={teacher.nip}>{teacher.nip || "-"}</TableCell>}
                        {!isMobile && <TableCell className="truncate" title={teacher.email}>{teacher.email}</TableCell>}
                        <TableCell className={cn("truncate", isMobile ? "px-2" : "")} title={teacher.subject}>{teacher.subject}</TableCell>
                        {!isMobile && (
                          <TableCell>
                            {teacher.gender === "laki-laki" ? 
                              <Image src="/avatars/laki-laki.png" alt="Laki-laki" width={24} height={24} className="rounded-full" data-ai-hint="male avatar" /> :
                            teacher.gender === "perempuan" ? 
                              <Image src="/avatars/perempuan.png" alt="Perempuan" width={24} height={24} className="rounded-full" data-ai-hint="female avatar" /> : 
                            "-"}
                          </TableCell>
                        )}
                        {!isMobile && (
                          <TableCell className="font-mono text-xs truncate" title={teacher.uid}>
                            {teacher.uid ? (
                              <div className="flex items-center gap-1">
                                <UidLinkIcon className="h-3 w-3 text-muted-foreground shrink-0" /> 
                                <span className="truncate">{teacher.uid}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">Belum tertaut</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className={cn("text-center", isMobile ? "px-1" : "")}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Opsi untuk ${teacher.name}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openViewDialog(teacher)}>
                                <Eye className="mr-2 h-4 w-4" />
                                Lihat Detail
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(teacher)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      e.preventDefault(); 
                                      openDeleteDialog(teacher);
                                    }}
                                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Hapus
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                {selectedTeacher && selectedTeacher.id === teacher.id && ( 
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Apakah Kamu Yakin?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Tindakan ini akan menghapus data guru <span className="font-semibold"> {selectedTeacher?.name} </span>. Ini tidak menghapus akun pengguna Auth terkait (jika ada).
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel onClick={() => setSelectedTeacher(null)}>Batal</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteTeacher(selectedTeacher.id, selectedTeacher.name)}>
                                        Ya, Hapus Data
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                )}
                              </AlertDialog>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
                {searchTerm || subjectFilter !== "all" 
                  ? "Tidak ada data guru yang cocok dengan filter atau pencarian."
                  : "Tidak ada data guru. Klik \"Tambah Guru\" untuk membuat data baru."
                }
              </div>
            )}
          </CardContent>
        </Card>
        <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Tambah Guru Baru</DialogTitle><DialogDescription>Isi detail data guru. Penautan ke akun login akan dilakukan di Administrasi Pengguna.</DialogDescription></DialogHeader>
            <form onSubmit={addTeacherForm.handleSubmit(handleAddTeacherSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            {renderTeacherFormFields(addTeacherForm, 'add')}
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose><Button type="submit" disabled={addTeacherForm.formState.isSubmitting}>{addTeacherForm.formState.isSubmitting ? "Memproses..." : "Simpan Guru"}</Button></DialogFooter>
            </form>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isViewTeacherDialogOpen} onOpenChange={(isOpen) => {
          setIsViewTeacherDialogOpen(isOpen);
          if (!isOpen) { setSelectedTeacherForView(null); }
      }}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Detail Guru: {selectedTeacherForView?.name}</DialogTitle>
                <DialogDescription>Informasi lengkap mengenai guru.</DialogDescription>
            </DialogHeader>
            {selectedTeacherForView && (
                <div className="space-y-3 py-4 text-sm max-h-[60vh] overflow-y-auto pr-2">
                    <div><Label className="text-muted-foreground">Nama Lengkap:</Label><p className="font-medium">{selectedTeacherForView.name}</p></div>
                    <div><Label className="text-muted-foreground">NIP:</Label><p className="font-medium">{selectedTeacherForView.nip || "-"}</p></div>
                    <div><Label className="text-muted-foreground">Email:</Label><p className="font-medium">{selectedTeacherForView.email}</p></div>
                    <div><Label className="text-muted-foreground">Mata Pelajaran Utama:</Label><p className="font-medium">{selectedTeacherForView.subject}</p></div>
                    <div><Label className="text-muted-foreground">Jenis Kelamin:</Label><p className="font-medium capitalize">{selectedTeacherForView.gender || "-"}</p></div>
                    <div><Label className="text-muted-foreground">Agama:</Label><p className="font-medium">{selectedTeacherForView.agama || "-"}</p></div>
                    <div><Label className="text-muted-foreground">Nomor Telepon:</Label><p className="font-medium">{selectedTeacherForView.phone || "-"}</p></div>
                    <div><Label className="text-muted-foreground">Alamat:</Label><p className="font-medium whitespace-pre-line">{selectedTeacherForView.address || "-"}</p></div>
                    <div>
                        <Label className="text-muted-foreground">UID Akun Tertaut:</Label>
                        {selectedTeacherForView.uid ? (
                            <p className="font-mono text-xs flex items-center gap-1">
                                <UidLinkIcon className="h-3.5 w-3.5 text-muted-foreground" /> {selectedTeacherForView.uid}
                            </p>
                        ) : (
                            <p className="italic text-muted-foreground">Belum ditautkan ke akun pengguna.</p>
                        )}
                    </div>
                     {selectedTeacherForView.createdAt && (
                       <div>
                          <Label className="text-muted-foreground">Tanggal Dibuat:</Label>
                          <p className="font-medium">{format(selectedTeacherForView.createdAt.toDate(), "dd MMMM yyyy, HH:mm", { locale: indonesiaLocale })}</p>
                       </div>
                    )}
                </div>
            )}
            <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Tutup</Button></DialogClose>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditTeacherDialogOpen} onOpenChange={(isOpen) => {
          setIsEditTeacherDialogOpen(isOpen);
          if (!isOpen) {
            setSelectedTeacher(null);
            editTeacherForm.clearErrors();
          }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Data Guru</DialogTitle>
            <DialogDescription>
              Perbarui detail data guru dan penautan akun pengguna.
            </DialogDescription>
          </DialogHeader>
          {selectedTeacher && (
            <form onSubmit={editTeacherForm.handleSubmit(handleEditTeacherSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <Input type="hidden" {...editTeacherForm.register("id")} />
              {renderTeacherFormFields(editTeacherForm, 'edit')}
              <DialogFooter>
                 <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={() => { setIsEditTeacherDialogOpen(false); setSelectedTeacher(null); }}>Batal</Button>
                 </DialogClose>
                <Button type="submit" disabled={editTeacherForm.formState.isSubmitting || isLoadingAuthUsers}>
                  {editTeacherForm.formState.isSubmitting || isLoadingAuthUsers ? "Memproses..." : "Simpan Perubahan"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

