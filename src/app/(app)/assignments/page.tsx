

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
import { ClipboardCheck, PlusCircle, Edit, Trash2, CalendarIcon, DownloadCloud, Send, Eye, BarChart3, Link as LinkIcon, GraduationCap, FilePenLine, MoreVertical, Search, Filter as FilterIcon, BookOpen, Users } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, isPast, startOfDay } from "date-fns";
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
  writeBatch,
  limit
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import NextLink from "next/link";
import { cn } from "@/lib/utils";
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
import { useSidebar } from "@/components/ui/sidebar";


interface SubjectMin { id: string; name: string; }
interface ClassMin { id: string; name: string; }
interface TeacherMin { id: string; name: string; }


interface AssignmentResultInfo {
  id?: string;
  score?: number;
  maxScore?: number;
  grade?: string;
  feedback?: string;
  dateOfAssessment?: Timestamp;
}

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
  meetingNumber?: number;
  createdAt?: Timestamp;

  submissionStatus?: "Belum Dikerjakan" | "Sudah Dikerjakan" | "Terlambat";
  studentSubmissionLink?: string;
  studentSubmissionNotes?: string;
  submissionTimestamp?: Timestamp;
  result?: AssignmentResultInfo;

  submissionCount?: number;
  totalStudentsInClass?: number;
}

interface AssignmentSubmission {
  id?: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  classId: string;
  className?: string;
  submissionLink: string;
  submittedAt: Timestamp;
  notes?: string;
  teacherFileURL?: string;
}


interface FetchedResultData {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  assessmentType: string;
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


const assignmentFormSchema = z.object({
  title: z.string().min(1, { message: "Judul tugas wajib diisi." }),
  subjectId: z.string({ required_error: "Pilih mata pelajaran." }),
  classId: z.string({ required_error: "Pilih kelas." }),
  teacherId: z.string({ required_error: "Pilih guru pemberi tugas." }),
  dueDate: z.date({ required_error: "Batas waktu harus diisi." }),
  description: z.string().optional(),
  fileURL: z.string().url({ message: "Format URL file tidak valid." }).optional().or(z.literal("")),
  meetingNumber: z.coerce.number().positive("Pertemuan harus angka positif.").optional(),
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

const ITEMS_PER_PAGE = 10;

export default function AssignmentsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const [allAssignments, setAllAssignments] = useState<AssignmentData[]>([]); 
  
  const [subjects, setSubjects] = useState<SubjectMin[]>([]);
  const [classes, setClasses] = useState<ClassMin[]>([]);
  const [teachers, setTeachers] = useState<TeacherMin[]>([]); 

  const [teacherProfileId, setTeacherProfileId] = useState<string | null>(null);
  const [teacherUniqueClassCount, setTeacherUniqueClassCount] = useState<number | null>(null);
  const [teacherTaughtClassesForFilter, setTeacherTaughtClassesForFilter] = useState<ClassMin[]>([]);
  const [teacherTaughtSubjectsForFilter, setTeacherTaughtSubjectsForFilter] = useState<SubjectMin[]>([]);
  const [isLoadingTeacherSpecificData, setIsLoadingTeacherSpecificData] = useState(false);
  const [meetingNumberFilter, setMeetingNumberFilter] = useState<string>("");


  const [studentSubmissions, setStudentSubmissions] = useState<Map<string, AssignmentSubmission>>(new Map());
  const [submissionsForCurrentAssignment, setSubmissionsForCurrentAssignment] = useState<AssignmentSubmission[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentData | null>(null);

  const [isSubmitAssignmentDialogOpen, setIsSubmitAssignmentDialogOpen] = useState(false);
  const [selectedAssignmentForSubmission, setSelectedAssignmentForSubmission] = useState<AssignmentData | null>(null);

  const [isViewSubmissionsDialogOpen, setIsViewSubmissionsDialogOpen] = useState(false);
  const [selectedAssignmentToViewSubmissions, setSelectedAssignmentToViewSubmissions] = useState<AssignmentData | null>(null);

  const [isViewResultDialogOpen, setIsViewResultDialogOpen] = useState(false);
  const [selectedAssignmentForViewingResult, setSelectedAssignmentForViewingResult] = useState<AssignmentData | null>(null);
  
  const [isViewDetailDialogOpen, setIsViewDetailDialogOpen] = useState(false);
  const [selectedAssignmentForDetail, setSelectedAssignmentForDetail] = useState<AssignmentData | null>(null);


  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("all");
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);


  const { toast } = useToast();
  const { isMobile } = useSidebar();

  const addAssignmentForm = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: { 
      title: "", 
      subjectId: undefined, 
      classId: undefined, 
      teacherId: undefined, 
      dueDate: (() => {
        const todayEndOfDay = new Date();
        todayEndOfDay.setHours(23, 59, 0, 0);
        return todayEndOfDay;
      })(), 
      description: "", 
      fileURL: "", 
      meetingNumber: undefined 
    },
  });

  const editAssignmentForm = useForm<EditAssignmentFormValues>({ resolver: zodResolver(editAssignmentFormSchema) });

  const studentSubmitForm = useForm<StudentSubmissionFormValues>({
    resolver: zodResolver(studentSubmissionFormSchema),
    defaultValues: { submissionLink: "", notes: "" },
  });

  const isStudentRole = role === "siswa";
  const isTeacherRole = role === "guru";
  const isAdminRole = role === "admin";
  const isParentRole = role === "orangtua";
  const isTeacherOrAdminRole = isTeacherRole || isAdminRole;
  const canSubmitAssignment = isStudentRole || isParentRole;

  const fetchAdminDropdownData = async () => {
    if (!isAdminRole) return;
    try {
      const [subjectsSnapshot, classesSnapshot, teachersSnapshot, usersSnapshot] = await Promise.all([
        getDocs(query(collection(db, "subjects"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "classes"), orderBy("name", "asc"))),
        getDocs(query(collection(db, "teachers"), orderBy("name", "asc"))),
        getDocs(collection(db, "users"))
      ]);
      setSubjects(subjectsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));

      const classData = classesSnapshot.docs.map(doc => {
        const classId = doc.id;
        const studentCount = usersSnapshot.docs.filter(sDoc => sDoc.data().role === "siswa" && sDoc.data().classId === classId).length;
        return { id: classId, name: doc.data().name, totalStudents: studentCount };
      });
      setClasses(classData.map(c => ({id: c.id, name: c.name})));

      setTeachers(teachersSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    } catch (error) {
      console.error("Error fetching admin dropdown data: ", error);
      toast({ title: "Gagal Memuat Data Pendukung Admin", variant: "destructive" });
    }
  };
  
