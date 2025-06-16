
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
import { Users, PlusCircle, Edit, Trash2, Search, Filter as FilterIcon, CalendarIcon } from "lucide-react"; 
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
  where,
  documentId
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext"; 
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { format, startOfDay } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";

interface ClassMin {
  id: string;
  name: string;
}

interface Student {
  id: string; 
  name: string;
  nis?: string; 
  email?: string; 
  classId: string; 
  className?: string; 
  dateOfBirth?: Timestamp;
  gender?: "laki-laki" | "perempuan";
  address?: string;
  createdAt?: Timestamp; 
}

const GENDERS = ["laki-laki", "perempuan"] as const;

const studentFormSchema = z.object({
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }),
  nis: z.string().min(5, { message: "NIS minimal 5 karakter." }),
  email: z.string().email({ message: "Format email tidak valid." }).optional().or(z.literal("")),
  classId: z.string({ required_error: "Pilih kelas." }), 
  dateOfBirth: z.date().optional(),
  gender: z.enum(GENDERS).optional(),
  address: z.string().optional(),
});
type StudentFormValues = z.infer<typeof studentFormSchema>;

const editStudentFormSchema = studentFormSchema.extend({
  id: z.string(),
});
type EditStudentFormValues = z.infer<typeof editStudentFormSchema>;

