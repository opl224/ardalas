
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
import { useState, useEffect, useMemo } from "react";
import { BarChart3, AlertCircle, Link as LinkIcon, MoreVertical, Eye } from "lucide-react";
import LottieLoader from "@/components/ui/LottieLoader";
import Link from "next/link";
import { format } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
  meetingNumber?: number; 
}

export default function MyGradesPage() {
  const { user, loading: authLoading, role } = useAuth();
  const [grades, setGrades] = useState<MyGradeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { isMobile } = useSidebar();
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedGradeForDetail, setSelectedGradeForDetail] = useState<MyGradeEntry | null>(null);

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
        const resultsMap = new Map<string, any>();
        if (assignmentIds.length > 0) {
            const resultsPromises = [];
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

        const combinedGradesData: MyGradeEntry[] = classAssignments.map(assignment => {
          const submission = submissionsMap.get(assignment.id);
          const result = resultsMap.get(assignment.id);

          return {
            assignmentId: assignment.id,
            assignmentTitle: assignment.title, 
            meetingNumber: assignment.meetingNumber,
            subjectName: assignment.subjectName,
            submissionLink: submission?.submissionLink,
            teacherFeedback: result?.feedback,
            score: result?.score,
            maxScore: result?.maxScore,
            grade: result?.grade,
            dateOfAssessment: result?.dateOfAssessment,
          };
        }).filter(entry => entry.score !== undefined || entry.submissionLink !== undefined); 

        setGrades(combinedGradesData);

      } catch (error) {
        console.error("Error fetching student grades:", error);
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

  const openDetailDialog = (grade: MyGradeEntry) => {
    setSelectedGradeForDetail(grade);
    setIsDetailDialogOpen(true);
  };


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
              <LottieLoader width={32} height={32} className="mr-2" />
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

  const pageTitleText = role === "siswa" ? "Nilai Tugas Saya" : `Nilai Tugas ${user.linkedStudentName || "Anak"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">{pageTitleText}</h1>
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
              <Table className={cn(isMobile && "table-fixed w-full")}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={cn(isMobile ? "w-10 px-2 text-center" : "w-[50px]")}>No.</TableHead>
                    <TableHead className={cn(isMobile && "px-2")}>Judul</TableHead>
                    {!isMobile && <TableHead>Link Tugas</TableHead>}
                    {!isMobile && <TableHead>Komentar Guru</TableHead>}
                    <TableHead className={cn(isMobile ? "w-16 px-1 text-center" : "min-w-[80px]")}>Nilai</TableHead>
                    <TableHead className={cn("text-right", isMobile ? "w-12 px-1" : "w-16")}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grades.map((grade, index) => (
                    <TableRow key={grade.assignmentId}>
                      <TableCell className={cn(isMobile ? "px-2 text-center" : "")}>{index + 1}</TableCell>
                      {isMobile ? (
                        <TableCell className="font-medium truncate px-2" title={grade.assignmentTitle + (grade.meetingNumber ? ` (P${grade.meetingNumber})` : '')}>
                          {grade.assignmentTitle}{grade.meetingNumber ? ` (P${grade.meetingNumber})` : ''}
                        </TableCell>
                      ) : (
                        <TableCell className="font-medium min-w-[200px]" title={grade.assignmentTitle + (grade.meetingNumber ? ` (P${grade.meetingNumber})` : '')}>
                          {grade.assignmentTitle}{grade.meetingNumber ? ` (P${grade.meetingNumber})` : ''}
                          {grade.subjectName && <p className="text-xs text-muted-foreground">{grade.subjectName}</p>}
                          {grade.dateOfAssessment && (
                              <p className="text-xs text-muted-foreground">
                                  Dinilai: {format(grade.dateOfAssessment.toDate(), "dd MMM yyyy", { locale: indonesiaLocale })}
                              </p>
                          )}
                        </TableCell>
                      )}
                      {!isMobile && (
                        <>
                          <TableCell className="min-w-[120px]">
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
                          <TableCell className="max-w-[250px] whitespace-pre-line min-w-[200px]">
                            {grade.teacherFeedback || "-"}
                          </TableCell>
                        </>
                      )}
                      <TableCell className={cn(isMobile ? "text-center px-1" : "")}>
                        {grade.score !== undefined ? (
                          grade.score
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Belum Dinilai</span>
                        )}
                      </TableCell>
                      <TableCell className={cn("text-right", isMobile ? "px-1" : "")}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Opsi untuk ${grade.assignmentTitle}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDetailDialog(grade)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Lihat Detail
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detail Hasil Tugas</DialogTitle>
            <DialogDescription>
              Informasi lengkap mengenai hasil tugas yang dipilih.
            </DialogDescription>
          </DialogHeader>
          {selectedGradeForDetail && (
            <div className="space-y-3 py-4 max-h-[60vh] overflow-y-auto pr-2 text-sm">
              <div><Label className="text-muted-foreground">Judul Tugas:</Label><p className="font-medium">{selectedGradeForDetail.assignmentTitle}{selectedGradeForDetail.meetingNumber ? ` (Pertemuan ${selectedGradeForDetail.meetingNumber})` : ''}</p></div>
              {selectedGradeForDetail.subjectName && <div><Label className="text-muted-foreground">Mata Pelajaran:</Label><p className="font-medium">{selectedGradeForDetail.subjectName}</p></div>}
              {selectedGradeForDetail.dateOfAssessment && <div><Label className="text-muted-foreground">Tanggal Penilaian:</Label><p className="font-medium">{format(selectedGradeForDetail.dateOfAssessment.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale })}</p></div>}
              
              <div><Label className="text-muted-foreground">Nilai:</Label><p className="font-semibold text-lg">{selectedGradeForDetail.score ?? "Belum Dinilai"}</p></div>
              
              {selectedGradeForDetail.submissionLink ? (
                 <div>
                    <Label className="text-muted-foreground">Link Pengumpulan:</Label>
                    <Button variant="link" asChild className="p-0 h-auto block">
                        <Link href={selectedGradeForDetail.submissionLink} target="_blank" rel="noopener noreferrer">
                        <LinkIcon className="inline-block mr-1 h-3.5 w-3.5" />Lihat File Pengumpulan
                        </Link>
                    </Button>
                 </div>
              ) : (
                 <div><Label className="text-muted-foreground">Link Pengumpulan:</Label><p className="italic text-muted-foreground">Tidak ada / Belum dikumpulkan</p></div>
              )}

              <div><Label className="text-muted-foreground">Komentar Guru:</Label>
                {selectedGradeForDetail.teacherFeedback ? (
                    <p className="whitespace-pre-line bg-muted/50 p-2 rounded-md">{selectedGradeForDetail.teacherFeedback}</p>
                ) : (
                    <p className="italic text-muted-foreground">Tidak ada komentar.</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Tutup</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

    