 useEffect(() => {
    const fetchTeacherSpecificData = async () => {
      if (!user || !isTeacherRole || !user.uid) {
        setIsLoadingTeacherSpecificData(false);
        return;
      }
      setIsLoadingTeacherSpecificData(true);
      try {
        const teacherProfileQuery = query(collection(db, "teachers"), where("uid", "==", user.uid), limit(1));
        const teacherProfileSnapshot = await getDocs(teacherProfileQuery);

        if (teacherProfileSnapshot.empty) {
          toast({ title: "Profil Guru Tidak Ditemukan", variant: "warning" });
          setTeacherProfileId(null);
          setTeacherUniqueClassCount(0);
          setTeacherTaughtClassesForFilter([]);
          setTeacherTaughtSubjectsForFilter([]);
          return;
        }
        const currentTeacherProfileId = teacherProfileSnapshot.docs[0].id;
        setTeacherProfileId(currentTeacherProfileId);

        const lessonsQuery = query(collection(db, "lessons"), where("teacherId", "==", currentTeacherProfileId));
        const lessonsSnapshot = await getDocs(lessonsQuery);
        
        const uniqueClassIds = new Set<string>();
        const uniqueSubjectIds = new Set<string>();
        lessonsSnapshot.docs.forEach(doc => {
          uniqueClassIds.add(doc.data().classId);
          uniqueSubjectIds.add(doc.data().subjectId);
        });
        setTeacherUniqueClassCount(uniqueClassIds.size);

        if (uniqueClassIds.size > 0) {
          const classChunks = [];
          const classIdsArray = Array.from(uniqueClassIds);
          for (let i = 0; i < classIdsArray.length; i += 30) { classChunks.push(classIdsArray.slice(i, i + 30)); }
          const classPromises = classChunks.map(chunk => getDocs(query(collection(db, "classes"), where(documentId(), "in", chunk))));
          const classSnapshots = await Promise.all(classPromises);
          const fetchedClasses: ClassMin[] = [];
          classSnapshots.forEach(snap => snap.docs.forEach(d => fetchedClasses.push({ id: d.id, name: d.data().name })));
          setTeacherTaughtClassesForFilter(fetchedClasses.sort((a, b) => a.name.localeCompare(b.name)));
        } else {
          setTeacherTaughtClassesForFilter([]);
        }

        if (uniqueSubjectIds.size > 0) {
          const subjectChunks = [];
          const subjectIdsArray = Array.from(uniqueSubjectIds);
          for (let i = 0; i < subjectIdsArray.length; i += 30) { subjectChunks.push(subjectIdsArray.slice(i, i + 30)); }
          const subjectPromises = subjectChunks.map(chunk => getDocs(query(collection(db, "subjects"), where(documentId(), "in", chunk))));
          const subjectSnapshots = await Promise.all(subjectPromises);
          const fetchedSubjects : SubjectMin[] = [];
          subjectSnapshots.forEach(snap => snap.docs.forEach(d => fetchedSubjects.push({ id: d.id, name: d.data().name })));
          setTeacherTaughtSubjectsForFilter(fetchedSubjects.sort((a, b) => a.name.localeCompare(b.name)));
        } else {
          setTeacherTaughtSubjectsForFilter([]);
        }

      } catch (error) {
        console.error("Error fetching teacher specific data:", error);
        toast({ title: "Gagal Memuat Data Guru", variant: "destructive" });
      } finally {
        setIsLoadingTeacherSpecificData(false);
      }
    };

    if (isTeacherRole) {
      fetchTeacherSpecificData();
    }
  }, [user, isTeacherRole, toast]);


