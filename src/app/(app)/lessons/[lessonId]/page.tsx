
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
import { format, startOfDay, parse, isValid, isWithinInterval, getDay } from "date-fns";
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

const DAY_NAMES_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];


export default function LessonDetailPage() {
  const paramsFromHook = useParams();
  const [lessonId, setLessonId] = useState<string | null>(null);

  const { user, role, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [lesson, setLesson] = useState<LessonDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isAttendanceButtonVisible, setIsAttendanceButtonVisible] = useState(false);
  const [hasAttendedToday, setHasAttendedToday] = useState(false);
  const [isSubmittingAttendance, setIsSubmittingAttendance] = useState(false);


  useEffect(() => {
    if (paramsFromHook && typeof paramsFromHook.lessonId === 'string') {
      setLessonId(paramsFromHook.lessonId);
    } else if (paramsFromHook && paramsFromHook.lessonId !== undefined) {
      setError("ID Pelajaran tidak valid.");
      setIsLoading(false);
      setLessonId(null);
    }
  }, [paramsFromHook]);


  useEffect(() => {
    if (!lessonId || authLoading) {
      if (lessonId === null && paramsFromHook && !authLoading) {
        setError("ID Pelajaran tidak ditemukan di URL.");
        setIsLoading(false);
      }
      return;
    }

    const fetchLessonDetails = async () => {
      setIsLoading(true);
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
          }
        } else {
          setError("Detail pelajaran tidak ditemukan.");
          setLesson(null);
        }
      } catch (e) {
        console.error("Error fetching lesson details:", e);
        setError("Gagal memuat detail pelajaran.");
        setLesson(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLessonDetails();
  }, [lessonId, authLoading, user, role]);
  
  useEffect(() => {
    if (!lesson || !user || role !== 'orangtua' || !user.linkedStudentId) {
      setIsAttendanceButtonVisible(false);
      return;
    }

    const checkAttendanceStatus = async () => {
        const now = new Date();
        const currentDayName = DAY_NAMES_ID[getDay(now)];
        
        if (lesson.dayOfWeek !== currentDayName || !lesson.startTime || !lesson.endTime) {
            setIsAttendanceButtonVisible(false);
            return;
        }

        const lessonStartTime = parse(lesson.startTime, "HH:mm", now);
        const lessonEndTime = parse(lesson.endTime, "HH:mm", now);

        if (!isValid(lessonStartTime) || !isValid(lessonEndTime) || !isWithinInterval(now, { start: lessonStartTime, end: lessonEndTime })) {
            setIsAttendanceButtonVisible(false);
            return;
        }

        const todayStart = startOfDay(now);
        const attendanceQuery = query(
            collection(db, "student_attendances"),
            where("studentId", "==", user.linkedStudentId),
            where("lessonId", "==", lesson.id),
            where("date", ">=", Timestamp.fromDate(todayStart))
        );
        
        try {
            const querySnapshot = await getDocs(attendanceQuery);
            setHasAttendedToday(!querySnapshot.empty);
            setIsAttendanceButtonVisible(true);
        } catch (e) {
            console.error("Error checking attendance status:", e);
            // Hide button on error to be safe
            setIsAttendanceButtonVisible(false);
        }
    };

    checkAttendanceStatus();
    // Re-check every minute
    const intervalId = setInterval(checkAttendanceStatus, 60000);
    return () => clearInterval(intervalId);

  }, [lesson, user, role]);


  const handleMarkAttendance = async () => {
    if (!lesson || !user || role !== 'orangtua' || !user.linkedStudentId || !user.linkedStudentName || !user.linkedStudentClassId || !user.linkedStudentClassName || hasAttendedToday) {
        toast({ title: "Gagal Absen", description: "Kondisi tidak terpenuhi atau sudah absen.", variant: "destructive"});
        return;
    }

    setIsSubmittingAttendance(true);
    try {
        const attendanceRecord: Omit<StudentSelfAttendanceRecord, 'id'> = {
            studentId: user.linkedStudentId,
            studentName: user.linkedStudentName,
            classId: user.linkedStudentClassId,
            className: user.linkedStudentClassName,
            lessonId: lesson.id,
            subjectName: lesson.subjectName,
            lessonTime: `${lesson.startTime} - ${lesson.endTime}`,
            date: Timestamp.fromDate(startOfDay(new Date())),
            status: "Hadir",
            attendedAt: serverTimestamp() as Timestamp,
        };
        
        await addDoc(collection(db, "student_attendances"), attendanceRecord);

        setHasAttendedToday(true);
        toast({
            title: "Absensi Berhasil",
            description: `${user.linkedStudentName} telah ditandai hadir pada pelajaran ${lesson.subjectName}.`,
        });
    } catch (e) {
        console.error("Error submitting attendance:", e);
        toast({ title: "Gagal Menyimpan Absensi", variant: "destructive" });
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
          
           {isAttendanceButtonVisible && (
            <div className="mt-6 p-4 border border-dashed rounded-md text-center">
              {hasAttendedToday ? (
                <div className="flex flex-col items-center gap-2 text-green-600">
                    <CheckCircle className="h-8 w-8" />
                    <p className="font-semibold">Anak Anda sudah diabsen Hadir untuk pelajaran ini hari ini.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                    <p className="font-semibold">Pelajaran sedang berlangsung!</p>
                    <Button onClick={handleMarkAttendance} disabled={isSubmittingAttendance}>
                        {isSubmittingAttendance && <LottieLoader width={16} height={16} className="mr-2" />}
                        {isSubmittingAttendance ? "Mengabsen..." : `Absenkan ${user?.linkedStudentName || 'Anak'} Sekarang`}
                    </Button>
                </div>
              )}
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
