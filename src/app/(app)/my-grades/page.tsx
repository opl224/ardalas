
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
import { BarChart3, AlertCircle, Link as LinkIcon, MoreVertical, Download, FileDown, Hourglass } from "lucide-react"; // Added Hourglass
import LottieLoader from "@/components/ui/LottieLoader";
import Link from "next/link";
import { format } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";
import { useSidebar } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";


const ASSESSMENT_TYPES_MY_GRADES = ["UTS", "UAS", "Tugas Harian", "Kuis", "Proyek", "Praktikum", "Lainnya"] as const;
type AssessmentTypeMyGrades = typeof ASSESSMENT_TYPES_MY_GRADES[number];

interface MyGradeEntry {
  id: string;
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
  isSentToStudent?: boolean;
}

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
  isSentToStudent?: boolean;
}

interface GroupedGradeDisplay {
  subjectName: string;
  studentName: string;
  resultsForThisSubject: MyGradeEntry[];
}


export default function MyGradesPage() {
  const { user, loading: authLoading, role } = useAuth();
  const [allGrades, setAllGrades] = useState<MyGradeEntry[]>([]);
  const [groupedGrades, setGroupedGrades] = useState<GroupedGradeDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { isMobile } = useSidebar();
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchMyGrades = async () => {
      if (authLoading || !user) {
        setIsLoading(false);
        setAllGrades([]);
        setGroupedGrades([]);
        return;
      }

      const studentAuthId = role === "siswa" ? user.uid : user.linkedStudentId;

      if (!studentAuthId) {
        setIsLoading(false);
        setAllGrades([]);
        setGroupedGrades([]);
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
          setAllGrades([]);
          setGroupedGrades([]);
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
            isSentToStudent: result.isSentToStudent ?? false,
          };
        });
        setAllGrades(finalGradesData);

        const subjectMap = new Map<string, MyGradeEntry[]>();
        finalGradesData.forEach(grade => {
          const key = grade.subjectName || "Tanpa Mata Pelajaran";
          if (!subjectMap.has(key)) {
            subjectMap.set(key, []);
          }
          subjectMap.get(key)!.push(grade);
        });

        const studentNameDisplay = role === "siswa" ? user?.displayName : user?.linkedStudentName;
        const newGroupedGrades: GroupedGradeDisplay[] = Array.from(subjectMap.entries()).map(([subject, results]) => ({
          subjectName: subject,
          studentName: studentNameDisplay || "Siswa",
          resultsForThisSubject: results,
        }));
        setGroupedGrades(newGroupedGrades);


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
        setAllGrades([]);
        setGroupedGrades([]);
    }
  }, [authLoading, user, role, toast]);


  const handleDownloadBySubjectAndType = (subjectName: string, assessmentType: AssessmentTypeMyGrades, studentName: string, resultsForType: MyGradeEntry[]) => {
    if (resultsForType.length === 0) {
        toast({title: "Tidak Ada Data", description: `Tidak ada hasil untuk ${assessmentType} pada mata pelajaran ${subjectName}.`, variant: "info"});
        return;
    }

    const fileName = `Hasil_${studentName.replace(/\s+/g, '_')}_${subjectName.replace(/\s+/g, '_')}_${assessmentType.replace(/\s+/g, '_')}.pdf`;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Hasil Belajar - ${studentName}`, 14, 20);
    doc.setFontSize(12);
    doc.text(`Mata Pelajaran: ${subjectName}`, 14, 28);
    doc.text(`Tipe Asesmen: ${assessmentType}`, 14, 36);

    const tableBody = resultsForType.map(grade => [
        `${grade.assessmentTitle}${grade.meetingNumber ? ` (P${grade.meetingNumber})` : ''}`,
        grade.score?.toString() || 'Belum Dinilai',
        grade.dateOfAssessment ? format(grade.dateOfAssessment.toDate(), "dd MMM yyyy", { locale: indonesiaLocale }) : '-',
        grade.teacherFeedback || '-',
        grade.submissionLink || 'N/A'
    ]);

    autoTable(doc, {
      startY: 44,
      head: [['Judul', 'Nilai', 'Tanggal Penilaian', 'Komentar Guru', 'Link Tugas']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [64, 149, 237] },
      columnStyles: {
        0: { cellWidth: 50 }, // Judul
        1: { cellWidth: 15 }, // Nilai
        2: { cellWidth: 25 }, // Tanggal
        3: { cellWidth: 'auto' }, // Komentar
        4: { cellWidth: 30 }, // Link
      }
    });

    doc.save(fileName);
    toast({title: "Unduhan Dimulai", description: `${fileName} sedang diunduh.`});
  };


  const handleExportAllMyGrades = async (formatType: 'xlsx' | 'pdf') => {
    if (allGrades.length === 0) {
      toast({ title: "Tidak Ada Data", description: "Tidak ada hasil belajar untuk diekspor.", variant: "info" });
      return;
    }
    setIsExporting(true);
    const studentName = role === "siswa" ? user?.displayName : user?.linkedStudentName;
    const fileNameBase = `Semua_Hasil_Belajar_${studentName?.replace(/\s+/g, '_') || 'Siswa'}`;

    const dataToExport = allGrades
      .filter(grade => grade.isSentToStudent === true) // Only export sent grades
      .map((grade, index) => ({
        "No.": index + 1,
        "Judul Asesmen/Tugas": `${grade.assessmentTitle}${grade.meetingNumber ? ` (P${grade.meetingNumber})` : ''}`,
        "Mata Pelajaran": grade.subjectName || "-",
        "Tipe Asesmen": grade.assessmentType || "-",
        "Nilai": grade.score ?? "Belum Dinilai",
        "Komentar Guru": grade.teacherFeedback || "-",
        "Tanggal Dinilai": grade.dateOfAssessment ? format(grade.dateOfAssessment.toDate(), "dd MMM yyyy", { locale: indonesiaLocale }) : "-",
        "Link Tugas": grade.submissionLink || "Tidak Ada",
      }));

    if (dataToExport.length === 0) {
      toast({ title: "Tidak Ada Hasil Terkirim", description: "Tidak ada hasil belajar yang sudah dikirim oleh guru untuk diekspor.", variant: "info" });
      setIsExporting(false);
      return;
    }

    try {
      if (formatType === 'xlsx') {
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Hasil Belajar");

        XLSX.utils.sheet_add_aoa(worksheet, [
          [`Laporan Semua Hasil Belajar (Terkirim) - ${studentName || 'Siswa'}`],
          [`Tanggal Ekspor: ${format(new Date(), "dd MMMM yyyy HH:mm", { locale: indonesiaLocale })}`],
          []
        ], { origin: "A1" });

        const cols = Object.keys(dataToExport[0] || {}).map(key => ({ wch: Math.max(20, key.length + 5) }));
        worksheet['!cols'] = cols;

        XLSX.writeFile(workbook, `${fileNameBase}_Terkirim.xlsx`);
        toast({ title: "Ekspor Excel Berhasil", description: `${fileNameBase}_Terkirim.xlsx telah diunduh.` });
      } else if (formatType === 'pdf') {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(16);
        doc.text(`Laporan Semua Hasil Belajar (Terkirim) - ${studentName || 'Siswa'}`, 14, 15);
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
            0: { cellWidth: 8 },
            1: { cellWidth: 40 },
            2: { cellWidth: 25 },
            3: { cellWidth: 25 },
            4: { cellWidth: 12 },
            5: { cellWidth: 40 },
            6: { cellWidth: 20 },
            7: { cellWidth: 'auto' },
          }
        });
        doc.save(`${fileNameBase}_Terkirim.pdf`);
        toast({ title: "Ekspor PDF Berhasil", description: `${fileNameBase}_Terkirim.pdf telah diunduh.` });
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
        {allGrades.filter(g => g.isSentToStudent).length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={isExporting}>
                {isExporting && <LottieLoader width={16} height={16} className="mr-2" />}
                <FileDown className="mr-2 h-4 w-4" /> Ekspor Hasil Terkirim
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
          {groupedGrades.length > 0 ? (
            <div className="overflow-x-auto mt-4">
              <Table className={cn(isMobile && "table-fixed w-full")}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={cn(isMobile ? "w-10 px-2 text-center" : "w-[50px]")}>No.</TableHead>
                    <TableHead className={cn(isMobile ? "w-2/5 px-2" : "")}>Nama Siswa</TableHead>
                    <TableHead className={cn(isMobile ? "w-2/5 px-2" : "")}>Mata Pelajaran</TableHead>
                    <TableHead className={cn("text-right", isMobile ? "w-12 px-1" : "w-1/4")}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedGrades.map((group, index) => {
                    const sentAssessmentTypes = Array.from(
                      new Set(
                        group.resultsForThisSubject
                          .filter(r => r.isSentToStudent === true && r.assessmentType)
                          .map(r => r.assessmentType)
                      )
                    ).filter(Boolean) as AssessmentTypeMyGrades[];

                    return (
                        <TableRow key={group.subjectName}>
                        <TableCell className={cn(isMobile ? "px-2 text-center" : "")}>{index + 1}</TableCell>
                        <TableCell className={cn("font-medium", isMobile ? "truncate px-2" : "")} title={group.studentName}>
                            {group.studentName}
                        </TableCell>
                        <TableCell className={cn("truncate", isMobile ? "px-2" : "")} title={group.subjectName}>
                            {group.subjectName}
                        </TableCell>
                        <TableCell className={cn("text-right", isMobile ? "px-1" : "")}>
                            {sentAssessmentTypes.length > 0 ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`Opsi untuk ${group.subjectName}`}>
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                {sentAssessmentTypes.map(type => (
                                    <DropdownMenuItem
                                        key={type}
                                        onSelect={() => handleDownloadBySubjectAndType(
                                            group.subjectName,
                                            type,
                                            group.studentName,
                                            group.resultsForThisSubject.filter(r => r.assessmentType === type && r.isSentToStudent === true)
                                        )}
                                    >
                                    <Download className="mr-2 h-4 w-4" />
                                    Unduh Hasil {type}
                                    </DropdownMenuItem>
                                ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            ) : (
                              <div className="flex items-center justify-end text-muted-foreground" title="Belum ada hasil terkirim">
                                <Hourglass className="h-4 w-4" />
                              </div>
                            )}
                        </TableCell>
                        </TableRow>
                    );
                   })}
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
    </div>
  );
}


    