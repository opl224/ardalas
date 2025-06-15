
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, Timestamp, addDoc, collection, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, BookOpen, User, Clock, Info, FileText, CheckCircle, XCircle } from "lucide-react";
import LottieLoader from "@/components/ui/LottieLoader";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { format, startOfDay, parse, isValid, isWithinInterval } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface LessonDetails {
  id: string;
  subjectName?: string;
  className?: string;
  teacherName?: string;
  dayOfWeek?: string;
  startTime?: string;
  endTime?: string;
  topic?: string;
  materials?: string;
  classId?: string; // Need classId for querying attendance
}

interface StudentSelfAttendanceRecord {
  id?: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  lessonId: string;
  subjectName?: string;
  lessonTime: string;
  date: Timestamp;
  status: "Hadir";
  attendedAt: Timestamp;
}


export default function LessonDetailPage() {
  const params = useParams();
  const lessonId = params.lessonId as string;
  const { user, role, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [lesson, setLesson] = useState<LessonDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [attendanceRecord, setAttendanceRecord] = useState<StudentSelfAttendanceRecord | null>(null);
  const [isEligibleToAttend, setIsEligibleToAttend] = useState(false);
  const [attendanceStatusMessage, setAttendanceStatusMessage] = useState<string | null>(null);
  const [isCheckingAttendance, setIsCheckingAttendance] = useState(true);
  const [isSubmittingAttendance, setIsSubmittingAttendance] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000); // Update time every 30s
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!lessonId || authLoading) {
      return;
    }

    const fetchLessonDetails = async () => {
      setIsLoading(true);
      setIsCheckingAttendance(true);
      setError(null);
      try {
        const lessonDocRef = doc(db, "lessons", lessonId);
        const lessonDocSnap = await getDoc(lessonDocRef);

        if (lessonDocSnap.exists()) {
          const data = lessonDocSnap.data();
          const lessonData = { id: lessonDocSnap.id, ...data } as LessonDetails;

          if ((role === "siswa" && user?.classId && data.classId !== user.classId) ||
              (role === "orangtua" && user?.linkedStudentClassId && data.classId !== user.linkedStudentClassId)) {
            setError("Anda tidak memiliki akses ke detail pelajaran ini.");
            setLesson(null);
          } else {
            setLesson(lessonData);
            // After setting lesson, fetch attendance status if user is student
            if (role === "siswa" && user?.uid && lessonData.id) {
              fetchAttendanceStatus(user.uid, lessonData.id);
            } else {
              setIsCheckingAttendance(false);
            }
          }
        } else {
          setError("Detail pelajaran tidak ditemukan.");
          setLesson(null);
          setIsCheckingAttendance(false);
        }
      } catch (e) {
        console.error("Error fetching lesson details:", e);
        setError("Gagal memuat detail pelajaran.");
        setLesson(null);
        setIsCheckingAttendance(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLessonDetails();
  }, [lessonId, authLoading, user, role]);


  const fetchAttendanceStatus = async (studentUid: string, currentLessonId: string) => {
    setIsCheckingAttendance(true);
    try {
      const todayStart = startOfDay(new Date());
      const attendanceQuery = query(
        collection(db, "studentAttendanceRecords"),
        where("studentId", "==", studentUid),
        where("lessonId", "==", currentLessonId),
        where("date", "==", Timestamp.fromDate(todayStart))
      );
      const attendanceSnapshot = await getDocs(attendanceQuery);
      if (!attendanceSnapshot.empty) {
        const record = attendanceSnapshot.docs[0].data() as StudentSelfAttendanceRecord;
        setAttendanceRecord(record);
      } else {
        setAttendanceRecord(null);
      }
    } catch (e) {
      console.error("Error fetching attendance status:", e);
      toast({ title: "Gagal Cek Status Absen", variant: "destructive" });
    } finally {
      setIsCheckingAttendance(false);
    }
  };

  useEffect(() => {
    if (!lesson || role !== "siswa" || isCheckingAttendance) {
      setIsEligibleToAttend(false);
      setAttendanceStatusMessage(null);
      return;
    }

    if (attendanceRecord) {
      setIsEligibleToAttend(false);
      setAttendanceStatusMessage(`Hadir (Absen pukul ${format(attendanceRecord.attendedAt.toDate(), "HH:mm", { locale: indonesiaLocale })})`);
      return;
    }

    const now = currentTime;
    const today = startOfDay(now);
    const lessonStart = lesson.startTime ? parse(lesson.startTime, "HH:mm", today) : null;
    const lessonEnd = lesson.endTime ? parse(lesson.endTime, "HH:mm", today) : null;

    if (lessonStart && lessonEnd && isValid(lessonStart) && isValid(lessonEnd)) {
      if (isWithinInterval(now, { start: lessonStart, end: lessonEnd })) {
        setIsEligibleToAttend(true);
        setAttendanceStatusMessage("Sesi absen sedang berlangsung.");
      } else if (now < lessonStart) {
        setIsEligibleToAttend(false);
        setAttendanceStatusMessage(`Sesi absen akan dimulai pukul ${lesson.startTime}.`);
      } else {
        setIsEligibleToAttend(false);
        setAttendanceStatusMessage("Sesi absen telah berakhir.");
      }
    } else {
      setIsEligibleToAttend(false);
      setAttendanceStatusMessage("Jadwal pelajaran tidak valid untuk absen.");
    }
  }, [lesson, attendanceRecord, currentTime, role, isCheckingAttendance]);


  const handleSelfAttend = async () => {
    if (!user || !lesson || !user.uid || !user.displayName || !user.className || !lesson.classId || !lesson.subjectName || !lesson.startTime || !lesson.endTime) {
      toast({ title: "Aksi Gagal", description: "Data pengguna atau pelajaran tidak lengkap.", variant: "destructive" });
      return;
    }
    if (!isEligibleToAttend || attendanceRecord) return;

    setIsSubmittingAttendance(true);
    const attendanceData: Omit<StudentSelfAttendanceRecord, 'id' | 'attendedAt'> & {attendedAt: any, date: any} = {
      studentId: user.uid,
      studentName: user.displayName,
      classId: lesson.classId,
      className: user.className, // Assuming student's className is correct for this lesson
      lessonId: lesson.id,
      subjectName: lesson.subjectName,
      lessonTime: `${lesson.startTime} - ${lesson.endTime}`,
      date: Timestamp.fromDate(startOfDay(new Date())),
      status: "Hadir",
      attendedAt: serverTimestamp(),
    };

    try {
      const docRef = await addDoc(collection(db, "studentAttendanceRecords"), attendanceData);
      setAttendanceRecord({ ...attendanceData, id: docRef.id, attendedAt: Timestamp.now() }); // Optimistic update
      toast({ title: "Kehadiran Tercatat", description: `Anda berhasil absen untuk pelajaran ${lesson.subjectName}.` });
    } catch (error) {
      console.error("Error recording self-attendance:", error);
      toast({ title: "Gagal Absen", description: "Terjadi kesalahan. Coba lagi.", variant: "destructive" });
    } finally {
      setIsSubmittingAttendance(false);
    }
  };


  if (isLoading || authLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/2 mb-2" />
            <Skeleton className="h-4 w-1/3" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10">
        <AlertCircle className="w-16 h-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Terjadi Kesalahan</h2>
        <p className="text-muted-foreground">{error}</p>
        <Button asChild className="mt-6">
          <Link href="/lessons">Kembali ke Daftar Pelajaran</Link>
        </Button>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10">
        <Info className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Pelajaran Tidak Ditemukan</h2>
        <p className="text-muted-foreground">
          Detail untuk pelajaran ini tidak dapat ditemukan.
        </p>
        <Button asChild className="mt-6">
          <Link href="/lessons">Kembali ke Daftar Pelajaran</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">
          Detail Pelajaran: {lesson.subjectName || "Tanpa Nama"}
        </h1>
        <p className="text-muted-foreground">
          Informasi lengkap mengenai sesi pelajaran ini.
        </p>
      </div>

      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <BookOpen className="h-7 w-7 text-primary" />
            {lesson.subjectName}
          </CardTitle>
          <CardDescription>
            {lesson.className ? `Kelas: ${lesson.className}` : "Kelas tidak ditentukan"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start space-x-3 p-3 bg-muted/30 rounded-md">
              <User className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Guru Pengajar</p>
                <p className="font-medium">{lesson.teacherName || "-"}</p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-3 bg-muted/30 rounded-md">
              <Clock className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Jadwal</p>
                <p className="font-medium">
                  {lesson.dayOfWeek || "Hari tidak ditentukan"},{" "}
                  {lesson.startTime || "N/A"} - {lesson.endTime || "N/A"}
                </p>
              </div>
            </div>
          </div>

          {role === "siswa" && !isCheckingAttendance && (
            <div className="mt-6 p-4 border border-border rounded-md bg-background shadow">
              <h3 className="text-lg font-semibold mb-2 flex items-center">
                {attendanceRecord ? <CheckCircle className="h-5 w-5 text-green-500 mr-2" /> : 
                 isEligibleToAttend ? <Clock className="h-5 w-5 text-blue-500 mr-2" /> :
                 <XCircle className="h-5 w-5 text-red-500 mr-2" />}
                Status Kehadiran Hari Ini
              </h3>
              <p className="text-sm text-muted-foreground mb-3">{attendanceStatusMessage || "Memeriksa status..."}</p>
              {isEligibleToAttend && !attendanceRecord && (
                <Button 
                  onClick={handleSelfAttend} 
                  disabled={isSubmittingAttendance}
                  className="w-full sm:w-auto"
                >
                  {isSubmittingAttendance && <LottieLoader width={16} height={16} className="mr-2" />}
                  {isSubmittingAttendance ? "Memproses..." : "Absen Sekarang"}
                </Button>
              )}
            </div>
          )}
           {role === "siswa" && isCheckingAttendance && (
             <div className="mt-6 p-4 border border-border rounded-md bg-background shadow flex items-center justify-center">
                <LottieLoader width={24} height={24} className="mr-2" /> Memuat status kehadiran...
             </div>
           )}


          {lesson.topic && (
            <div className="p-3 bg-muted/30 rounded-md">
              <h3 className="text-sm font-semibold text-muted-foreground mb-1">Topik Pelajaran</h3>
              <p className="text-foreground whitespace-pre-line">{lesson.topic}</p>
            </div>
          )}

          {lesson.materials && (
            <div className="p-3 bg-muted/30 rounded-md">
              <h3 className="text-sm font-semibold text-muted-foreground mb-1">Materi & Sumber Belajar</h3>
              <p className="text-foreground whitespace-pre-line">
                {lesson.materials}
              </p>
            </div>
          )}

          {!lesson.topic && !lesson.materials && (
             <div className="p-4 border border-dashed border-border rounded-md text-center text-muted-foreground">
                Tidak ada detail topik atau materi tambahan untuk pelajaran ini.
            </div>
          )}
          
          <div className="mt-6 pt-4 border-t border-border">
            <h3 className="text-lg font-semibold mb-2">Sumber Daya Terkait</h3>
            <p className="text-sm text-muted-foreground">
              (Area ini dapat digunakan untuk menampilkan tugas, kuis, atau tautan sumber daya yang relevan dengan pelajaran ini.)
            </p>
          </div>

           <div className="mt-8 text-center">
                <Button asChild variant="outline">
                    <Link href="/lessons">
                        Kembali ke Daftar Pelajaran
                    </Link>
                </Button>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}


