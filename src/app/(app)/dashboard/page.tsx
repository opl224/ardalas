
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone, CalendarDays, BookOpen, ArrowRight, Users, GraduationCap, Library, ExternalLink, BookCopy, ClipboardCheck, School } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, Timestamp, orderBy, limit, documentId } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ElementType;
  loading: boolean;
  description?: string;
  href?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, loading, description, href }) => (
  <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md hover:shadow-lg transition-shadow duration-300">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-base font-medium">{title}</CardTitle>
      <Icon className="h-5 w-5 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      {loading ? (
        <Skeleton className="h-8 w-20 my-1" />
      ) : (
        <div className="text-3xl font-bold">{value}</div>
      )}
      {description && !loading && (
        <p className="text-xs text-muted-foreground pt-1">{description}</p>
      )}
      {href && !loading && (
         <Button variant="link" size="sm" asChild className="p-0 h-auto text-xs mt-2 text-primary">
            <Link href={href}>
                Lihat Detail <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
        </Button>
      )}
    </CardContent>
  </Card>
);


interface Announcement {
  id: string;
  title: string;
  date: Timestamp;
  content: string;
  targetAudience: string[];
}

interface DashboardStats {
  // Admin specific
  adminTotalStudents: number;
  adminTotalTeachers: number;
  adminTotalSubjects: number;
  adminTotalClasses: number;
  // Teacher specific
  teacherTotalStudentsTaught: number;
  teacherTotalClassesTaught: number;
  teacherTotalSubjectsTaught: number;
  teacherTotalAssignmentsGiven: number;
}

