
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
import { BarChart3, AlertCircle, Link as LinkIcon, MoreVertical, Eye, FileDown, Download } from "lucide-react";
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";

// Copied AssessmentType from results/page.tsx, consider moving to a shared config
const ASSESSMENT_TYPES_MY_GRADES = ["UTS", "UAS", "Tugas Harian", "Kuis", "Proyek", "Praktikum", "Lainnya"] as const;
type AssessmentTypeMyGrades = typeof ASSESSMENT_TYPES_MY_GRADES[number];

interface MyGradeEntry {
  id: string; // Result document ID
  assessmentTitle: string;
  assessmentType?: AssessmentTypeMyGrades;
  subjectName?: string;
  score?: number;
  maxScore?: number;
  dateOfAssessment?: Timestamp;
  teacherFeedback?: string;
  assignmentId?: string;
  meetingNumber?: number;
  submissionLink?: string;
}

// Minimal interface for data structure from "results" collection
interface ResultDocData {
  id: string;
  studentId: string;
  assessmentTitle: string;
  assessmentType?: AssessmentTypeMyGrades;
  subjectName?: string;
  score?: number;
  maxScore?: number;
  dateOfAssessment?: Timestamp;
  feedback?: string;
  assignmentId?: string;
  meetingNumber?: number;
  // ... other fields from results if needed
}