  const fetchAssignments = async () => {
    setIsLoading(true);
    try {
      if (!user || !role) {
          setIsLoading(false);
          setAllAssignments([]);
          return;
      }

      if (isAdminRole) {
        await fetchAdminDropdownData();
      }

      let assignmentsQueryRef = collection(db, "assignments");
      let finalAssignmentsQuery;
      let studentToQueryId: string | null = null;
      let classToQueryId: string | null = null;

      if (isStudentRole && user.uid) {
        studentToQueryId = user.uid;
        classToQueryId = user.classId;
      } else if (isParentRole && user.linkedStudentId) {
        studentToQueryId = user.linkedStudentId;
        classToQueryId = user.linkedStudentClassId;
      }

      if (isStudentRole || isParentRole) {
          if (classToQueryId) {
            finalAssignmentsQuery = query(assignmentsQueryRef, where("classId", "==", classToQueryId), orderBy("dueDate", "desc"));
          } else {
              setAllAssignments([]);
              setIsLoading(false);
              return;
          }
      } else if (isTeacherRole) {
          if (!teacherProfileId) {
            setIsLoading(false); 
            return; 
          }
          finalAssignmentsQuery = query(assignmentsQueryRef, where("teacherId", "==", teacherProfileId), orderBy("dueDate", "desc"));
      } else if (isAdminRole) {
        finalAssignmentsQuery = query(assignmentsQueryRef, orderBy("dueDate", "desc"));
      } else {
         setAllAssignments([]); setIsLoading(false); return;
      }


      const querySnapshot = await getDocs(finalAssignmentsQuery);
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
          meetingNumber: data.meetingNumber,
          createdAt: data.createdAt,
        };
      });

      if (studentToQueryId && fetchedAssignments.length > 0) {
        const submissionsSnapshot = await getDocs(query(collection(db, "assignmentSubmissions"), where("studentId", "==", studentToQueryId)));
        const userSubs = new Map<string, AssignmentSubmission>();
        submissionsSnapshot.forEach(doc => {
          const subData = doc.data() as AssignmentSubmission;
          userSubs.set(subData.assignmentId, { ...subData, id: doc.id });
        });
        setStudentSubmissions(userSubs);

        const assignmentIdsForResultsQuery = fetchedAssignments.map(a => a.id);
        const assignmentResultsMap = new Map<string, FetchedResultData>();

        if (assignmentIdsForResultsQuery.length > 0 && studentToQueryId) {
          const resultsPromises = [];
          for (let i = 0; i < assignmentIdsForResultsQuery.length; i += 30) {
              const chunk = assignmentIdsForResultsQuery.slice(i, i + 30);
              resultsPromises.push(
                  getDocs(query(
                      collection(db, "results"),
                      where("studentId", "==", studentToQueryId),
                      where("assignmentId", "in", chunk)
                  ))
              );
          }
          const resultsSnapshots = await Promise.all(resultsPromises);
          resultsSnapshots.forEach(snapshot => {
            snapshot.forEach(doc => {
              const result = doc.data() as FetchedResultData;
              if (result.assignmentId) {
                assignmentResultsMap.set(result.assignmentId, { ...result, id: doc.id });
              }
            });
          });
        }


        fetchedAssignments = fetchedAssignments.map(assignment => {
          const submission = userSubs.get(assignment.id);
          const resultData = assignmentResultsMap.get(assignment.id);
          const resultForAssignment: AssignmentResultInfo | undefined = resultData ? {
              id: resultData.id,
              score: resultData.score,
              maxScore: resultData.maxScore,
              grade: resultData.grade,
              feedback: resultData.feedback,
              dateOfAssessment: resultData.dateOfAssessment,
          } : undefined;

          let submissionStatus: AssignmentData["submissionStatus"] = "Belum Dikerjakan";
          if (submission) {
            submissionStatus = "Sudah Dikerjakan";
          } else if (isPast(assignment.dueDate.toDate())) {
            submissionStatus = "Terlambat";
          }
          return {
            ...assignment,
            submissionStatus,
            studentSubmissionLink: submission?.submissionLink,
            studentSubmissionNotes: submission?.notes,
            submissionTimestamp: submission?.submittedAt,
            result: resultForAssignment,
          };
        });

      } else if (isTeacherOrAdminRole) {
        const classStudentCounts: Record<string, number> = {};
        const usersSnapshot = await getDocs(query(collection(db, "users"), where("role", "==", "siswa")));
        usersSnapshot.forEach(sDoc => {
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

      setAllAssignments(fetchedAssignments);
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

    if (!user || !user.uid) {
      setIsLoading(false);
      setAllAssignments([]);
      return;
    }
    if (isTeacherRole && isLoadingTeacherSpecificData) {
        return;
    }

    fetchAssignments();

  }, [authLoading, user, role, teacherProfileId, isLoadingTeacherSpecificData]);


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
        meetingNumber: selectedAssignment.meetingNumber || undefined,
      });
    }
  }, [selectedAssignment, isEditDialogOpen, editAssignmentForm]);

  const getDenormalizedNames = (data: AssignmentFormValues | EditAssignmentFormValues) => {
    const subject = (isAdminRole ? subjects : teacherTaughtSubjectsForFilter).find(s => s.id === data.subjectId);
    const aClass = (isAdminRole ? classes : teacherTaughtClassesForFilter).find(c => c.id === data.classId);
    const teacher = teachers.find(t => t.id === data.teacherId); 
    return { subjectName: subject?.name, className: aClass?.name, teacherName: teacher?.name };
  };

  const handleAddAssignmentSubmit: SubmitHandler<AssignmentFormValues> = async (data) => {
    addAssignmentForm.clearErrors();
    let denormalizedNames;
    let finalTeacherId = data.teacherId;

    if (isTeacherRole && teacherProfileId && user) {
      finalTeacherId = teacherProfileId;
      const subject = teacherTaughtSubjectsForFilter.find(s => s.id === data.subjectId);
      const aClass = teacherTaughtClassesForFilter.find(c => c.id === data.classId);
      denormalizedNames = {
        subjectName: subject?.name,
        className: aClass?.name,
        teacherName: user.displayName || "Guru", 
      };
    } else {
      denormalizedNames = getDenormalizedNames(data);
    }

    const { subjectName, className, teacherName } = denormalizedNames;

    if (!subjectName || !className || !teacherName) {
      toast({title: "Data Tidak Lengkap", description: "Pastikan subjek, kelas, dan guru valid.", variant: "destructive"});
      return;
    }
    if (!user) {
        toast({ title: "Aksi Gagal", description: "Pengguna tidak terautentikasi.", variant: "destructive" });
        return;
    }

    try {
      const assignmentData:any = {
        ...data,
        teacherId: finalTeacherId, 
        dueDate: Timestamp.fromDate(data.dueDate),
        subjectName,
        className,
        teacherName,
        createdAt: serverTimestamp()
      };
      if (data.meetingNumber === undefined || data.meetingNumber === null || isNaN(data.meetingNumber) ) {
        delete assignmentData.meetingNumber;
      }


      await addDoc(collection(db, "assignments"), assignmentData);
      toast({ title: "Tugas Ditambahkan" });

      const batch = writeBatch(db);
      let descriptionText = data.description?.substring(0, 50) + (data.description && data.description.length > 50 ? "..." : "") || `Batas waktu: ${format(data.dueDate, "dd MMM yyyy, HH:mm", {locale: indonesiaLocale})}`;
      if(data.meetingNumber) {
        descriptionText += ` (Pertemuan ${data.meetingNumber})`;
      }

      const notificationBase = {
        title: `Tugas Baru: ${data.title.substring(0,30)}${data.title.length > 30 ? "..." : ""}`,
        description: descriptionText,
        href: `/assignments`,
        read: false,
        createdAt: serverTimestamp(),
        type: "new_assignment",
      };

      const usersRef = collection(db, "users");
      const qStudents = query(usersRef, where("role", "==", "siswa"), where("classId", "==", data.classId));
      const studentsSnapshot = await getDocs(qStudents);
      
      const studentIds = studentsSnapshot.docs.map(doc => doc.id);

      // Create notifications for students
      studentsSnapshot.forEach((studentDoc) => {
        const studentNotificationRef = doc(collection(db, "notifications"));
        batch.set(studentNotificationRef, { ...notificationBase, userId: studentDoc.id });
      });

      // Create notifications for parents
      if (studentIds.length > 0) {
        const parentsQuery = query(collection(db, "users"), where("role", "==", "orangtua"), where("linkedStudentId", "in", studentIds));
        const parentsSnapshot = await getDocs(parentsQuery);
        parentsSnapshot.forEach((parentDoc) => {
            const parentNotificationRef = doc(collection(db, "notifications"));
            batch.set(parentNotificationRef, { ...notificationBase, userId: parentDoc.id });
        });
      }


      const creatorNotificationRef = doc(collection(db, "notifications"));
      batch.set(creatorNotificationRef, { ...notificationBase, userId: user.uid, title: `Anda membuat tugas baru: ${data.title}` });

      await batch.commit();

      setIsAddDialogOpen(false);
      addAssignmentForm.reset({ 
        dueDate: (() => {
            const todayEndOfDay = new Date();
            todayEndOfDay.setHours(23, 59, 0, 0);
            return todayEndOfDay;
          })(),
        title: "", 
        subjectId: undefined, 
        classId: undefined, 
        teacherId: isTeacherRole ? teacherProfileId || undefined : undefined, 
        description: "", 
        fileURL: "", 
        meetingNumber: undefined 
      });
      fetchAssignments();
    } catch (error: any) {
      console.error("Error adding assignment or notifications:", error);
      toast({ title: "Gagal Menambahkan Tugas", variant: "destructive" });
    }
  };
  const handleEditAssignmentSubmit: SubmitHandler<EditAssignmentFormValues> = async (data) => {
    if (!selectedAssignment || !user) return;
    editAssignmentForm.clearErrors();

    let denormalizedNames;
    let finalTeacherId = data.teacherId;

    if (isTeacherRole && teacherProfileId && user) {
      finalTeacherId = teacherProfileId; 
      const subject = teacherTaughtSubjectsForFilter.find(s => s.id === data.subjectId);
      const aClass = teacherTaughtClassesForFilter.find(c => c.id === data.classId);
      denormalizedNames = {
        subjectName: subject?.name,
        className: aClass?.name,
        teacherName: user.displayName || "Guru",
      };
    } else {
      denormalizedNames = getDenormalizedNames(data);
    }
    const { subjectName, className, teacherName } = denormalizedNames;

    if (!subjectName || !className || !teacherName) {
      toast({title: "Data Tidak Lengkap", variant: "destructive"});
      return;
    }
    try {
      const assignmentDocRef = doc(db, "assignments", data.id);
      const updateData: any = {
          ...data,
          teacherId: finalTeacherId,
          dueDate: Timestamp.fromDate(data.dueDate),
          subjectName,
          className,
          teacherName
      };
      if (data.meetingNumber === undefined || data.meetingNumber === null || isNaN(data.meetingNumber)) {
        updateData.meetingNumber = null;
      }

      await updateDoc(assignmentDocRef, updateData);
      toast({ title: "Tugas Diperbarui" });
      
      const batch = writeBatch(db);
      let descriptionText = `Batas waktu: ${format(data.dueDate, "dd MMM yyyy, HH:mm", {locale: indonesiaLocale})}`;
      if(data.meetingNumber) {
        descriptionText += ` (Pertemuan ${data.meetingNumber})`;
      }

      const notificationBase = {
        title: `Tugas Diperbarui: ${data.title.substring(0,25)}${data.title.length > 25 ? "..." : ""}`,
        description: descriptionText,
        href: `/assignments`, 
        read: false,
        createdAt: serverTimestamp(),
        type: "new_assignment", 
      };

      const usersRef = collection(db, "users");
      const qStudents = query(usersRef, where("role", "==", "siswa"), where("classId", "==", data.classId));
      const studentsSnapshot = await getDocs(qStudents);
      const studentIds = studentsSnapshot.docs.map(doc => doc.id);


      studentsSnapshot.forEach((studentDoc) => {
        const studentNotificationRef = doc(collection(db, "notifications"));
        batch.set(studentNotificationRef, { ...notificationBase, userId: studentDoc.id });
      });

      // Create notifications for parents
      if (studentIds.length > 0) {
        const parentsQuery = query(collection(db, "users"), where("role", "==", "orangtua"), where("linkedStudentId", "in", studentIds));
        const parentsSnapshot = await getDocs(parentsQuery);
        parentsSnapshot.forEach((parentDoc) => {
            const parentNotificationRef = doc(collection(db, "notifications"));
            batch.set(parentNotificationRef, { ...notificationBase, userId: parentDoc.id });
        });
      }
      
      const editorNotificationRef = doc(collection(db, "notifications"));
      batch.set(editorNotificationRef, { ...notificationBase, userId: user.uid, title: `Anda memperbarui tugas: ${data.title}` });

      await batch.commit();

      setIsEditDialogOpen(false);
      setSelectedAssignment(null);
      fetchAssignments();
    } catch (error) {
      toast({ title: "Gagal Memperbarui Tugas", variant: "destructive" });
    }
  };
  const handleDeleteAssignment = async (assignmentId: string) => {
    try {
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
    let studentId: string | undefined;
    let studentName: string | undefined;
    let classId: string | undefined;
    let className: string | undefined;

    if (role === 'siswa' && user) {
        studentId = user.uid;
        studentName = user.displayName || undefined;
        classId = user.classId;
        className = user.className;
    } else if (role === 'orangtua' && user) {
        studentId = user.linkedStudentId;
        studentName = user.linkedStudentName;
        classId = user.linkedStudentClassId;
        className = user.linkedStudentClassName;
    }

    if (!user || !selectedAssignmentForSubmission || !studentId || !studentName || !classId || !className) {
        toast({ title: "Aksi Gagal", description: "Data pengguna, anak, atau tugas tidak lengkap. Harap logout dan login kembali, atau hubungi admin jika masalah berlanjut.", variant: "destructive" });
        return;
    }

    studentSubmitForm.clearErrors();

    const submissionData: Omit<AssignmentSubmission, "id"> = {
      assignmentId: selectedAssignmentForSubmission.id,
      studentId: studentId,
      studentName: studentName,
      classId: classId,
      className: className,
      submissionLink: data.submissionLink,
      submittedAt: Timestamp.now(),
      notes: data.notes,
      teacherFileURL: selectedAssignmentForSubmission.fileURL || "",
    };

    try {
      const existingSubmission = studentSubmissions.get(selectedAssignmentForSubmission.id);
      if (existingSubmission?.id) {
        await updateDoc(doc(db, "assignmentSubmissions", existingSubmission.id), submissionData);
        toast({ title: "Pengumpulan Diperbarui" });
      } else {
        await addDoc(collection(db, "assignmentSubmissions"), submissionData);
        toast({ title: "Tugas Terkirim" });
      }
      setIsSubmitAssignmentDialogOpen(false);
      setSelectedAssignmentForSubmission(null);
      studentSubmitForm.reset();
      fetchAssignments();
    } catch (error) {
      console.error("Error submitting assignment:", error);
      toast({ title: "Gagal Mengirim Tugas", variant: "destructive" });
    }
  };

  const handleOpenViewResultDialog = (assignment: AssignmentData) => {
    setSelectedAssignmentForViewingResult(assignment);
    setIsViewResultDialogOpen(true);
  };
  
  const openViewDetailDialog = (assignment: AssignmentData) => {
    setSelectedAssignmentForDetail(assignment);
    setIsViewDetailDialogOpen(true);
  };


  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedClassFilter, selectedSubjectFilter, meetingNumberFilter]);

  const filteredAssignments = useMemo(() => {
    return allAssignments.filter(assignment => {
        let matchesFilters = true;
        if (isTeacherRole) {
            if (teacherUniqueClassCount === 1) {
                if (meetingNumberFilter && assignment.meetingNumber?.toString() !== meetingNumberFilter) {
                    matchesFilters = false;
                }
                 if (selectedSubjectFilter !== "all" && assignment.subjectId !== selectedSubjectFilter) {
                     matchesFilters = false;
                 }
            } else if (teacherUniqueClassCount && teacherUniqueClassCount > 1) {
                 const matchesClass = selectedClassFilter === "all" || assignment.classId === selectedClassFilter;
                 const matchesSubject = selectedSubjectFilter === "all" || assignment.subjectId === selectedSubjectFilter;
                 if (!(matchesClass && matchesSubject)) matchesFilters = false;
            }
        } else if (isAdminRole) {
             const matchesClass = selectedClassFilter === "all" || assignment.classId === selectedClassFilter;
             const matchesSubject = selectedSubjectFilter === "all" || assignment.subjectId === selectedSubjectFilter;
             if (!(matchesClass && matchesSubject)) matchesFilters = false;
        }


      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = searchTerm === "" ||
        assignment.title.toLowerCase().includes(searchLower) ||
        (assignment.subjectName && assignment.subjectName.toLowerCase().includes(searchLower)) ||
        (assignment.className && assignment.className.toLowerCase().includes(searchLower)) ||
        (assignment.teacherName && assignment.teacherName.toLowerCase().includes(searchLower));
        
      return matchesFilters && matchesSearch;
    });
  }, [allAssignments, searchTerm, selectedClassFilter, selectedSubjectFilter, isTeacherRole, teacherUniqueClassCount, meetingNumberFilter]);

  const totalPages = Math.ceil(filteredAssignments.length / ITEMS_PER_PAGE);
  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ITEMS_PER_PAGE;
    return filteredAssignments.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, filteredAssignments]);

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


  if (authLoading || isLoadingTeacherSpecificData && isTeacherRole || (!user && !authLoading)) {
    return <div className="space-y-6"><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Tugas</h1>
        <p className="text-muted-foreground">
          {isStudentRole ? "Lihat dan kerjakan tugas." : isParentRole ? "Lihat dan kerjakan tugas anak." : "Kelola pemberian tugas, pengumpulan, dan penilaian."}
        </p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <ClipboardCheck className="h-6 w-6 text-primary" />
             <div className={cn("flex items-baseline gap-x-1.5", isMobile && "flex-col items-start")}>
               <span className={cn(isMobile && "block")}>Daftar Tugas</span>
              {!isLoading && (
                <span className={cn("text-base font-normal text-muted-foreground", isMobile ? "text-xs block" : "sm:text-xl sm:font-semibold sm:text-foreground")}>
                  {`(${filteredAssignments.length} tugas)`}
                </span>
              )}
              {isLoading && (
                <span className={cn("text-base font-normal text-muted-foreground", isMobile ? "text-xs block" : "")}>
                  (Memuat...)
                </span>
              )}
            </div>
          </CardTitle>
          <div className="flex items-center gap-2">
            {isTeacherOrAdminRole && (
              <Dialog open={isAddDialogOpen} onOpenChange={(isOpen) => {
                setIsAddDialogOpen(isOpen);
                if (!isOpen) { 
                    addAssignmentForm.reset({ 
                        dueDate: (() => { const d = new Date(); d.setHours(23,59,0,0); return d; })(), 
                        title: "", 
                        subjectId: undefined, 
                        classId: undefined, 
                        teacherId: isTeacherRole ? teacherProfileId || undefined : undefined, 
                        description: "", 
                        fileURL: "", 
                        meetingNumber: undefined 
                    }); 
                    addAssignmentForm.clearErrors(); 
                }
                 else if (isAdminRole && (subjects.length === 0 || classes.length === 0 || teachers.length === 0)) fetchAdminDropdownData(); 
              }}>
                <DialogTrigger asChild>
                   <Button size="sm" onClick={() => { if (isAdminRole && (subjects.length === 0 || classes.length === 0 || teachers.length === 0)) fetchAdminDropdownData();}}>
                    <PlusCircle className="mr-2 h-4 w-4" /> {isMobile ? 'Tambah' : 'Tambah Tugas'}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader><DialogTitle>Tambah Tugas Baru</DialogTitle><DialogDescription>Isi detail tugas.</DialogDescription></DialogHeader>
                  <form onSubmit={addAssignmentForm.handleSubmit(handleAddAssignmentSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                    <div><Label htmlFor="add-assignment-title">Judul Tugas <span className="text-destructive">*</span></Label><Input id="add-assignment-title" {...addAssignmentForm.register("title")} className="mt-1" />{addAssignmentForm.formState.errors.title && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.title.message}</p>}</div>
                    <div><Label htmlFor="add-assignment-subjectId">Mata Pelajaran <span className="text-destructive">*</span></Label><Select onValueChange={(value) => addAssignmentForm.setValue("subjectId", value, { shouldValidate: true })} value={addAssignmentForm.getValues("subjectId")}><SelectTrigger id="add-assignment-subjectId" className="mt-1"><SelectValue placeholder="Pilih mata pelajaran" /></SelectTrigger><SelectContent>{(isAdminRole ? subjects : teacherTaughtSubjectsForFilter).length === 0 && <SelectItem value="loading" disabled>Memuat...</SelectItem>}{(isAdminRole ? subjects : teacherTaughtSubjectsForFilter).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>{addAssignmentForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.subjectId.message}</p>}</div>
                    <div><Label htmlFor="add-assignment-classId">Kelas <span className="text-destructive">*</span></Label><Select onValueChange={(value) => addAssignmentForm.setValue("classId", value, { shouldValidate: true })} value={addAssignmentForm.getValues("classId")}><SelectTrigger id="add-assignment-classId" className="mt-1"><SelectValue placeholder="Pilih kelas" /></SelectTrigger><SelectContent>{(isAdminRole ? classes : teacherTaughtClassesForFilter).length === 0 && <SelectItem value="loading" disabled>Memuat...</SelectItem>}{(isAdminRole ? classes : teacherTaughtClassesForFilter).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>{addAssignmentForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.classId.message}</p>}</div>
                    
                    {isAdminRole && (
                        <div><Label htmlFor="add-assignment-teacherId">Guru Pemberi Tugas <span className="text-destructive">*</span></Label><Select onValueChange={(value) => addAssignmentForm.setValue("teacherId", value, { shouldValidate: true })} value={addAssignmentForm.getValues("teacherId")}><SelectTrigger id="add-assignment-teacherId" className="mt-1"><SelectValue placeholder="Pilih guru" /></SelectTrigger><SelectContent>{teachers.length === 0 && <SelectItem value="loading" disabled>Memuat...</SelectItem>}{teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>{addAssignmentForm.formState.errors.teacherId && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.teacherId.message}</p>}</div>
                    )}
                    {isTeacherRole && (
                        <Input type="hidden" {...addAssignmentForm.register("teacherId", { value: teacherProfileId || ""})} />
                    )}


                    <div>
                        <Label htmlFor="add-assignment-dueDate">Batas Waktu Pengumpulan <span className="text-destructive">*</span></Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant={"outline"} className="w-full justify-start text-left font-normal mt-1">
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {addAssignmentForm.watch("dueDate") ? format(addAssignmentForm.watch("dueDate"), "PPP HH:mm", { locale: indonesiaLocale }) : <span>Pilih tanggal & waktu</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={addAssignmentForm.watch("dueDate")}
                                    onSelect={(date) => {
                                        if (date) {
                                            const newDueDate = new Date(date);
                                            newDueDate.setHours(23, 59, 0, 0);
                                            addAssignmentForm.setValue("dueDate", newDueDate, { shouldValidate: true });
                                        } else {
                                            const todayEndOfDay = new Date();
                                            todayEndOfDay.setHours(23, 59, 0, 0);
                                            addAssignmentForm.setValue("dueDate", todayEndOfDay, { shouldValidate: true });
                                        }
                                    }}
                                    initialFocus
                                />
                                <div className="p-2 border-t">
                                    <Input
                                        type="time"
                                        defaultValue={format(addAssignmentForm.watch("dueDate") || new Date(), "HH:mm")}
                                        onChange={(e) => {
                                            const timeValue = e.target.value;
                                            if (timeValue) {
                                                const timeParts = timeValue.split(':');
                                                if (timeParts.length === 2) {
                                                    const hours = parseInt(timeParts[0], 10);
                                                    const minutes = parseInt(timeParts[1], 10);
                                                    if (!isNaN(hours) && !isNaN(minutes)) {
                                                        const currentFullDate = addAssignmentForm.watch("dueDate") || new Date();
                                                        const newDateWithUserTime = new Date(currentFullDate);
                                                        newDateWithUserTime.setHours(hours, minutes, 0, 0);
                                                        addAssignmentForm.setValue("dueDate", newDateWithUserTime, { shouldValidate: true });
                                                    }
                                                }
                                            }
                                        }}
                                    />
                                </div>
                            </PopoverContent>
                        </Popover>
                        {addAssignmentForm.formState.errors.dueDate && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.dueDate.message}</p>}
                    </div>
                    <div><Label htmlFor="add-assignment-meetingNumber">Pertemuan Ke-</Label><Input id="add-assignment-meetingNumber" type="number" {...addAssignmentForm.register("meetingNumber")} className="mt-1" placeholder="Contoh: 3" />{addAssignmentForm.formState.errors.meetingNumber && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.meetingNumber.message}</p>}</div>
                    <div><Label htmlFor="add-assignment-description">Deskripsi Tugas</Label><Textarea id="add-assignment-description" {...addAssignmentForm.register("description")} className="mt-1" placeholder="Jelaskan detail tugas di sini..." /></div>
                    <div><Label htmlFor="add-assignment-fileURL">URL File Tugas</Label><Input id="add-assignment-fileURL" {...addAssignmentForm.register("fileURL")} className="mt-1" placeholder="https://contoh.com/file_tugas.pdf" />{addAssignmentForm.formState.errors.fileURL && <p className="text-sm text-destructive mt-1">{addAssignmentForm.formState.errors.fileURL.message}</p>}</div>
                    <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose><Button type="submit" disabled={addAssignmentForm.formState.isSubmitting}>{addAssignmentForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Tugas"}</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
         <div className="my-4 flex flex-col md:flex-row items-stretch gap-2">
            <div className="relative flex-grow">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                placeholder="Cari tugas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-full"
                />
            </div>
            {isTeacherRole && teacherUniqueClassCount === 1 ? (
                 <div className="flex w-full md:w-auto gap-2">
                     <Select
                        value={selectedSubjectFilter}
                        onValueChange={setSelectedSubjectFilter}
                        disabled={isLoading || teacherTaughtSubjectsForFilter.length === 0}
                    >
                        <SelectTrigger className="flex-1 sm:min-w-[180px]">
                        <FilterIcon className="mr-2 h-4 w-4 text-muted-foreground"/>
                        <SelectValue placeholder="Filter Mata Pelajaran" />
                        </SelectTrigger>
                        <SelectContent>
                        <SelectItem value="all">Semua Mata Pelajaran</SelectItem>
                        {teacherTaughtSubjectsForFilter.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <div className="flex-1">
                        <Label htmlFor="meetingNumberFilter" className="sr-only">Filter Pertemuan Ke-</Label>
                        <Input
                            id="meetingNumberFilter"
                            type="number"
                            placeholder="Filter P ke-"
                            value={meetingNumberFilter}
                            onChange={(e) => setMeetingNumberFilter(e.target.value)}
                            className="w-full"
                        />
                    </div>
                </div>
            ) : (isTeacherOrAdminRole && (teacherUniqueClassCount === null || teacherUniqueClassCount > 1 || isAdminRole)) ? (
                 <div className="flex w-full md:w-auto gap-2">
                <Select
                    value={selectedClassFilter}
                    onValueChange={setSelectedClassFilter}
                    disabled={isLoading || (isAdminRole ? classes : teacherTaughtClassesForFilter).length === 0}
                >
                    <SelectTrigger className="md:min-w-[150px]">
                    <FilterIcon className="mr-2 h-4 w-4 text-muted-foreground"/>
                    <SelectValue placeholder="Filter Kelas" />
                    </SelectTrigger>
                    <SelectContent>
                    <SelectItem value="all">Semua Kelas</SelectItem>
                    {(isAdminRole ? classes : teacherTaughtClassesForFilter).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select
                    value={selectedSubjectFilter}
                    onValueChange={setSelectedSubjectFilter}
                    disabled={isLoading || (isAdminRole ? subjects : teacherTaughtSubjectsForFilter).length === 0}
                >
                    <SelectTrigger className="md:min-w-[180px]">
                    <FilterIcon className="mr-2 h-4 w-4 text-muted-foreground"/>
                    <SelectValue placeholder="Filter Mata Pelajaran" />
                    </SelectTrigger>
                    <SelectContent>
                    <SelectItem value="all">Semua Mata Pelajaran</SelectItem>
                    {(isAdminRole ? subjects : teacherTaughtSubjectsForFilter).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                </div>
            ) : null}
         </div>

          {isLoading ? (
            <div className="space-y-2 mt-4">{[...Array(ITEMS_PER_PAGE)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : currentTableData.length > 0 ? (
            <>
            <div className="overflow-x-auto mt-4">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className={cn(isMobile ? "w-10 px-2 text-center" : "w-[50px]")}>No.</TableHead>
                    {!isMobile && <TableHead className="min-w-[180px] truncate">Judul Tugas</TableHead>}
                    <TableHead className={cn("truncate", isMobile ? "w-1/2 px-2" : "min-w-[150px]")}>Mata Pelajaran</TableHead>
                    
                    {!isMobile && (isStudentRole || isParentRole || (isTeacherRole && teacherUniqueClassCount && teacherUniqueClassCount <=1 )) && <TableHead className="truncate">Guru</TableHead>}
                    {!isMobile && (isAdminRole || (isTeacherRole && teacherUniqueClassCount && teacherUniqueClassCount > 1)) && <TableHead className="truncate">Kelas</TableHead>}
                    {!isMobile && (isAdminRole ) && <TableHead className="truncate">Guru</TableHead>}
                    
                    {!isMobile && <TableHead className={cn("truncate text-center")} title="Pertemuan Ke-">P Ke-</TableHead>}
                    <TableHead className={cn(isMobile ? "w-1/2 px-2" : "")}>Batas Waktu</TableHead>
                    
                    {!isMobile && (isStudentRole || isParentRole) && <TableHead>File Tugas</TableHead>}
                    {!isMobile && (isStudentRole || isParentRole) && <TableHead>Status</TableHead>}
                    {!isMobile && isTeacherOrAdminRole && <TableHead className="truncate">Pengumpulan</TableHead>}
                    
                    <TableHead className={cn("text-right", isMobile ? "w-12 px-1" : "w-16")}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentTableData.map((assignment, index) => (
                    <TableRow key={assignment.id}>
                      <TableCell className={cn(isMobile ? "px-2 text-center" : "")}>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                      {!isMobile && <TableCell className="font-medium truncate" title={assignment.title}>{assignment.title}</TableCell>}
                      <TableCell className={cn("truncate", isMobile ? "px-2" : "")} title={assignment.subjectName || assignment.subjectId}>{assignment.subjectName || assignment.subjectId}</TableCell>
                      
                      {!isMobile && (isStudentRole || isParentRole || (isTeacherRole && teacherUniqueClassCount && teacherUniqueClassCount <=1 )) && <TableCell className="truncate" title={assignment.teacherName || assignment.teacherId}>{assignment.teacherName || assignment.teacherId}</TableCell>}
                      {!isMobile && (isAdminRole || (isTeacherRole && teacherUniqueClassCount && teacherUniqueClassCount > 1)) && <TableCell className="truncate" title={assignment.className || assignment.classId}>{assignment.className || assignment.classId}</TableCell>}
                      {!isMobile && (isAdminRole) && <TableCell className="truncate" title={assignment.teacherName || assignment.teacherId}>{assignment.teacherName || assignment.teacherId}</TableCell>}

                      {!isMobile && <TableCell className={cn("truncate text-center")} title={assignment.meetingNumber ? `Pertemuan ke-${assignment.meetingNumber.toString()}` : "Tidak ada info pertemuan"}>{assignment.meetingNumber || "-"}</TableCell>}
                      <TableCell className={cn(isMobile ? "px-2 text-xs" : "", isStudentRole && isPast(assignment.dueDate.toDate()) && assignment.submissionStatus === "Belum Dikerjakan" && "text-destructive font-semibold")}>
                        {format(assignment.dueDate.toDate(), isMobile ? "dd/MM/yy" : "dd MMM yyyy, HH:mm", { locale: indonesiaLocale })}
                         {isMobile && <span className="block text-muted-foreground">{format(assignment.dueDate.toDate(), "HH:mm", { locale: indonesiaLocale })}</span>}
                      </TableCell>

                      {!isMobile && (isStudentRole || isParentRole) && (
                        <>
                          <TableCell>
                            {assignment.fileURL ? (
                              <Button variant="outline" size="icon" asChild>
                                <NextLink href={assignment.fileURL} target="_blank" rel="noopener noreferrer" aria-label={`Unduh file tugas ${assignment.title}`}>
                                  <DownloadCloud className="h-4 w-4" />
                                </NextLink>
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
                                    <span className="text-xs text-muted-foreground block"> ({format(assignment.submissionTimestamp.toDate(), "dd MMM, HH:mm", { locale: indonesiaLocale })})</span>
                                )}
                            </span>
                          </TableCell>
                        </>
                      )}

                      {!isMobile && isTeacherOrAdminRole && (
                        <TableCell className="truncate">
                          {assignment.submissionCount !== undefined && assignment.totalStudentsInClass !== undefined
                            ? `${assignment.submissionCount}/${assignment.totalStudentsInClass} siswa`
                            : "Memuat..."}
                        </TableCell>
                      )}

                      <TableCell className={cn("text-right space-x-1 sm:space-x-2", isMobile ? "px-1" : "")}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Opsi untuk tugas`}>
                              <MoreVertical className="h-4 w-4" />
                          </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openViewDetailDialog(assignment)}>
                                  <Eye className="mr-2 h-4 w-4" /> Lihat Detail
                              </DropdownMenuItem>
                              {isTeacherOrAdminRole && (
                                  <>
                                      <DropdownMenuItem onClick={() => handleOpenViewSubmissions(assignment)}>
                                          <Users className="mr-2 h-4 w-4" /> Lihat Pengumpulan
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => openEditDialog(assignment)}>
                                          <Edit className="mr-2 h-4 w-4" /> Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); openDeleteDialog(assignment); }} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                                              <Trash2 className="mr-2 h-4 w-4" /> Hapus
                                          </DropdownMenuItem>
                                          </AlertDialogTrigger>
                                          {selectedAssignment && selectedAssignment.id === assignment.id && (<AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Apakah Kamu Yakin?</AlertDialogTitle><AlertDialogDescription>Tindakan ini akan menghapus tugas <span className="font-semibold">{selectedAssignment?.title || 'ini'}</span> beserta semua data pengumpulannya.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setSelectedAssignment(null)}>Batal</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteAssignment(selectedAssignment.id)}>Ya, Hapus Tugas</AlertDialogAction></AlertDialogFooter></AlertDialogContent>)}
                                      </AlertDialog>
                                  </>
                              )}
                              {canSubmitAssignment && (
                                  <>
                                      {assignment.submissionStatus === "Sudah Dikerjakan" ? (
                                          <DropdownMenuItem onClick={() => handleOpenSubmitAssignmentDialog(assignment)}>
                                              <FilePenLine className="mr-2 h-4 w-4" /> Edit Pengumpulan
                                          </DropdownMenuItem>
                                      ) : (
                                          <DropdownMenuItem onClick={() => handleOpenSubmitAssignmentDialog(assignment)} disabled={isPast(assignment.dueDate.toDate()) && assignment.submissionStatus !== "Sudah Dikerjakan"}>
                                              <Send className="mr-2 h-4 w-4" /> Kerjakan Tugas
                                          </DropdownMenuItem>
                                      )}
                                  </>
                              )}
                              {(isStudentRole || isParentRole) && assignment.result && (
                                  <DropdownMenuItem onClick={() => handleOpenViewResultDialog(assignment)}>
                                      <BarChart3 className="mr-2 h-4 w-4" /> Lihat Hasil {isParentRole ? 'Anak' : ''}
                                  </DropdownMenuItem>
                              )}
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
          ) : ( <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
                {(searchTerm || (isAdminRole && (selectedClassFilter !== "all" || selectedSubjectFilter !== "all")) || (isTeacherRole && teacherUniqueClassCount ===1 && meetingNumberFilter) || (isTeacherRole && teacherUniqueClassCount && teacherUniqueClassCount > 1 && (selectedClassFilter !== "all" || selectedSubjectFilter !== "all")))
                  ? "Tidak ada tugas yang cocok dengan filter atau pencarian."
                  : "Belum ada tugas."
                }
              </div> )}
        </CardContent>
      </Card>

      {isTeacherOrAdminRole && selectedAssignment && (
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => { setIsEditDialogOpen(isOpen); if (!isOpen) { setSelectedAssignment(null); editAssignmentForm.clearErrors(); } }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Edit Tugas</DialogTitle><DialogDescription>Perbarui detail tugas.</DialogDescription></DialogHeader>
            <form onSubmit={editAssignmentForm.handleSubmit(handleEditAssignmentSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
              <Input type="hidden" {...editAssignmentForm.register("id")} />
              <div><Label htmlFor="edit-assignment-title">Judul Tugas <span className="text-destructive">*</span></Label><Input id="edit-assignment-title" {...editAssignmentForm.register("title")} className="mt-1" />{editAssignmentForm.formState.errors.title && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.title.message}</p>}</div>
              <div><Label htmlFor="edit-assignment-subjectId">Mata Pelajaran <span className="text-destructive">*</span></Label><Select onValueChange={(value) => editAssignmentForm.setValue("subjectId", value, { shouldValidate: true })} value={editAssignmentForm.getValues("subjectId")}><SelectTrigger id="edit-assignment-subjectId" className="mt-1"><SelectValue placeholder="Pilih mata pelajaran" /></SelectTrigger><SelectContent>{(isAdminRole ? subjects : teacherTaughtSubjectsForFilter).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>{editAssignmentForm.formState.errors.subjectId && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.subjectId.message}</p>}</div>
              <div><Label htmlFor="edit-assignment-classId">Kelas <span className="text-destructive">*</span></Label><Select onValueChange={(value) => editAssignmentForm.setValue("classId", value, { shouldValidate: true })} value={editAssignmentForm.getValues("classId")}><SelectTrigger id="edit-assignment-classId" className="mt-1"><SelectValue placeholder="Pilih kelas" /></SelectTrigger><SelectContent>{(isAdminRole ? classes : teacherTaughtClassesForFilter).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>{editAssignmentForm.formState.errors.classId && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.classId.message}</p>}</div>
              
              {isAdminRole && (
                <div><Label htmlFor="edit-assignment-teacherId">Guru <span className="text-destructive">*</span></Label><Select onValueChange={(value) => editAssignmentForm.setValue("teacherId", value, { shouldValidate: true })} value={editAssignmentForm.getValues("teacherId")}><SelectTrigger id="edit-assignment-teacherId" className="mt-1"><SelectValue placeholder="Pilih guru" /></SelectTrigger><SelectContent>{teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>{editAssignmentForm.formState.errors.teacherId && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.teacherId.message}</p>}</div>
              )}
               {isTeacherRole && (
                    <Input type="hidden" {...editAssignmentForm.register("teacherId", { value: teacherProfileId || ""})} />
               )}

              <div>
                  <Label htmlFor="edit-assignment-dueDate">Batas Waktu <span className="text-destructive">*</span></Label>
                  <Popover>
                      <PopoverTrigger asChild>
                          <Button variant={"outline"} className="w-full justify-start text-left font-normal mt-1">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {editAssignmentForm.watch("dueDate") ? format(editAssignmentForm.watch("dueDate"), "PPP HH:mm", { locale: indonesiaLocale }) : <span>Pilih tanggal & waktu</span>}
                          </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                          <Calendar
                              mode="single"
                              selected={editAssignmentForm.watch("dueDate")}
                              onSelect={(date) => {
                                  if (date) {
                                      const newDueDate = new Date(date);
                                      newDueDate.setHours(23, 59, 0, 0); 
                                      editAssignmentForm.setValue("dueDate", newDueDate, { shouldValidate: true });
                                  } else {
                                      const todayEndOfDay = new Date();
                                      todayEndOfDay.setHours(23, 59, 0, 0);
                                      editAssignmentForm.setValue("dueDate", todayEndOfDay, { shouldValidate: true });
                                  }
                              }}
                              initialFocus
                          />
                          <div className="p-2 border-t">
                              <Input
                                  type="time"
                                  defaultValue={format(editAssignmentForm.watch("dueDate") || new Date(), "HH:mm")} 
                                  onChange={(e) => {
                                      const timeValue = e.target.value;
                                      if (timeValue) {
                                          const timeParts = timeValue.split(':');
                                           if (timeParts.length === 2) {
                                              const hours = parseInt(timeParts[0], 10);
                                              const minutes = parseInt(timeParts[1], 10);
                                               if (!isNaN(hours) && !isNaN(minutes)) {
                                                  const currentFullDate = editAssignmentForm.watch("dueDate") || new Date(); 
                                                  const newDateWithUserTime = new Date(currentFullDate);
                                                  newDateWithUserTime.setHours(hours, minutes, 0, 0); 
                                                  editAssignmentForm.setValue("dueDate", newDateWithUserTime, { shouldValidate: true });
                                              }
                                          }
                                      }
                                  }}
                              />
                          </div>
                      </PopoverContent>
                  </Popover>
                  {editAssignmentForm.formState.errors.dueDate && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.dueDate.message}</p>}
              </div>
              <div><Label htmlFor="edit-assignment-meetingNumber">Pertemuan Ke-</Label><Input id="edit-assignment-meetingNumber" type="number" {...editAssignmentForm.register("meetingNumber")} className="mt-1" />{editAssignmentForm.formState.errors.meetingNumber && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.meetingNumber.message}</p>}</div>
              <div><Label htmlFor="edit-assignment-description">Deskripsi</Label><Textarea id="edit-assignment-description" {...editAssignmentForm.register("description")} className="mt-1" /></div>
              <div><Label htmlFor="edit-assignment-fileURL">URL File</Label><Input id="edit-assignment-fileURL" {...editAssignmentForm.register("fileURL")} className="mt-1" />{editAssignmentForm.formState.errors.fileURL && <p className="text-sm text-destructive mt-1">{editAssignmentForm.formState.errors.fileURL.message}</p>}</div>
              <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose><Button type="submit" disabled={editAssignmentForm.formState.isSubmitting}>{editAssignmentForm.formState.isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {canSubmitAssignment && selectedAssignmentForSubmission && (
        <Dialog open={isSubmitAssignmentDialogOpen} onOpenChange={(isOpen) => { setIsSubmitAssignmentDialogOpen(isOpen); if (!isOpen) setSelectedAssignmentForSubmission(null); studentSubmitForm.reset(); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Kerjakan Tugas: {selectedAssignmentForSubmission?.title || 'Tugas Ini'}</DialogTitle>
              <DialogDescription>
                <div>Mata Pelajaran: {selectedAssignmentForSubmission.subjectName}</div>
                <div>Batas Waktu: {format(selectedAssignmentForSubmission.dueDate.toDate(), "dd MMMM yyyy, HH:mm", { locale: indonesiaLocale })}</div>
                {selectedAssignmentForSubmission.meetingNumber && <div>Pertemuan Ke-: {selectedAssignmentForSubmission.meetingNumber}</div>}
                {selectedAssignmentForSubmission.description && <div className="mt-2 whitespace-pre-line">{selectedAssignmentForSubmission.description}</div>}
                {selectedAssignmentForSubmission.fileURL && (
                    <Button variant="link" asChild className="p-0 h-auto mt-2">
                        <NextLink href={selectedAssignmentForSubmission.fileURL} target="_blank" rel="noopener noreferrer">
                            <DownloadCloud className="mr-2 h-4 w-4"/> Unduh File Tugas dari Guru
                        </NextLink>
                    </Button>
                )}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={studentSubmitForm.handleSubmit(handleStudentSubmitAssignment)} className="space-y-4 py-4">
              <div>
                <Label htmlFor="submissionLink">Link Google Drive Pengumpulan <span className="text-destructive">*</span></Label>
                <Input id="submissionLink" {...studentSubmitForm.register("submissionLink")} className="mt-1" placeholder="https://drive.google.com/..." />
                {studentSubmitForm.formState.errors.submissionLink && <p className="text-sm text-destructive mt-1">{studentSubmitForm.formState.errors.submissionLink.message}</p>}
              </div>
              <div>
                <Label htmlFor="notes">Catatan</Label>
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

       {isTeacherOrAdminRole && selectedAssignmentToViewSubmissions && (
        <Dialog open={isViewSubmissionsDialogOpen} onOpenChange={(isOpen) => { setIsViewSubmissionsDialogOpen(isOpen); if (!isOpen) setSelectedAssignmentToViewSubmissions(null); }}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Pengumpulan Tugas: {selectedAssignmentToViewSubmissions?.title || 'Tugas Ini'}</DialogTitle>
                    <DialogDescription>Daftar siswa yang telah mengumpulkan tugas.</DialogDescription>
                </DialogHeader>
                <div className="py-4 max-h-[60vh] overflow-y-auto">
                    {isLoadingSubmissions ? (
                        <p>Memuat data pengumpulan...</p>
                    ) : submissionsForCurrentAssignment.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">No.</TableHead>
                                    <TableHead>Nama Siswa</TableHead>
                                    <TableHead>Link Pengumpulan</TableHead>
                                    <TableHead>Waktu Kirim</TableHead>
                                    <TableHead>Catatan</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {submissionsForCurrentAssignment.map((sub, index) => (
                                    <TableRow key={sub.id}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell className="truncate" title={sub.studentName}>{sub.studentName}</TableCell>
                                        <TableCell>
                                            <Button variant="link" asChild className="p-0 h-auto text-sm">
                                                <NextLink href={sub.submissionLink} target="_blank" rel="noopener noreferrer">Lihat File</NextLink>
                                            </Button>
                                        </TableCell>
                                        <TableCell>{format(sub.submittedAt.toDate(), "dd MMM yy, HH:mm", { locale: indonesiaLocale })}</TableCell>
                                        <TableCell className="text-xs max-w-xs truncate" title={sub.notes || undefined}>{sub.notes || "-"}</TableCell>
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

      {(isStudentRole || isParentRole) && selectedAssignmentForViewingResult && selectedAssignmentForViewingResult.result && (
        <Dialog open={isViewResultDialogOpen} onOpenChange={(isOpen) => { setIsViewResultDialogOpen(isOpen); if (!isOpen) setSelectedAssignmentForViewingResult(null); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Hasil Tugas: {selectedAssignmentForViewingResult?.title || 'Tugas Ini'}</DialogTitle>
              <DialogDescription>
                Mata Pelajaran: {selectedAssignmentForViewingResult.subjectName}
                {selectedAssignmentForViewingResult.result.dateOfAssessment && (
                    <span className="block text-xs">Tanggal Penilaian: {format(selectedAssignmentForViewingResult.result.dateOfAssessment.toDate(), "dd MMMM yyyy", {locale: indonesiaLocale})}</span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                {selectedAssignmentForViewingResult.studentSubmissionLink && (
                    <div className="flex items-center space-x-2">
                        <LinkIcon className="h-4 w-4 text-muted-foreground" />
                        <Button variant="link" asChild className="p-0 h-auto">
                            <NextLink href={selectedAssignmentForViewingResult.studentSubmissionLink} target="_blank" rel="noopener noreferrer">
                                Lihat Pengumpulan Saya
                            </NextLink>
                        </Button>
                    </div>
                )}
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Nilai</Label>
                <p className="text-2xl font-bold">
                  {selectedAssignmentForViewingResult.result.score ?? 'N/A'}
                </p>
              </div>
              {selectedAssignmentForViewingResult.result.feedback && (
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Feedback Guru</Label>
                  <p className="text-sm whitespace-pre-line bg-muted/50 p-3 rounded-md">{selectedAssignmentForViewingResult.result.feedback}</p>
                </div>
              )}
              {!selectedAssignmentForViewingResult.result.feedback && (
                 <p className="text-sm text-muted-foreground italic">Belum ada feedback dari guru.</p>
              )}
            </div>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Tutup</Button></DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      {selectedAssignmentForDetail && (
        <Dialog open={isViewDetailDialogOpen} onOpenChange={(isOpen) => { setIsViewDetailDialogOpen(isOpen); if (!isOpen) setSelectedAssignmentForDetail(null); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Detail Tugas: {selectedAssignmentForDetail?.title || 'Tugas Ini'}
              </DialogTitle>
              <DialogDescription>
                Informasi lengkap mengenai tugas ini.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4 max-h-[60vh] overflow-y-auto pr-2">
              <div><Label className="text-muted-foreground">Judul Tugas:</Label><p className="font-medium">{selectedAssignmentForDetail.title}</p></div>
              <div><Label className="text-muted-foreground">Mata Pelajaran:</Label><p className="font-medium">{selectedAssignmentForDetail.subjectName || selectedAssignmentForDetail.subjectId}</p></div>
              <div><Label className="text-muted-foreground">Kelas:</Label><p className="font-medium">{selectedAssignmentForDetail.className || selectedAssignmentForDetail.classId}</p></div>
              <div><Label className="text-muted-foreground">Guru Pemberi Tugas:</Label><p className="font-medium">{selectedAssignmentForDetail.teacherName || selectedAssignmentForDetail.teacherId}</p></div>
              {selectedAssignmentForDetail.meetingNumber && <div><Label className="text-muted-foreground">Pertemuan Ke-:</Label><p className="font-medium">{selectedAssignmentForDetail.meetingNumber}</p></div>}
              <div><Label className="text-muted-foreground">Batas Waktu:</Label><p className="font-medium">{format(selectedAssignmentForDetail.dueDate.toDate(), "dd MMMM yyyy, HH:mm", { locale: indonesiaLocale })}</p></div>
              {selectedAssignmentForDetail.description && <div><Label className="text-muted-foreground">Deskripsi:</Label><p className="whitespace-pre-line">{selectedAssignmentForDetail.description}</p></div>}
              {selectedAssignmentForDetail.fileURL && (
                <div>
                  <Label className="text-muted-foreground">File Tugas:</Label>
                  <Button variant="link" asChild className="p-0 h-auto block">
                    <NextLink href={selectedAssignmentForDetail.fileURL} target="_blank" rel="noopener noreferrer">
                      <DownloadCloud className="inline-block mr-1 h-4 w-4" /> Unduh File
                    </NextLink>
                  </Button>
                </div>
              )}
               {(isStudentRole || isParentRole) && (
                <>
                  {selectedAssignmentForDetail.submissionStatus && <div><Label className="text-muted-foreground">Status Pengumpulan:</Label><p className={cn(selectedAssignmentForDetail.submissionStatus === "Sudah Dikerjakan" && "text-green-600", selectedAssignmentForDetail.submissionStatus === "Terlambat" && "text-destructive", "font-medium")}>{selectedAssignmentForDetail.submissionStatus}</p></div>}
                  {selectedAssignmentForDetail.studentSubmissionLink && <div><Label className="text-muted-foreground">Link Pengumpulan:</Label><Button variant="link" asChild className="p-0 h-auto block"><NextLink href={selectedAssignmentForDetail.studentSubmissionLink} target="_blank" rel="noopener noreferrer"><LinkIcon className="inline-block mr-1 h-4 w-4"/> Lihat File</NextLink></Button></div>}
                  {selectedAssignmentForDetail.studentSubmissionNotes && <div><Label className="text-muted-foreground">Catatan Pengumpulan:</Label><p className="whitespace-pre-line">{selectedAssignmentForDetail.studentSubmissionNotes}</p></div>}
                  {selectedAssignmentForDetail.result && (
                    <div className="mt-3 pt-3 border-t">
                      <Label className="text-base font-semibold text-primary">Hasil Penilaian:</Label>
                      <div className="mt-1 space-y-1">
                        <p><span className="text-muted-foreground">Nilai:</span> <span className="font-bold text-lg">{selectedAssignmentForDetail.result.score ?? "Belum dinilai"}</span></p>
                        {selectedAssignmentForDetail.result.feedback && <p><span className="text-muted-foreground">Feedback Guru:</span> {selectedAssignmentForDetail.result.feedback}</p>}
                        {selectedAssignmentForDetail.result.dateOfAssessment && <p className="text-xs text-muted-foreground">Dinilai pada: {format(selectedAssignmentForDetail.result.dateOfAssessment.toDate(), "dd MMM yyyy", { locale: indonesiaLocale })}</p>}
                      </div>
                    </div>
                  )}
                </>
              )}
              {(isTeacherOrAdminRole) && (
                <div><Label className="text-muted-foreground">Total Pengumpulan:</Label><p className="font-medium">{selectedAssignmentForDetail.submissionCount ?? 0} / {selectedAssignmentForDetail.totalStudentsInClass ?? 0} siswa</p></div>
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

