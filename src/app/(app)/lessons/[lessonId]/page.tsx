
"use client";

import { useEffect, useState } from "react";
import { useParams }
from "next/navigation";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, BookOpen, User, Clock, Info, FileText } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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
  // Potentially add fields for assignments, resources, video links etc.
}

export default function LessonDetailPage() {
  const params = useParams();
  const lessonId = params.lessonId as string;
  const { user, role, loading: authLoading } = useAuth();
  const [lesson, setLesson] = useState<LessonDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lessonId || authLoading) {
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
          // Basic access control: Ensure the lesson belongs to the student's class if they are a student
          if (role === "siswa" && user?.classId && data.classId !== user.classId) {
            setError("Anda tidak memiliki akses ke detail pelajaran ini.");
            setLesson(null);
          } else if (role === "orangtua" && user?.linkedStudentClassId && data.classId !== user.linkedStudentClassId){
            setError("Anda tidak memiliki akses ke detail pelajaran ini.");
            setLesson(null);
          }
          else {
            setLesson({ id: lessonDocSnap.id, ...data } as LessonDetails);
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
              {/* You can add logic here to render links if materials contain URLs */}
            </div>
          )}

          {!lesson.topic && !lesson.materials && (
             <div className="p-4 border border-dashed border-border rounded-md text-center text-muted-foreground">
                Tidak ada detail topik atau materi tambahan untuk pelajaran ini.
            </div>
          )}

          {/* Placeholder for future content like assignments, resources, etc. */}
          <div className="mt-6 pt-4 border-t border-border">
            <h3 className="text-lg font-semibold mb-2">Sumber Daya Terkait</h3>
            <p className="text-sm text-muted-foreground">
              (Area ini dapat digunakan untuk menampilkan tugas, kuis, atau tautan sumber daya yang relevan dengan pelajaran ini.)
            </p>
            <div className="mt-3 flex gap-2">
              {/* Example: <Button variant="outline" size="sm"><FileText className="mr-2 h-4 w-4" /> Lihat Tugas</Button> */}
            </div>
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