export default function StudentsPage() {
  const { user: authUser, role: authRole, loading: authLoading } = useAuth(); 
  const [students, setStudents] = useState<Student[]>([]);
  const [allClasses, setAllClasses] = useState<ClassMin[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isAddStudentDialogOpen, setIsAddStudentDialogOpen] = useState(false);
  const [isEditStudentDialogOpen, setIsEditStudentDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("all");

  const { toast } = useToast();

  const addStudentForm = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      name: "",
      nis: "",
      email: "",
      classId: undefined,
      dateOfBirth: undefined,
      gender: undefined,
      address: "",
    },
  });

  const editStudentForm = useForm<EditStudentFormValues>({
    resolver: zodResolver(editStudentFormSchema),
    defaultValues: { // Added defaultValues here for consistency
      name: "",
      nis: "",
      email: "",
      classId: undefined,
      dateOfBirth: undefined,
      gender: undefined,
      address: "",
    }
  });

  const fetchClassesForUserRole = async () => {
    setIsLoadingClasses(true);
    try {
      if (authRole === 'admin') {
        const classesCollectionRef = collection(db, "classes");
        const q = query(classesCollectionRef, orderBy("name", "asc"));
        const querySnapshot = await getDocs(q);
        setAllClasses(querySnapshot.docs.map(docSnap => ({ id: docSnap.id, name: docSnap.data().name })));
      } else if (authRole === 'guru' && authUser?.uid) {
        const teacherProfileQuery = query(collection(db, "teachers"), where("uid", "==", authUser.uid), limit(1));
        const teacherProfileSnapshot = await getDocs(teacherProfileQuery);

        if (teacherProfileSnapshot.empty) {
            setAllClasses([]);
            setIsLoadingClasses(false);
            return;
        }
        const teacherProfileId = teacherProfileSnapshot.docs[0].id;
        
        const lessonsQuery = query(collection(db, "lessons"), where("teacherId", "==", teacherProfileId));
        const lessonsSnapshot = await getDocs(lessonsQuery);
        
        const teacherClassIdsSet = new Set<string>();
        lessonsSnapshot.docs.forEach(doc => {
            const classId = doc.data().classId as string;
            if (classId) teacherClassIdsSet.add(classId);
        });
        const teacherClassIds = Array.from(teacherClassIdsSet);
        
        if (teacherClassIds.length === 0) {
          setAllClasses([]);
        } else {
            const CHUNK_SIZE_CLASSES = 30;
            const fetchedClasses: ClassMin[] = [];
            for (let i = 0; i < teacherClassIds.length; i += CHUNK_SIZE_CLASSES) {
                const chunk = teacherClassIds.slice(i, i + CHUNK_SIZE_CLASSES);
                if (chunk.length > 0) {
                     const classesQuery = query(collection(db, "classes"), where(documentId(), "in", chunk));
                     const classDetailsSnapshot = await getDocs(classesQuery);
                     classDetailsSnapshot.forEach(doc => fetchedClasses.push({ id: doc.id, name: doc.data().name }));
                }
            }
            setAllClasses(fetchedClasses.sort((a,b) => a.name.localeCompare(b.name)));
        }
      } else {
        setAllClasses([]);
      }
    } catch (error) {
      console.error("Error fetching classes for user role: ", error);
      toast({ title: "Gagal Memuat Daftar Kelas", variant: "destructive" });
      setAllClasses([]);
    } finally {
      setIsLoadingClasses(false);
    }
  };

  const fetchStudents = async () => {
    if (authLoading) return;
    setIsLoadingStudents(true);
    try {
      const usersCollectionRef = collection(db, "users");
      let finalFetchedStudents: Student[] = [];

      if (authRole === 'siswa' && authUser?.classId) {
        const studentsQuery = query(usersCollectionRef, where("role", "==", "siswa"), where("classId", "==", authUser.classId), orderBy("name", "asc"));
        const querySnapshot = await getDocs(studentsQuery);
        finalFetchedStudents = querySnapshot.docs.map(docSnap => ({
          id: docSnap.id,
          name: docSnap.data().name,
          nis: docSnap.data().nis,
          email: docSnap.data().email,
          classId: docSnap.data().classId,
          className: docSnap.data().className,
          dateOfBirth: docSnap.data().dateOfBirth,
          gender: docSnap.data().gender,
          address: docSnap.data().address,
          createdAt: docSnap.data().createdAt,
        }));
      } else if (authRole === 'guru' && authUser?.uid) {
        if (allClasses.length > 0) {
          const classIdsForTeacher = allClasses.map(c => c.id);
          const CHUNK_SIZE = 30;
          const studentPromises = [];

          for (let i = 0; i < classIdsForTeacher.length; i += CHUNK_SIZE) {
            const chunk = classIdsForTeacher.slice(i, i + CHUNK_SIZE);
            if (chunk.length > 0) {
              studentPromises.push(
                getDocs(query(usersCollectionRef, where("role", "==", "siswa"), where("classId", "in", chunk), orderBy("name", "asc")))
              );
            }
          }
          const snapshots = await Promise.all(studentPromises);
          snapshots.forEach(snapshot => {
            snapshot.docs.forEach(docSnap => {
              finalFetchedStudents.push({
                id: docSnap.id,
                name: docSnap.data().name,
                nis: docSnap.data().nis,
                email: docSnap.data().email,
                classId: docSnap.data().classId,
                className: docSnap.data().className,
                dateOfBirth: docSnap.data().dateOfBirth,
                gender: docSnap.data().gender,
                address: docSnap.data().address,
                createdAt: docSnap.data().createdAt,
              });
            });
          });
          finalFetchedStudents.sort((a,b) => a.name.localeCompare(b.name));
        }
      } else if (authRole === 'admin') {
        const studentsQuery = query(usersCollectionRef, where("role", "==", "siswa"), orderBy("name", "asc"));
        const querySnapshot = await getDocs(studentsQuery);
        finalFetchedStudents = querySnapshot.docs.map(docSnap => ({
          id: docSnap.id,
          name: docSnap.data().name,
          nis: docSnap.data().nis,
          email: docSnap.data().email,
          classId: docSnap.data().classId,
          className: docSnap.data().className,
          dateOfBirth: docSnap.data().dateOfBirth,
          gender: docSnap.data().gender,
          address: docSnap.data().address,
          createdAt: docSnap.data().createdAt,
        }));
      }
      setStudents(finalFetchedStudents);
    } catch (error) {
      console.error("Error fetching students: ", error);
      toast({ title: "Gagal Memuat Data Murid", variant: "destructive" });
      setStudents([]);
    } finally {
      setIsLoadingStudents(false);
    }
  };
  
  useEffect(() => {
    const initializePageData = async () => {
      if (!authLoading) {
        await fetchClassesForUserRole();
      }
    };
    initializePageData();
  }, [authRole, authUser, authLoading]);

  useEffect(() => {
    if (!authLoading && !isLoadingClasses) { 
        fetchStudents();
    }
  }, [authLoading, isLoadingClasses, allClasses]);


  useEffect(() => {
    if (selectedStudent && isEditStudentDialogOpen) {
      editStudentForm.reset({
        id: selectedStudent.id,
        name: selectedStudent.name,
        nis: selectedStudent.nis || "",
        email: selectedStudent.email || "",
        classId: selectedStudent.classId,
        dateOfBirth: selectedStudent.dateOfBirth ? selectedStudent.dateOfBirth.toDate() : undefined,
        gender: selectedStudent.gender,
        address: selectedStudent.address || "",
      });
    }
  }, [selectedStudent, isEditStudentDialogOpen, editStudentForm]);
  
  const displayedStudents = useMemo(() => {
    let filtered = students;
    if (selectedClassFilter !== "all") {
      filtered = filtered.filter(student => student.classId === selectedClassFilter);
    }
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(student =>
        student.name.toLowerCase().includes(lowerSearchTerm) ||
        (student.nis && student.nis.toLowerCase().includes(lowerSearchTerm)) ||
        (student.email && student.email.toLowerCase().includes(lowerSearchTerm))
      );
    }
    return filtered;
  }, [students, searchTerm, selectedClassFilter]);


  const handleAddStudentSubmit: SubmitHandler<StudentFormValues> = async (data) => {
    if (authRole !== 'admin') { // Only admin can add these new fields
        toast({ title: "Aksi Ditolak", description: "Hanya admin yang dapat menambahkan murid dengan detail ini.", variant: "destructive"});
        return;
    }
    addStudentForm.clearErrors();
    
    const selectedClassObj = allClasses.find(c => c.id === data.classId);
    if (!selectedClassObj) {
        toast({ title: "Kelas tidak valid", description: "Silakan pilih kelas yang valid untuk murid.", variant: "destructive" });
        return;
    }
    try {
      const studentDataForUsersCollection: any = {
        name: data.name,
        nis: data.nis,
        email: data.email || null,
        classId: selectedClassObj.id, 
        className: selectedClassObj.name, 
        role: 'siswa', 
        createdAt: serverTimestamp(),
      };

      if (authRole === 'admin') {
        if (data.dateOfBirth) {
          studentDataForUsersCollection.dateOfBirth = Timestamp.fromDate(startOfDay(data.dateOfBirth));
        }
        if (data.gender) {
          studentDataForUsersCollection.gender = data.gender;
        }
        if (data.address) {
          studentDataForUsersCollection.address = data.address;
        }
      }

      await addDoc(collection(db, "users"), studentDataForUsersCollection);
      toast({ title: "Murid Ditambahkan ke Profil", description: `${data.name} berhasil ditambahkan ke daftar profil.` });
      setIsAddStudentDialogOpen(false);
      addStudentForm.reset({ name: "", nis: "", email: "", classId: undefined, dateOfBirth: undefined, gender: undefined, address: "" });
      fetchStudents(); 
    } catch (error: any) {
      console.error("Error adding student:", error);
      let errorMessage = "Gagal menambahkan murid.";
       if (error.message && error.message.includes("Missing or insufficient permissions")) {
        errorMessage = "Anda tidak memiliki izin untuk menambahkan murid.";
      }
      toast({
        title: "Gagal Menambahkan Murid",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleEditStudentSubmit: SubmitHandler<EditStudentFormValues> = async (data) => {
    if (!selectedStudent) return;
     if (authRole !== 'admin') { // Only admin can edit these new fields
        toast({ title: "Aksi Ditolak", description: "Hanya admin yang dapat mengedit murid dengan detail ini.", variant: "destructive"});
        return;
    }
    editStudentForm.clearErrors();
    const selectedClass = allClasses.find(c => c.id === data.classId);
    if (!selectedClass) {
        toast({ title: "Kelas tidak valid", variant: "destructive" });
        return;
    }
    try {
      const studentDocRef = doc(db, "users", selectedStudent.id); 
      const updateData: any = {
        name: data.name,
        nis: data.nis,
        email: data.email || null,
        classId: data.classId,
        className: selectedClass.name, 
      };

      if (authRole === 'admin') {
        updateData.dateOfBirth = data.dateOfBirth ? Timestamp.fromDate(startOfDay(data.dateOfBirth)) : null;
        updateData.gender = data.gender || null;
        updateData.address = data.address || null;
      }
      
      await updateDoc(studentDocRef, updateData);
      
      toast({ title: "Data Murid Diperbarui", description: `${data.name} berhasil diperbarui.` });
      setIsEditStudentDialogOpen(false);
      setSelectedStudent(null);
      fetchStudents();
    } catch (error) {
      console.error("Error editing student:", error);
      toast({
        title: "Gagal Memperbarui Data Murid",
        variant: "destructive",
      });
    }
  };

  const handleDeleteStudent = async (studentId: string, studentName?: string) => {
    if (authRole !== 'admin' && authRole !== 'guru') {
        toast({ title: "Aksi Ditolak", description: "Hanya admin atau guru yang dapat menghapus murid.", variant: "destructive"});
        return;
    }
    try {
      await deleteDoc(doc(db, "users", studentId));
      toast({ title: "Data Murid Dihapus dari Profil", description: `${studentName || 'Murid'} berhasil dihapus dari daftar profil.` });
      setSelectedStudent(null); 
      fetchStudents();
    } catch (error) {
      console.error("Error deleting student:", error);
      toast({
        title: "Gagal Menghapus Murid",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (student: Student) => {
    if (authRole !== 'admin' && authRole !== 'guru') {
        toast({ title: "Aksi Ditolak", description: "Anda tidak memiliki izin untuk mengedit murid.", variant: "destructive"});
        return;
    }
    if (allClasses.length === 0 && !isLoadingClasses && (authRole === 'admin' || authRole === 'guru')) {
      fetchClassesForUserRole(); 
    }
    setSelectedStudent(student);
    setIsEditStudentDialogOpen(true);
  };
  
  const openDeleteDialog = (student: Student) => {
     if (authRole !== 'admin' && authRole !== 'guru') {
        toast({ title: "Aksi Ditolak", description: "Anda tidak memiliki izin untuk menghapus murid.", variant: "destructive"});
        return;
    }
    setSelectedStudent(student); 
  };
  
  const renderStudentFormFields = (formInstance: typeof addStudentForm | typeof editStudentForm, formType: 'add' | 'edit') => (
    <>
      <div>
        <Label htmlFor={`${formType}-student-name`}>Nama Lengkap</Label>
        <Input id={`${formType}-student-name`} {...formInstance.register("name")} className="mt-1" />
        {formInstance.formState.errors.name && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.name.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-student-nis`}>NIS</Label>
        <Input id={`${formType}-student-nis`} {...formInstance.register("nis")} className="mt-1" />
        {formInstance.formState.errors.nis && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.nis.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-student-email`}>Email (Opsional)</Label>
        <Input id={`${formType}-student-email`} type="email" {...formInstance.register("email")} className="mt-1" />
        {formInstance.formState.errors.email && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.email.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${formType}-student-classId`}>Kelas</Label>
        <Controller
          name="classId"
          control={formInstance.control}
          render={({ field }) => (
            <Select 
              onValueChange={field.onChange} 
              value={field.value || undefined} 
              disabled={isLoadingClasses}
            >
              <SelectTrigger id={`${formType}-student-classId`} className="mt-1">
                <SelectValue placeholder={isLoadingClasses ? "Memuat kelas..." : "Pilih kelas"} />
              </SelectTrigger>
              <SelectContent>
                {isLoadingClasses ? (
                  <SelectItem value="loading" disabled>Memuat kelas...</SelectItem>
                ) : allClasses.length === 0 ? (
                  <SelectItem value="no-classes" disabled>
                    {authRole === 'guru' ? "Tidak ada kelas yang Anda ajar" : "Tidak ada kelas tersedia"}
                  </SelectItem>
                ) : (
                  allClasses.map((classItem) => (
                    <SelectItem key={classItem.id} value={classItem.id}>
                      {classItem.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
        />
        {formInstance.formState.errors.classId && (
          <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.classId.message}</p>
        )}
      </div>
      {authRole === 'admin' && (
        <>
          <div>
            <Label htmlFor={`${formType}-student-dateOfBirth`}>Tanggal Lahir (Opsional)</Label>
            <Controller
              name="dateOfBirth"
              control={formInstance.control}
              render={({ field }) => (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className="w-full justify-start text-left font-normal mt-1"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {field.value ? format(field.value, "PPP", { locale: indonesiaLocale }) : <span>Pilih tanggal lahir</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => field.onChange(date ? startOfDay(date) : undefined)}
                      captionLayout="dropdown-buttons"
                      fromYear={1990}
                      toYear={new Date().getFullYear()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              )}
            />
            {formInstance.formState.errors.dateOfBirth && (
              <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.dateOfBirth.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor={`${formType}-student-gender`}>Jenis Kelamin (Opsional)</Label>
            <Controller
              name="gender"
              control={formInstance.control}
              render={({ field }) => (
                <Select
                  onValueChange={field.onChange}
                  value={field.value || undefined}
                >
                  <SelectTrigger id={`${formType}-student-gender`} className="mt-1">
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
            <Label htmlFor={`${formType}-student-address`}>Alamat (Opsional)</Label>
            <Textarea
              id={`${formType}-student-address`}
              {...formInstance.register("address")}
              className="mt-1"
              placeholder="Masukkan alamat lengkap murid"
            />
            {formInstance.formState.errors.address && (
              <p className="text-sm text-destructive mt-1">{formInstance.formState.errors.address.message}</p>
            )}
          </div>
        </>
      )}
    </>
  );

  const pageTitle = authRole === 'siswa' && authUser?.className 
    ? `Daftar Siswa Kelas ${authUser.className}` 
    : (authRole === 'guru' ? "Daftar Siswa (Kelas yang Diajar)" : "Manajemen Murid");
  
  const pageDescription = authRole === 'siswa' && authUser?.className
    ? `Daftar teman sekelas Anda.`
    : (authRole === 'guru' ? "Daftar siswa dari kelas-kelas yang mata pelajarannya Anda ampu." : "Kelola data murid, absensi, nilai, dan informasi terkait.");

  const showClassFilter = (authRole === 'admin' && allClasses.length > 0) || (authRole === 'guru' && allClasses.length > 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">{pageTitle}</h1>
        <p className="text-muted-foreground">{pageDescription}</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Users className="h-6 w-6 text-primary" />
            <span>Daftar Murid {isLoadingStudents ? '' : `(${displayedStudents.length} siswa)`}</span>
          </CardTitle>
          { (authRole === 'admin' || authRole === 'guru') && ( 
            <Dialog 
              open={isAddStudentDialogOpen} 
              onOpenChange={(isOpen) => {
                setIsAddStudentDialogOpen(isOpen);
                if (!isOpen) {
                  addStudentForm.reset({ name: "", nis: "", email: "", classId: undefined, dateOfBirth: undefined, gender: undefined, address: "" });
                  addStudentForm.clearErrors();
                } else {
                   if (allClasses.length === 0 && !isLoadingClasses) fetchClassesForUserRole();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <PlusCircle className="mr-2 h-4 w-4" /> Tambah Murid
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Tambah Murid Baru</DialogTitle>
                  <DialogDescription>
                    Isi detail murid untuk menambahkan data baru. Ini akan membuat profil di daftar murid.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={addStudentForm.handleSubmit(handleAddStudentSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                  {renderStudentFormFields(addStudentForm, 'add')}
                  <DialogFooter>
                    <DialogClose asChild>
                       <Button type="button" variant="outline">Batal</Button>
                    </DialogClose>
                    <Button type="submit" disabled={addStudentForm.formState.isSubmitting || isLoadingClasses}>
                      {(addStudentForm.formState.isSubmitting || isLoadingClasses) ? "Menyimpan..." : "Simpan Murid"}
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
                  placeholder="Cari nama, NIS, atau email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-full"
                />
              </div>
              {showClassFilter && (
                <Select
                  value={selectedClassFilter}
                  onValueChange={setSelectedClassFilter}
                  disabled={isLoadingClasses}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <FilterIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Filter per Kelas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Kelas</SelectItem>
                    {allClasses.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {isLoadingStudents || authLoading || ( (authRole === 'admin' || authRole === 'guru') && isLoadingClasses) ? (
             <div className="space-y-2 mt-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
             </div>
          ) : displayedStudents.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>NIS</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Kelas</TableHead>
                    {(authRole === 'admin' || authRole === 'guru') && <TableHead className="text-right">Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedStudents.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>{student.nis || "-"}</TableCell>
                      <TableCell>{student.email || "-"}</TableCell>
                      <TableCell>{student.className || student.classId}</TableCell>
                      {(authRole === 'admin' || authRole === 'guru') && (
                        <TableCell className="text-right space-x-2">
                          <Button variant="outline" size="icon" onClick={() => openEditDialog(student)} aria-label={`Edit ${student.name}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="icon" onClick={() => openDeleteDialog(student)} aria-label={`Hapus ${student.name}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            {selectedStudent && selectedStudent.id === student.id && ( 
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tindakan ini akan menghapus data murid <span className="font-semibold"> {selectedStudent?.name} </span> (NIS: {selectedStudent?.nis || 'N/A'}). Data yang dihapus tidak dapat dikembalikan.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel onClick={() => setSelectedStudent(null)}>Batal</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteStudent(selectedStudent.id, selectedStudent.name)}>
                                    Ya, Hapus Data
                                  </AlertDialogAction>
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
              {searchTerm || selectedClassFilter !== "all"
                ? "Tidak ada murid yang cocok dengan filter atau pencarian Anda."
                : (authRole === 'siswa' ? "Tidak ada siswa lain di kelas Anda." : 
                   authRole === 'guru' ? "Tidak ada data siswa di kelas yang mata pelajarannya Anda ajar atau filter yang dipilih tidak memiliki data." : 
                   "Tidak ada data murid untuk ditampilkan. Klik \"Tambah Murid\" untuk membuat data baru.")
              }
            </div>
          )}
        </CardContent>
      </Card>

      { (authRole === 'admin' || authRole === 'guru') && ( 
        <Dialog open={isEditStudentDialogOpen} onOpenChange={(isOpen) => {
            setIsEditStudentDialogOpen(isOpen);
            if (!isOpen) {
              setSelectedStudent(null);
              editStudentForm.clearErrors();
            }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Data Murid</DialogTitle>
              <DialogDescription>
                Perbarui detail data murid.
              </DialogDescription>
            </DialogHeader>
            {selectedStudent && (
              <form onSubmit={editStudentForm.handleSubmit(handleEditStudentSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <Input type="hidden" {...editStudentForm.register("id")} />
                {renderStudentFormFields(editStudentForm, 'edit')}
                <DialogFooter>
                   <DialogClose asChild>
                      <Button type="button" variant="outline" onClick={() => { setIsEditStudentDialogOpen(false); setSelectedStudent(null); }}>Batal</Button>
                   </DialogClose>
                  <Button type="submit" disabled={editStudentForm.formState.isSubmitting || isLoadingClasses}>
                    {(editStudentForm.formState.isSubmitting || isLoadingClasses) ? "Menyimpan..." : "Simpan Perubahan"}
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