export default function DashboardPage() {
  const { user, role } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    adminTotalStudents: 0,
    adminTotalTeachers: 0,
    adminTotalSubjects: 0,
    adminTotalClasses: 0,
    teacherTotalStudentsTaught: 0,
    teacherTotalClassesTaught: 0,
    teacherTotalSubjectsTaught: 0,
    teacherTotalAssignmentsGiven: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [recentAnnouncements, setRecentAnnouncements] = useState<Announcement[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);

  useEffect(() => {
    const fetchAllData = async () => {
      if (!user || !role) {
        setLoadingStats(false);
        setLoadingAnnouncements(false);
        setStats({ 
            adminTotalStudents: 0, adminTotalTeachers: 0, adminTotalSubjects: 0, adminTotalClasses: 0,
            teacherTotalStudentsTaught: 0, teacherTotalClassesTaught: 0, teacherTotalSubjectsTaught: 0, teacherTotalAssignmentsGiven: 0,
        });
        setRecentAnnouncements([]);
        return;
      }

      setLoadingStats(true);
      setLoadingAnnouncements(true);
      
      const newStats: DashboardStats = {
        adminTotalStudents: 0, adminTotalTeachers: 0, adminTotalSubjects: 0, adminTotalClasses: 0,
        teacherTotalStudentsTaught: 0, teacherTotalClassesTaught: 0, teacherTotalSubjectsTaught: 0, teacherTotalAssignmentsGiven: 0,
      };

      try {
        if (role === 'admin') {
          const studentQuery = query(collection(db, "users"), where("role", "==", "siswa"));
          const teacherUserQuery = query(collection(db, "users"), where("role", "==", "guru"));
          const subjectsQuery = collection(db, "subjects");
          const classesQuery = collection(db, "classes");

          const [studentSnap, teacherUserSnap, subjectSnap, classSnap] = await Promise.all([
            getDocs(studentQuery),
            getDocs(teacherUserSnap),
            getDocs(subjectsQuery),
            getDocs(classesQuery),
          ]);

          newStats.adminTotalStudents = studentSnap.size;
          newStats.adminTotalTeachers = teacherUserSnap.size;
          newStats.adminTotalSubjects = subjectSnap.size;
          newStats.adminTotalClasses = classSnap.size;

        } else if (role === 'guru' && user.uid) {
            // Query for the teacher's profile in 'teachers' collection using their Auth UID
            const teacherProfileQuery = query(collection(db, "teachers"), where("uid", "==", user.uid), limit(1));
            const teacherProfileSnapshot = await getDocs(teacherProfileQuery);

            if (!teacherProfileSnapshot.empty) {
                const teacherProfileDoc = teacherProfileSnapshot.docs[0];
                const teacherProfileId = teacherProfileDoc.id; // This is the Document ID from 'teachers' collection

                // Fetch lessons taught by this teacher using the teacher's profile ID
                const lessonsQuery = query(collection(db, "lessons"), where("teacherId", "==", teacherProfileId));
                const lessonsSnapshot = await getDocs(lessonsQuery);
              
                const teacherLessonsData = lessonsSnapshot.docs.map(doc => doc.data());
                const taughtClassIds = new Set<string>();
                const taughtSubjectIds = new Set<string>();

                teacherLessonsData.forEach(lesson => {
                    if (lesson.classId) taughtClassIds.add(lesson.classId);
                    if (lesson.subjectId) taughtSubjectIds.add(lesson.subjectId);
                });

                newStats.teacherTotalClassesTaught = taughtClassIds.size;
                newStats.teacherTotalSubjectsTaught = taughtSubjectIds.size;

                // Fetch total assignments given by this teacher
                const assignmentsGivenQuery = query(collection(db, "assignments"), where("teacherId", "==", teacherProfileId));
                const assignmentsGivenSnap = await getDocs(assignmentsGivenQuery);
                newStats.teacherTotalAssignmentsGiven = assignmentsGivenSnap.size;


                if (taughtClassIds.size > 0) {
                    const studentClassesArray = Array.from(taughtClassIds);
                    const allStudentIds = new Set<string>();
                    const CHUNK_SIZE = 30; 

                    for (let i = 0; i < studentClassesArray.length; i += CHUNK_SIZE) {
                        const chunk = studentClassesArray.slice(i, i + CHUNK_SIZE);
                        if (chunk.length > 0) {
                            const studentsTaughtQuery = query(
                                collection(db, "users"), 
                                where("role", "==", "siswa"), 
                                where("classId", "in", chunk)
                            );
                            const studentsTaughtSnapshot = await getDocs(studentsTaughtQuery);
                            studentsTaughtSnapshot.forEach(doc => allStudentIds.add(doc.id));
                        }
                    }
                    newStats.teacherTotalStudentsTaught = allStudentIds.size;
                } else {
                    newStats.teacherTotalStudentsTaught = 0;
                }
            } else {
                // No teacher profile found for this Auth UID, stats remain 0
                 console.warn(`No teacher profile found in 'teachers' collection linked to Auth UID: ${user.uid}. Ensure a teacher profile exists and its 'uid' field matches the Firebase Auth UID.`);
            }
        }
        setStats(newStats);
      } catch (error) {
        console.error("Error fetching stats: ", error);
        // Reset stats on error to avoid displaying stale or incorrect data
        setStats({
            adminTotalStudents: 0, adminTotalTeachers: 0, adminTotalSubjects: 0, adminTotalClasses: 0,
            teacherTotalStudentsTaught: 0, teacherTotalClassesTaught: 0, teacherTotalSubjectsTaught: 0, teacherTotalAssignmentsGiven: 0,
        });
      } finally {
        setLoadingStats(false);
      }

      try {
        const announcementsRef = collection(db, "announcements");
        let announcementsQueryInstance;
        
        // Adjusting announcement query based on user role and context
        if (role === 'siswa' && user?.classId) {
           announcementsQueryInstance = query(
            announcementsRef,
            where("targetAudience", "array-contains-any", [role, "semua"]), // Simpler general query first
            orderBy("date", "desc"),
            limit(10) // Fetch more initially to filter client-side for class-specific ones if needed
          );
        } else if (role === 'orangtua' && user?.linkedStudentClassId) {
           announcementsQueryInstance = query(
            announcementsRef,
            where("targetAudience", "array-contains-any", [role, "semua"]),
            orderBy("date", "desc"),
            limit(10)
          );
        } else if (role === 'guru') { 
           announcementsQueryInstance = query(
            announcementsRef,
             where("targetAudience", "array-contains-any", ["guru", "semua"]), 
            orderBy("date", "desc"),
            limit(3)
          );
        }
        else { // Admin or general fallback
         announcementsQueryInstance = query(announcementsRef, orderBy("date", "desc"), limit(3));
        }

        const querySnapshot = await getDocs(announcementsQueryInstance);
        let fetchedAnnouncements = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Announcement[];

        // Client-side filtering for class-specific announcements if needed
        if (role === 'siswa' && user?.classId) {
            fetchedAnnouncements = fetchedAnnouncements.filter(ann => 
                ann.targetAudience.includes(role) || 
                ann.targetAudience.includes("semua") ||
                (ann.targetClassIds && ann.targetClassIds.includes(user.classId!))
            ).slice(0,3);
        } else if (role === 'orangtua' && user?.linkedStudentClassId) {
             fetchedAnnouncements = fetchedAnnouncements.filter(ann => 
                ann.targetAudience.includes(role) || 
                ann.targetAudience.includes("semua") ||
                (ann.targetClassIds && ann.targetClassIds.includes(user.linkedStudentClassId!))
            ).slice(0,3);
        }
        
        setRecentAnnouncements(fetchedAnnouncements);
      } catch (error) {
        console.error("Error fetching announcements:", error);
      } finally {
        setLoadingAnnouncements(false);
      }
    };
    
    if (user && role) {
        fetchAllData();
    } else if (!user && !loadingStats) { 
        setLoadingStats(false);
        setLoadingAnnouncements(false);
    }

  }, [user, role]);

  const quickLinks = [
    { title: "Lihat Pengumuman", href: "/announcements", icon: Megaphone, description: "Info terbaru dari sekolah." },
    { title: "Jadwal Pelajaran", href: "/lessons", icon: BookCopy, description: "Lihat jadwal pelajaran." },
    { title: "Acara Sekolah", href: "/events", icon: CalendarDays, description: "Jadwal kegiatan penting." },
  ];
  
  if (role === 'siswa') {
    quickLinks.push({ title: "Tugas Saya", href: "/assignments", icon: ClipboardCheck, description: "Lihat dan kerjakan tugas." });
    quickLinks.push({ title: "Nilai Saya", href: "/my-grades", icon: GraduationCap, description: "Periksa hasil belajarmu." });
  }


  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">
          Selamat Datang{user?.displayName ? `, ${user.displayName}` : ''}!
        </h1>
        <p className="text-muted-foreground">Platform manajemen informasi sekolah Anda.</p>
      </div>

      {role === 'admin' && (
        <section>
          <h2 className="text-2xl font-semibold mb-4 font-headline">Statistik Sekolah</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total Siswa" value={stats.adminTotalStudents} icon={Users} loading={loadingStats} href="/admin/user-administration" />
            <StatCard title="Total Guru" value={stats.adminTotalTeachers} icon={GraduationCap} loading={loadingStats} href="/admin/user-administration" />
            <StatCard title="Total Kelas" value={stats.adminTotalClasses} icon={School} loading={loadingStats} href="/classes" />
            <StatCard title="Total Mata Pelajaran" value={stats.adminTotalSubjects} icon={Library} loading={loadingStats} href="/subjects" />
          </div>
        </section>
      )}

      {role === 'guru' && (
        <section>
          <h2 className="text-2xl font-semibold mb-4 font-headline">Statistik Pengajaran Anda</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total Siswa Diajar" value={stats.teacherTotalStudentsTaught} icon={Users} loading={loadingStats} />
            <StatCard title="Total Kelas Diajar" value={stats.teacherTotalClassesTaught} icon={School} loading={loadingStats} />
            <StatCard title="Total Mapel Diajar" value={stats.teacherTotalSubjectsTaught} icon={Library} loading={loadingStats} />
            <StatCard title="Total Tugas Diberikan" value={stats.teacherTotalAssignmentsGiven} icon={ClipboardCheck} loading={loadingStats} href="/assignments" />
          </div>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-semibold mb-4 font-headline">Akses Cepat</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quickLinks.slice(0, role === 'siswa' ? 5 : (role === 'guru' ? 3 : 3)).map((link) => ( 
            <Card key={link.title} className="bg-card/70 backdrop-blur-sm border-border shadow-md hover:shadow-lg transition-shadow duration-300">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-lg font-medium">{link.title}</CardTitle>
                <link.icon className="h-6 w-6 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">{link.description}</p>
                <Button variant="outline" size="sm" asChild className="border-primary text-primary hover:bg-primary/10">
                  <Link href={link.href}>
                    Lihat Detail <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold font-headline">Pengumuman Terbaru</h2>
          <Button variant="link" asChild className="text-primary">
            <Link href="/announcements">Lihat Semua</Link>
          </Button>
        </div>
        {loadingAnnouncements ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-md" />
            <Skeleton className="h-32 w-full rounded-md" />
          </div>
        ) : recentAnnouncements.length > 0 ? (
          <div className="space-y-4">
            {recentAnnouncements.map((announcement) => (
              <Card key={announcement.id} className="bg-card/70 backdrop-blur-sm border-border shadow-md">
                <CardHeader>
                  <CardTitle className="text-lg">{announcement.title}</CardTitle>
                  <CardDescription>
                     {format(announcement.date.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale })}
                     {announcement.targetAudience && announcement.targetAudience.length > 0 && (
                        <span className="text-xs text-muted-foreground ml-2">
                            (Untuk: {announcement.targetAudience.map(aud => aud.charAt(0).toUpperCase() + aud.slice(1)).join(", ")})
                        </span>
                     )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-line line-clamp-2">{announcement.content}</p>
                  <Button variant="outline" size="sm" asChild className="mt-3 border-primary text-primary hover:bg-primary/10">
                    <Link href={`/announcements`}>
                      Baca Selengkapnya
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
            <CardContent className="pt-6 text-center text-muted-foreground">
              <Megaphone className="mx-auto h-10 w-10 mb-3" />
              Tidak ada pengumuman terbaru.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

    
