
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

export default function DashboardPage() {
  const { user, role } = useAuth();
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    totalSubjects: 0,
    totalClasses: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [recentAnnouncements, setRecentAnnouncements] = useState<Announcement[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const studentQuery = query(collection(db, "users"), where("role", "==", "siswa"));
        const teacherQuery = query(collection(db, "users"), where("role", "==", "guru"));
        const subjectsQuery = collection(db, "subjects");
        const classesQuery = collection(db, "classes");

        const [studentSnap, teacherSnap, subjectSnap, classSnap] = await Promise.all([
          getDocs(studentQuery),
          getDocs(teacherQuery),
          getDocs(subjectsQuery),
          getDocs(classesQuery),
        ]);

        setStats({
          totalStudents: studentSnap.size,
          totalTeachers: teacherSnap.size,
          totalSubjects: subjectSnap.size,
          totalClasses: classSnap.size,
        });
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
          // More complex query if we need to filter by targetAudience and targetClassIds for students/parents
          // For simplicity, showing general announcements or those targeted broadly to their role
           q = query(
            announcementsRef,
            where("targetAudience", "array-contains-any", [role, "semua"]), // "semua" is a hypothetical general target
            orderBy("date", "desc"),
            limit(3)
          );
        } else if (role === 'guru' && user?.uid) {
           q = query(
            announcementsRef,
             where("targetAudience", "array-contains", "guru"),
            // or where("createdById", "==", user.uid) if teachers only see their own
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


    fetchStats();
    fetchRecentAnnouncements();
  }, [role, user]);

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
      {(role === 'admin' || role === 'guru') && (
        <section>
          <h2 className="text-2xl font-semibold mb-4 font-headline">Statistik Sekolah</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total Siswa" value={stats.totalStudents} icon={Users} loading={loadingStats} href="/students" />
            <StatCard title="Total Guru" value={stats.totalTeachers} icon={GraduationCap} loading={loadingStats} href="/teachers" />
            <StatCard title="Total Kelas" value={stats.totalClasses} icon={School} loading={loadingStats} href="/classes" />
            <StatCard title="Total Mata Pelajaran" value={stats.totalSubjects} icon={Library} loading={loadingStats} href="/subjects" />
          </div>
        </section>
      )}

      {/* Quick Access Links */}
      <section>
        <h2 className="text-2xl font-semibold mb-4 font-headline">Akses Cepat</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quickLinks.slice(0, role === 'siswa' ? 5 : 3).map((link) => (
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
                            (Untuk: {announcement.targetAudience.join(", ")})
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

