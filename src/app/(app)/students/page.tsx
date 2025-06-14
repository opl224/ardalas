
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
import { Users, PlusCircle, Edit, Trash2 } from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
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
  documentId // Added for 'in' queries on document IDs
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext"; 

interface ClassMin {
  id: string;
  name: string;
}

interface Student {
  id: string; 
  name: string;
  nis: string; 
  email?: string; 
  classId: string; 
  className?: string; 
  createdAt?: Timestamp; 
}

const studentFormSchema = z.object({
  name: z.string().min(3, { message: "Nama minimal 3 karakter." }),
  nis: z.string().min(5, { message: "NIS minimal 5 karakter." }),
  email: z.string().email({ message: "Format email tidak valid." }).optional().or(z.literal("")),
  classId: z.string({ required_error: "Pilih kelas." }), 
});
type StudentFormValues = z.infer<typeof studentFormSchema>;

const editStudentFormSchema = studentFormSchema.extend({
  id: z.string(),
});
type EditStudentFormValues = z.infer<typeof editStudentFormSchema>;

export default function StudentsPage() {
  const { user: authUser, role: authRole, loading: authLoading } = useAuth(); 
  const [students, setStudents] = useState<Student[]>([]);
  const [allClasses, setAllClasses] = useState<ClassMin[]>([]); // For admins, all classes. For teachers, classes they teach.
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isAddStudentDialogOpen, setIsAddStudentDialogOpen] = useState(false);
  const [isEditStudentDialogOpen, setIsEditStudentDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const { toast } = useToast();

  const addStudentForm = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      name: "",
      nis: "",
      email: "",
      classId: undefined,
    },
  });

  const editStudentForm = useForm<EditStudentFormValues>({
    resolver: zodResolver(editStudentFormSchema),
  });

  // Fetches classes relevant to the current user's role
  const fetchClassesForUserRole = async () => {
    setIsLoadingClasses(true);
    try {
      if (authRole === 'admin') {
        const classesCollectionRef = collection(db, "classes");
        const q = query(classesCollectionRef, orderBy("name", "asc"));
        const querySnapshot = await getDocs(q);
        setAllClasses(querySnapshot.docs.map(docSnap => ({ id: docSnap.id, name: docSnap.data().name })));
      } else if (authRole === 'guru' && authUser?.uid) {
        // 1. Find subjects taught by this teacher
        const subjectsQuery = query(collection(db, "subjects"), where("teacherUid", "==", authUser.uid));
        const subjectsSnapshot = await getDocs(subjectsQuery);
        const teacherSubjectIds = subjectsSnapshot.docs.map(doc => doc.id);

        if (teacherSubjectIds.length === 0) {
          setAllClasses([]);
          return;
        }

        // 2. Find lessons for these subjects
        const lessonsQuery = query(collection(db, "lessons"), where("subjectId", "in", teacherSubjectIds));
        const lessonsSnapshot = await getDocs(lessonsQuery);
        const teacherClassIds = Array.from(new Set(lessonsSnapshot.docs.map(doc => doc.data().classId as string).filter(id => id)));
        
        if (teacherClassIds.length === 0) {
          setAllClasses([]);
          return;
        }
        
        // 3. Fetch details for these classes (in chunks if necessary)
        const CHUNK_SIZE = 30;
        const fetchedClasses: ClassMin[] = [];
        for (let i = 0; i < teacherClassIds.length; i += CHUNK_SIZE) {
            const chunk = teacherClassIds.slice(i, i + CHUNK_SIZE);
            if (chunk.length > 0) {
                 const classesQuery = query(collection(db, "classes"), where(documentId(), "in", chunk), orderBy("name", "asc"));
                 const classDetailsSnapshot = await getDocs(classesQuery);
                 classDetailsSnapshot.forEach(doc => fetchedClasses.push({ id: doc.id, name: doc.data().name }));
            }
        }
        setAllClasses(fetchedClasses.sort((a,b) => a.name.localeCompare(b.name)));

      } else {
        // For siswa or other roles, no classes needed for dropdowns they don't see.
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
      const studentsCollectionRef = collection(db, "students");
      let studentsQuery;

      if (authRole === 'siswa' && authUser?.classId) {
        studentsQuery = query(studentsCollectionRef, where("classId", "==", authUser.classId), orderBy("name", "asc"));
      } else if (authRole === 'guru' && authUser?.uid) {
        // Use 'allClasses' which is already filtered for the teacher
        if (allClasses.length > 0) {
          const classIdsForTeacher = allClasses.map(c => c.id);
          // Firestore 'in' query limitation: max 30 elements. Chunk if necessary.
          const CHUNK_SIZE = 30;
          const fetchedStudentsPromises = [];
          for (let i = 0; i < classIdsForTeacher.length; i += CHUNK_SIZE) {
              const chunk = classIdsForTeacher.slice(i, i + CHUNK_SIZE);
              if (chunk.length > 0) {
                fetchedStudentsPromises.push(
                    getDocs(query(studentsCollectionRef, where("classId", "in", chunk), orderBy("name", "asc")))
                );
              }
          }
          const snapshots = await Promise.all(fetchedStudentsPromises);
          const fetchedStudents: Student[] = [];
          snapshots.forEach(snapshot => {
            snapshot.docs.forEach(docSnap => {
                fetchedStudents.push({
                    id: docSnap.id,
                    name: docSnap.data().name,
                    nis: docSnap.data().nis,
                    email: docSnap.data().email,
                    classId: docSnap.data().classId,
                    className: docSnap.data().className, 
                    createdAt: docSnap.data().createdAt,
                });
            });
          });
          setStudents(fetchedStudents.sort((a,b) => a.name.localeCompare(b.name)));
          setIsLoadingStudents(false);
          return; // Exit early as students are fetched based on filtered classes

        } else { // Teacher teaches no classes based on their subjects
          setStudents([]);
          setIsLoadingStudents(false);
          return;
        }
      } else if (authRole === 'admin') {
        studentsQuery = query(studentsCollectionRef, orderBy("name", "asc"));
      } else {
        setStudents([]);
        setIsLoadingStudents(false);
        return;
      }

      const querySnapshot = await getDocs(studentsQuery);
      const fetchedStudents: Student[] = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name,
        nis: docSnap.data().nis,
        email: docSnap.data().email,
        classId: docSnap.data().classId,
        className: docSnap.data().className, 
        createdAt: docSnap.data().createdAt,
      }));
      setStudents(fetchedStudents);
    } catch (error) {
      console.error("Error fetching students: ", error);
      toast({ title: "Gagal Memuat Data Murid", variant: "destructive" });
    } finally {
      setIsLoadingStudents(false);
    }
  };

  useEffect(() => {
    const initializePageData = async () => {
      if (!authLoading) {
        await fetchClassesForUserRole(); // Fetch classes first
        await fetchStudents();           // Then fetch students (which might depend on classes for teachers)
      }
    };
    initializePageData();
  }, [authRole, authUser, authLoading]); // Rerun if role or user changes


  useEffect(() => {
    if (selectedStudent && isEditStudentDialogOpen) {
      editStudentForm.reset({
        id: selectedStudent.id,
        name: selectedStudent.name,
        nis: selectedStudent.nis,
        email: selectedStudent.email || "",
        classId: selectedStudent.classId,
      });
    }
  }, [selectedStudent, isEditStudentDialogOpen, editStudentForm]);

  const handleAddStudentSubmit: SubmitHandler<StudentFormValues> = async (data) => {
    addStudentForm.clearErrors();
    
    const selectedClassObj = allClasses.find(c => c.id === data.classId);
    if (!selectedClassObj) {
        toast({ title: "Kelas tidak valid", description: "Silakan pilih kelas yang valid untuk murid.", variant: "destructive" });
        return;
    }

    try {
      const studentsCollectionRef = collection(db, "students");
      await addDoc(studentsCollectionRef, {
        name: data.name,
        nis: data.nis,
        email: data.email,
        classId: selectedClassObj.id, 
        className: selectedClassObj.name, 
        createdAt: serverTimestamp(),
      });
      
      toast({ title: "Murid Ditambahkan", description: `${data.name} berhasil ditambahkan.` });
      setIsAddStudentDialogOpen(false);
      addStudentForm.reset({ name: "", nis: "", email: "", classId: undefined });
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
    editStudentForm.clearErrors();
    const selectedClass = allClasses.find(c => c.id === data.classId);
    if (!selectedClass) {
        toast({ title: "Kelas tidak valid", variant: "destructive" });
        return;
    }
    try {
      const studentDocRef = doc(db, "students", data.id);
      await updateDoc(studentDocRef, {
        name: data.name,
        nis: data.nis,
        email: data.email,
        classId: data.classId,
        className: selectedClass.name, 
      });
      
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
    if (authRole === 'siswa') {
        toast({ title: "Aksi Ditolak", description: "Anda tidak memiliki izin untuk menghapus murid.", variant: "destructive"});
        return;
    }
    try {
      await deleteDoc(doc(db, "students", studentId));
      toast({ title: "Data Murid Dihapus", description: `${studentName || 'Murid'} berhasil dihapus.` });
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
    if (authRole === 'siswa') {
        toast({ title: "Aksi Ditolak", description: "Anda tidak memiliki izin untuk mengedit murid.", variant: "destructive"});
        return;
    }
    // Ensure classes are loaded for the dropdown if they weren't already
    if (allClasses.length === 0 && !isLoadingClasses && (authRole === 'admin' || authRole === 'guru')) {
      fetchClassesForUserRole(); 
    }
    setSelectedStudent(student);
    setIsEditStudentDialogOpen(true);
  };
  
  const openDeleteDialog = (student: Student) => {
    if (authRole === 'siswa') {
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
    </>
  );

  const pageTitle = authRole === 'siswa' && authUser?.className 
    ? `Daftar Siswa Kelas ${authUser.className}` 
    : (authRole === 'guru' ? "Daftar Siswa (Kelas yang Diajar)" : "Manajemen Murid");
  
  const pageDescription = authRole === 'siswa' && authUser?.className
    ? `Daftar teman sekelas Anda.`
    : (authRole === 'guru' ? "Daftar siswa dari kelas-kelas yang mata pelajarannya Anda ampu." : "Kelola data murid, absensi, nilai, dan informasi terkait.");


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
            <span>Daftar Murid {isLoadingStudents ? '' : `(${students.length} siswa)`}</span>
          </CardTitle>
          { (authRole === 'admin' || authRole === 'guru') && ( 
            <Dialog 
              open={isAddStudentDialogOpen} 
              onOpenChange={(isOpen) => {
                setIsAddStudentDialogOpen(isOpen);
                if (!isOpen) {
                  addStudentForm.reset({ name: "", nis: "", email: "", classId: undefined });
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
                    Isi detail murid untuk menambahkan data baru.
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
          {isLoadingStudents || authLoading || isLoadingClasses ? (
             <div className="space-y-2 mt-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
             </div>
          ) : students.length > 0 ? (
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
                  {students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>{student.nis}</TableCell>
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
                                    Tindakan ini akan menghapus data murid <span className="font-semibold"> {selectedStudent?.name} </span> (NIS: {selectedStudent?.nis}). Data yang dihapus tidak dapat dikembalikan.
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
              {authRole === 'siswa' ? "Tidak ada siswa lain di kelas Anda." : 
               authRole === 'guru' ? "Tidak ada data siswa di kelas yang mata pelajarannya Anda ajar." : 
               "Tidak ada data murid untuk ditampilkan. Klik \"Tambah Murid\" untuk membuat data baru."}
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

