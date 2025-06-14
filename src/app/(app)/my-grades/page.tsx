
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
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  orderBy,
} from "firebase/firestore";
import { useState, useEffect } from "react";
import { BarChart3, AlertCircle, Loader2, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";

interface MyGradeEntry {
  assignmentId: string;
  assignmentTitle: string;
  subjectName?: string; 
  submissionLink?: string;
  teacherFeedback?: string;
  score?: number;
  maxScore?: number;
  grade?: string;
  dateOfAssessment?: Timestamp; 
}

export default function MyGradesPage() {
  const { user, loading: authLoading, role } = useAuth();
  const [grades, setGrades] = useState<MyGradeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMyGrades = async () => {
      if (authLoading || !user) {
        setIsLoading(false);
        setGrades([]);
        return;
      }

      const studentAuthId = role === "siswa" ? user.uid : user.linkedStudentId;
      const studentClassId = role === "siswa" ? user.classId : user.linkedStudentClassId;

      if (!studentAuthId || !studentClassId) {
        setIsLoading(false);
        setGrades([]);
        return;
      }

      setIsLoading(true);
      try {
        // 1. Fetch assignments for the student's class
        const assignmentsQuery = query(
          collection(db, "assignments"),
          where("classId", "==", studentClassId),
          orderBy("dueDate", "desc")
        );
        const assignmentsSnapshot = await getDocs(assignmentsQuery);
        const classAssignments = assignmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

        if (classAssignments.length === 0) {
          setGrades([]);
          setIsLoading(false);
          return;
        }

        const assignmentIds = classAssignments.map(a => a.id);

        // 2. Fetch all results for the student for these assignments
        const resultsMap = new Map<string, any>();
        if (assignmentIds.length > 0) {
            const resultsPromises = [];
            // Firestore 'in' queries are limited to 30 items in the array.
            for (let i = 0; i < assignmentIds.length; i += 30) {
                const chunk = assignmentIds.slice(i, i + 30);
                resultsPromises.push(
                    getDocs(query(
                        collection(db, "results"),
                        where("studentId", "==", studentAuthId),
                        where("assignmentId", "in", chunk)
                    ))
                );
            }
            const resultsSnapshots = await Promise.all(resultsPromises);
            resultsSnapshots.forEach(snapshot => {
                snapshot.forEach(doc => {
                    const resultData = doc.data();
                    if (resultData.assignmentId) {
                        resultsMap.set(resultData.assignmentId, { id: doc.id, ...resultData });
                    }
                });
            });
        }


        // 3. Fetch all submissions for the student for these assignments
        const submissionsMap = new Map<string, any>();
         if (assignmentIds.length > 0) {
            const submissionsPromises = [];
            for (let i = 0; i < assignmentIds.length; i += 30) {
                const chunk = assignmentIds.slice(i, i + 30);
                submissionsPromises.push(
                    getDocs(query(
                        collection(db, "assignmentSubmissions"),
                        where("studentId", "==", studentAuthId),
                        where("assignmentId", "in", chunk)
                    ))
                );
            }
            const submissionsSnapshots = await Promise.all(submissionsPromises);
             submissionsSnapshots.forEach(snapshot => {
                snapshot.forEach(doc => {
                    const submissionData = doc.data();
                    if (submissionData.assignmentId) { 
                       submissionsMap.set(submissionData.assignmentId, { id: doc.id, ...submissionData });
                    }
                });
            });
        }

        // 4. Combine data
        const combinedGradesData: MyGradeEntry[] = classAssignments.map(assignment => {
          const submission = submissionsMap.get(assignment.id);
          const result = resultsMap.get(assignment.id);

          return {
            assignmentId: assignment.id,
            assignmentTitle: `${assignment.title}${assignment.meetingNumber ? ` (P${assignment.meetingNumber})` : ''}`,
            subjectName: assignment.subjectName,
            submissionLink: submission?.submissionLink,
            teacherFeedback: result?.feedback,
            score: result?.score,
            maxScore: result?.maxScore,
            grade: result?.grade,
            dateOfAssessment: result?.dateOfAssessment,
          };
        }).filter(entry => entry.score !== undefined || entry.submissionLink !== undefined); // Show if scored OR submitted

        setGrades(combinedGradesData);

      } catch (error) {
        console.error("Error fetching student grades:", error);
        // Optionally, set an error state to display to the user
      } finally {
        setIsLoading(false);
      }
    };

    if (!authLoading && user) {
        fetchMyGrades();
    } else if (!authLoading && !user) {
        setIsLoading(false);
        setGrades([]);
    }
  }, [authLoading, user, role]);

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/3" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 mr-2 animate-spin text-primary" />
              Memuat nilai tugas...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user || (role !== "siswa" && role !== "orangtua")) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Nilai Tugas Saya</h1>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <AlertCircle className="w-12 h-12 mb-4 text-destructive" />
              <p className="font-semibold">Akses Ditolak.</p>
              <p>Halaman ini hanya untuk siswa dan orang tua.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (role === "orangtua" && !user.linkedStudentId) {
     return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Nilai Tugas Anak</h1>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <AlertCircle className="w-12 h-12 mb-4 text-warning" />
              <p className="font-semibold">Siswa Belum Tertaut</p>
              <p>Akun Anda belum terhubung dengan data siswa. Silakan hubungi administrator sekolah.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">
          {role === "siswa" ? "Nilai Tugas Saya" : `Nilai Tugas ${user.linkedStudentName || "Anak"}`}
        </h1>
        <p className="text-muted-foreground">Daftar nilai dari tugas-tugas yang telah dikerjakan dan dinilai.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <BarChart3 className="h-6 w-6 text-primary" />
            <span>Ringkasan Nilai Tugas</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {grades.length > 0 ? (
            <div className="overflow-x-auto mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Judul</TableHead>
                    <TableHead>Link Tugas</TableHead>
                    <TableHead>Komentar Guru</TableHead>
                    <TableHead>Nilai</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grades.map((grade) => (
                    <TableRow key={grade.assignmentId}>
                      <TableCell className="font-medium">
                        {grade.assignmentTitle}
                        {grade.subjectName && <p className="text-xs text-muted-foreground">{grade.subjectName}</p>}
                         {grade.dateOfAssessment && (
                            <p className="text-xs text-muted-foreground">
                                Dinilai: {format(grade.dateOfAssessment.toDate(), "dd MMM yyyy", { locale: indonesiaLocale })}
                            </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {grade.submissionLink ? (
                          <Button variant="link" asChild className="p-0 h-auto text-sm">
                            <Link href={grade.submissionLink} target="_blank" rel="noopener noreferrer">
                              <LinkIcon className="mr-1 h-3 w-3" />Lihat File
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Belum dikumpulkan</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[250px] whitespace-pre-line">
                        {grade.teacherFeedback || "-"}
                      </TableCell>
                      <TableCell>
                        {grade.score !== undefined ? (
                          `${grade.score}${grade.maxScore && grade.maxScore !== 100 ? `/${grade.maxScore}` : '/100'}`
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Belum Dinilai</span>
                        )}
                        {grade.grade && <span className="ml-1 text-xs">({grade.grade})</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
              Belum ada data nilai tugas untuk ditampilkan.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


    