export default function MyGradesPage() {
  const { user, loading: authLoading, role } = useAuth();
  const [grades, setGrades] = useState<MyGradeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { isMobile } = useSidebar();
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedGradeForDetail, setSelectedGradeForDetail] = useState<MyGradeEntry | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchMyGrades = async () => {
      if (authLoading || !user) {
        setIsLoading(false);
        setGrades([]);
        return;
      }

      const studentAuthId = role === "siswa" ? user.uid : user.linkedStudentId;
      
      if (!studentAuthId) {
        setIsLoading(false);
        setGrades([]);
        return;
      }

      setIsLoading(true);
      try {
        const resultsQuery = query(
          collection(db, "results"),
          where("studentId", "==", studentAuthId),
          orderBy("dateOfAssessment", "desc")
        );
        const resultsSnapshot = await getDocs(resultsQuery);
        const fetchedResultsData = resultsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ResultDocData));

        if (fetchedResultsData.length === 0) {
          setGrades([]);
          setIsLoading(false);
          return;
        }

        const assignmentIdsWithSubmissionsToFetch = fetchedResultsData
          .map(r => r.assignmentId)
          .filter((id): id is string => !!id);

        const submissionsMap = new Map<string, { submissionLink?: string }>();
        if (assignmentIdsWithSubmissionsToFetch.length > 0) {
          const submissionsPromises = [];
          for (let i = 0; i < assignmentIdsWithSubmissionsToFetch.length; i += 30) {
            const chunk = assignmentIdsWithSubmissionsToFetch.slice(i, i + 30);
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
              const subData = doc.data();
              if (subData.assignmentId) {
                submissionsMap.set(subData.assignmentId, { submissionLink: subData.submissionLink });
              }
            });
          });
        }

        const finalGradesData: MyGradeEntry[] = fetchedResultsData.map(result => {
          let submissionLinkEntry: string | undefined = undefined;
          if (result.assignmentId && submissionsMap.has(result.assignmentId)) {
            submissionLinkEntry = submissionsMap.get(result.assignmentId)?.submissionLink;
          }
          return {
            id: result.id,
            assessmentTitle: result.assessmentTitle,
            assessmentType: result.assessmentType,
            subjectName: result.subjectName,
            score: result.score,
            maxScore: result.maxScore,
            dateOfAssessment: result.dateOfAssessment,
            teacherFeedback: result.feedback,
            assignmentId: result.assignmentId,
            meetingNumber: result.meetingNumber,
            submissionLink: submissionLinkEntry,
          };
        });
        setGrades(finalGradesData);

      } catch (error) {
        console.error("Error fetching student grades:", error);
        toast({ title: "Gagal Memuat Hasil Belajar", variant: "destructive" });
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
  }, [authLoading, user, role, toast]);

  const openDetailDialog = (grade: MyGradeEntry) => {
    setSelectedGradeForDetail(grade);
    setIsDetailDialogOpen(true);
  };

  const handleDownloadSingleResult = (grade: MyGradeEntry) => {
    if (!grade.score === undefined) {
        toast({title: "Belum Dinilai", description: "Hasil belajar ini belum memiliki nilai.", variant: "info"});
        return;
    }

    const studentName = role === "siswa" ? user?.displayName : user?.linkedStudentName;
    const fileName = `Hasil_Belajar_${studentName?.replace(/\s+/g, '_') || 'Siswa'}_${grade.assessmentTitle.replace(/\s+/g, '_')}.pdf`;
    
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Detail Hasil Belajar - ${studentName || 'Siswa'}`, 14, 20);
    doc.setFontSize(12);

    autoTable(doc, {
      startY: 30,
      head: [['Deskripsi', 'Detail']],
      body: [
        ['Judul Asesmen/Tugas', `${grade.assessmentTitle}${grade.meetingNumber ? ` (P${grade.meetingNumber})` : ''}`],
        ['Mata Pelajaran', grade.subjectName || '-'],
        ['Tipe Asesmen', grade.assessmentType || '-'],
        ['Tanggal Penilaian', grade.dateOfAssessment ? format(grade.dateOfAssessment.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale }) : '-'],
        ['Nilai', grade.score?.toString() || 'Belum Dinilai'],
        ['Komentar Guru', grade.teacherFeedback || '-'],
        ['Link Pengumpulan', grade.submissionLink || 'Tidak ada/Belum dikumpulkan'],
      ],
      theme: 'grid',
      headStyles: { fillColor: [64, 149, 237] },
      columnStyles: { 0: { cellWidth: 60 } }
    });

    doc.save(fileName);
    toast({title: "Unduhan Dimulai", description: `${fileName} sedang diunduh.`});
  };

  const handleExportAllMyGrades = async (formatType: 'xlsx' | 'pdf') => {
    if (grades.length === 0) {
      toast({ title: "Tidak Ada Data", description: "Tidak ada hasil belajar untuk diekspor.", variant: "info" });
      return;
    }
    setIsExporting(true);
    const studentName = role === "siswa" ? user?.displayName : user?.linkedStudentName;
    const fileNameBase = `Semua_Hasil_Belajar_${studentName?.replace(/\s+/g, '_') || 'Siswa'}`;

    const dataToExport = grades.map((grade, index) => ({
      "No.": index + 1,
      "Judul Asesmen/Tugas": `${grade.assessmentTitle}${grade.meetingNumber ? ` (P${grade.meetingNumber})` : ''}`,
      "Mata Pelajaran": grade.subjectName || "-",
      "Tipe Asesmen": grade.assessmentType || "-",
      "Nilai": grade.score ?? "Belum Dinilai",
      "Komentar Guru": grade.teacherFeedback || "-",
      "Tanggal Dinilai": grade.dateOfAssessment ? format(grade.dateOfAssessment.toDate(), "dd MMM yyyy", { locale: indonesiaLocale }) : "-",
      "Link Tugas": grade.submissionLink || "Tidak Ada",
    }));

    try {
      if (formatType === 'xlsx') {
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Hasil Belajar");
        
        XLSX.utils.sheet_add_aoa(worksheet, [
          [`Laporan Semua Hasil Belajar - ${studentName || 'Siswa'}`],
          [`Tanggal Ekspor: ${format(new Date(), "dd MMMM yyyy HH:mm", { locale: indonesiaLocale })}`],
          [] 
        ], { origin: "A1" });
        
        const cols = Object.keys(dataToExport[0] || {}).map(key => ({ wch: Math.max(20, key.length + 5) }));
        worksheet['!cols'] = cols;

        XLSX.writeFile(workbook, `${fileNameBase}.xlsx`);
        toast({ title: "Ekspor Excel Berhasil", description: `${fileNameBase}.xlsx telah diunduh.` });
      } else if (formatType === 'pdf') {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(16);
        doc.text(`Laporan Semua Hasil Belajar - ${studentName || 'Siswa'}`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Tanggal Ekspor: ${format(new Date(), "dd MMMM yyyy HH:mm", { locale: indonesiaLocale })}`, 14, 22);

        autoTable(doc, {
          startY: 30,
          head: [Object.keys(dataToExport[0])],
          body: dataToExport.map(row => Object.values(row)),
          theme: 'grid',
          headStyles: { fillColor: [22, 160, 133] },
          styles: { fontSize: 7, cellPadding: 1.5 },
          columnStyles: { 
            0: { cellWidth: 8 }, // No.
            1: { cellWidth: 40 }, // Judul
            2: { cellWidth: 25 }, // Mapel
            3: { cellWidth: 25 }, // Tipe
            4: { cellWidth: 12 }, // Nilai
            5: { cellWidth: 40 }, // Komentar
            6: { cellWidth: 20 }, // Tgl Dinilai
            7: { cellWidth: 'auto' }, // Link
          }
        });
        doc.save(`${fileNameBase}.pdf`);
        toast({ title: "Ekspor PDF Berhasil", description: `${fileNameBase}.pdf telah diunduh.` });
      }
    } catch (error) {
      console.error("Error exporting grades:", error);
      toast({ title: `Gagal Mengekspor ke ${formatType.toUpperCase()}`, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
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
              Memuat hasil belajar...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user || (role !== "siswa" && role !== "orangtua")) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Hasil Belajar Saya</h1>
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
        <h1 className="text-3xl font-bold font-headline">Hasil Belajar Anak</h1>
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

  const pageTitleText = role === "siswa" ? "Hasil Belajar Saya" : `Hasil Belajar ${user.linkedStudentName || "Anak"}`;
  const cardTitleText = "Ringkasan Hasil Belajar";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h1 className="text-3xl font-bold font-headline">{pageTitleText}</h1>
          <p className="text-muted-foreground">Daftar nilai dan umpan balik dari semua asesmen.</p>
        </div>
        {grades.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={isExporting}>
                {isExporting && <LottieLoader width={16} height={16} className="mr-2" />}
                <FileDown className="mr-2 h-4 w-4" /> Ekspor Semua Hasil
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExportAllMyGrades('xlsx')} disabled={isExporting}>
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportAllMyGrades('pdf')} disabled={isExporting}>
                PDF (.pdf)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <BarChart3 className="h-6 w-6 text-primary" />
            <span>{cardTitleText}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {grades.length > 0 ? (
            <div className="overflow-x-auto mt-4">
              <Table className={cn(isMobile && "table-fixed w-full")}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={cn(isMobile ? "w-10 px-2 text-center" : "w-[50px]")}>No.</TableHead>
                    <TableHead className={cn(isMobile && "px-2")}>Judul Asesmen/Tugas</TableHead>
                    <TableHead className={cn(isMobile ? "px-2" : "")}>Mata Pelajaran</TableHead>
                    {!isMobile && <TableHead>Tipe Asesmen</TableHead>}
                    {!isMobile && <TableHead>Tanggal Penilaian</TableHead>}
                    <TableHead className={cn(isMobile ? "w-16 px-1 text-center" : "min-w-[80px]")}>Nilai</TableHead>
                    <TableHead className={cn("text-right", isMobile ? "w-12 px-1" : "w-16")}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grades.map((grade, index) => (
                    <TableRow key={grade.id}>
                      <TableCell className={cn(isMobile ? "px-2 text-center" : "")}>{index + 1}</TableCell>
                      <TableCell className="font-medium truncate px-2" title={grade.assessmentTitle + (grade.meetingNumber ? ` (P${grade.meetingNumber})` : '')}>
                          {grade.assessmentTitle}{grade.meetingNumber ? ` (P${grade.meetingNumber})` : ''}
                      </TableCell>
                      <TableCell className={cn("truncate", isMobile && "px-2")} title={grade.subjectName || undefined}>
                          {grade.subjectName || "-"}
                      </TableCell>
                      {!isMobile && (
                        <>
                          <TableCell className="truncate" title={grade.assessmentType || undefined}>{grade.assessmentType || "-"}</TableCell>
                          <TableCell>
                            {grade.dateOfAssessment ? format(grade.dateOfAssessment.toDate(), "dd MMM yyyy", { locale: indonesiaLocale }) : "-"}
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
                            <Button variant="ghost" size="icon" aria-label={`Opsi untuk ${grade.assessmentTitle}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDetailDialog(grade)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Lihat Detail
                            </DropdownMenuItem>
                             {grade.score !== undefined && (
                                <DropdownMenuItem onClick={() => handleDownloadSingleResult(grade)}>
                                <Download className="mr-2 h-4 w-4" />
                                Download Hasil Ini
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
          ) : (
            <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
              Belum ada data hasil belajar untuk ditampilkan.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detail Hasil Belajar</DialogTitle>
            <DialogDescription>
              Informasi lengkap mengenai hasil asesmen yang dipilih.
            </DialogDescription>
          </DialogHeader>
          {selectedGradeForDetail && (
            <div className="space-y-3 py-4 max-h-[60vh] overflow-y-auto pr-2 text-sm">
              <div><Label className="text-muted-foreground">Judul Asesmen/Tugas:</Label><p className="font-medium">{selectedGradeForDetail.assessmentTitle}{selectedGradeForDetail.meetingNumber ? ` (Pertemuan ${selectedGradeForDetail.meetingNumber})` : ''}</p></div>
              {selectedGradeForDetail.subjectName && <div><Label className="text-muted-foreground">Mata Pelajaran:</Label><p className="font-medium">{selectedGradeForDetail.subjectName}</p></div>}
              {selectedGradeForDetail.assessmentType && <div><Label className="text-muted-foreground">Tipe Asesmen:</Label><p className="font-medium">{selectedGradeForDetail.assessmentType}</p></div>}
              {selectedGradeForDetail.dateOfAssessment && <div><Label className="text-muted-foreground">Tanggal Penilaian:</Label><p className="font-medium">{format(selectedGradeForDetail.dateOfAssessment.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale })}</p></div>}
              
              <div><Label className="text-muted-foreground">Nilai:</Label><p className="font-semibold text-lg">{selectedGradeForDetail.score ?? "Belum Dinilai"}</p></div>
              
              {selectedGradeForDetail.submissionLink ? (
                 <div>
                    <Label className="text-muted-foreground">Link Pengumpulan (Jika Terkait Tugas):</Label>
                    <Button variant="link" asChild className="p-0 h-auto block">
                        <Link href={selectedGradeForDetail.submissionLink} target="_blank" rel="noopener noreferrer">
                        <LinkIcon className="inline-block mr-1 h-3.5 w-3.5" />Lihat File Pengumpulan
                        </Link>
                    </Button>
                 </div>
              ) : (selectedGradeForDetail.assignmentId && 
                 <div><Label className="text-muted-foreground">Link Pengumpulan (Jika Terkait Tugas):</Label><p className="italic text-muted-foreground">Tidak ada / Belum dikumpulkan</p></div>
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
