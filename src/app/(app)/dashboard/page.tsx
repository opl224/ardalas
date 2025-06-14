
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone, CalendarDays, BookOpen, ArrowRight, Users, GraduationCap, Library, ExternalLink, BookCopy, ClipboardCheck, School } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, Timestamp, orderBy, limit } from "firebase/firestore";
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
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [recentAnnouncements, setRecentAnnouncements] = useState<Announcement[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoadingStats(true);
      const statsUpdate: Partial<DashboardStats> = {};

      try {
        if (role === 'admin') {
          const studentQuery = query(collection(db, "users"), where("role", "==", "siswa"));
          const teacherUserQuery = query(collection(db, "users"), where("role", "==", "guru")); // Querying users collection for teachers
          const subjectsQuery = collection(db, "subjects");
          const classesQuery = collection(db, "classes");

          const [studentSnap, teacherUserSnap, subjectSnap, classSnap] = await Promise.all([
            getDocs(studentQuery),
            getDocs(teacherUserQuery),
            getDocs(subjectsQuery),
            getDocs(classesQuery),
          ]);

          statsUpdate.adminTotalStudents = studentSnap.size;
          statsUpdate.adminTotalTeachers = teacherUserSnap.size;
          statsUpdate.adminTotalSubjects = subjectSnap.size;
          statsUpdate.adminTotalClasses = classSnap.size;
        } else if (role === 'guru' && user?.uid) {
          const lessonsQuery = query(collection(db, "lessons"), where("teacherId", "==", user.uid));
          const lessonsSnapshot = await getDocs(lessonsQuery);
          
          const teacherLessonsData = lessonsSnapshot.docs.map(doc => doc.data());
          const taughtClassIds = new Set<string>();
          const taughtSubjectIds = new Set<string>();

          teacherLessonsData.forEach(lesson => {
            if (lesson.classId) taughtClassIds.add(lesson.classId);
            if (lesson.subjectId) taughtSubjectIds.add(lesson.subjectId);
          });

          statsUpdate.teacherTotalClassesTaught = taughtClassIds.size;
          statsUpdate.teacherTotalSubjectsTaught = taughtSubjectIds.size;

          if (taughtClassIds.size > 0) {
            const studentClassesArray = Array.from(taughtClassIds);
            // Firestore 'in' queries are limited. If more than 30 classes, chunking is needed.
            // For simplicity, assuming fewer than 30 classes taught by one teacher for now.
            const studentsTaughtQuery = query(collection(db, "users"), where("role", "==", "siswa"), where("classId", "in", studentClassesArray));
            const studentsTaughtSnapshot = await getDocs(studentsTaughtQuery);
            statsUpdate.teacherTotalStudentsTaught = studentsTaughtSnapshot.size;
          } else {
            statsUpdate.teacherTotalStudentsTaught = 0;
          }
        }
        
        setStats(prevStats => ({ ...prevStats, ...statsUpdate }));

      } catch (error) {
        console.error("Error fetching stats: ", error);
      } finally {
        setLoadingStats(false);
      }
    };

    const fetchRecentAnnouncements = async () => {
      setLoadingAnnouncements(true);
      try {
        const announcementsRef = collection(db, "announcements");
        let q;
        if (role && user?.classId && (role === 'siswa' || role === 'orangtua')) {
           q = query(
            announcementsRef,
            where("targetAudience", "array-contains-any", [role, "semua"]), 
            orderBy("date", "desc"),
            limit(3)
          );
        } else if (role === 'guru' && user?.uid) {
           q = query(
            announcementsRef,
             where("targetAudience", "array-contains", "guru"),
            orderBy("date", "desc"),
            limit(3)
          );
        }
        else {
         q = query(announcementsRef, orderBy("date", "desc"), limit(3));
        }

        const querySnapshot = await getDocs(q);
        const fetchedAnnouncements = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Announcement[];
        setRecentAnnouncements(fetchedAnnouncements);
      } catch (error) {
        console.error("Error fetching announcements:", error);
      } finally {
        setLoadingAnnouncements(false);
      }
    };

    if (user) { // Fetch stats only if user is available
        fetchStats();
        fetchRecentAnnouncements();
    } else if (!user && !loadingStats) { // If no user and not loading, set loading to false
        setLoadingStats(false);
        setLoadingAnnouncements(false);
    }
  }, [role, user, loadingStats]); // Added loadingStats to dependency to prevent re-fetch if already loaded

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

      {/* Stats Section */}
      {role === 'admin' && (
        <section>
          <h2 className="text-2xl font-semibold mb-4 font-headline">Statistik Sekolah</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total Siswa" value={stats.adminTotalStudents} icon={Users} loading={loadingStats} href="/students" />
            <StatCard title="Total Guru" value={stats.adminTotalTeachers} icon={GraduationCap} loading={loadingStats} href="/teachers" />
            <StatCard title="Total Kelas" value={stats.adminTotalClasses} icon={School} loading={loadingStats} href="/classes" />
            <StatCard title="Total Mata Pelajaran" value={stats.adminTotalSubjects} icon={Library} loading={loadingStats} href="/subjects" />
          </div>
        </section>
      )}

      {role === 'guru' && (
        <section>
          <h2 className="text-2xl font-semibold mb-4 font-headline">Statistik Pengajaran Anda</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"> {/* Adjusted to 3 columns for teacher */}
            <StatCard title="Total Siswa Diajar" value={stats.teacherTotalStudentsTaught} icon={Users} loading={loadingStats} />
            <StatCard title="Total Kelas Diajar" value={stats.teacherTotalClassesTaught} icon={School} loading={loadingStats} />
            <StatCard title="Total Mapel Diajar" value={stats.teacherTotalSubjectsTaught} icon={Library} loading={loadingStats} />
          </div>
        </section>
      )}


      {/* Quick Access Links */}
      <section>
        <h2 className="text-2xl font-semibold mb-4 font-headline">Akses Cepat</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quickLinks.slice(0, role === 'siswa' ? 5 : (role === 'guru' ? 3 : 3)).map((link) => ( // Adjusted slice for guru
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

      {/* Recent Announcements */}
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

