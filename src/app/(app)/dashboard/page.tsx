
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone, CalendarDays, BookOpen, ArrowRight, Users, GraduationCap, Library, ExternalLink, BookCopy, ClipboardCheck, School, CalendarCheck, UserCircle } from "lucide-react";
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
  targetClassIds?: string[];
  createdById?: string;
}

interface DashboardStats {
  // Admin specific
  adminTotalStudents: number;
  adminTotalTeachers: number;
  adminTotalSubjects: number;
  adminTotalClasses: number;
  adminTotalParents: number; 
  // Teacher specific
  teacherTotalStudentsTaught: number;
  teacherTotalClassesTaught: number;
  teacherTotalSubjectsTaught: number;
  teacherTotalAssignmentsGiven: number;
  // Parent specific
  parentChildClassStudentCount: number;
  parentChildTotalLessons: number;
  parentChildTotalAssignments: number;
  parentChildAttendancePercentage: string;
}

export default function DashboardPage() {
  const { user, role, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    adminTotalStudents: 0,
    adminTotalTeachers: 0,
    adminTotalSubjects: 0,
    adminTotalClasses: 0,
    adminTotalParents: 0,
    teacherTotalStudentsTaught: 0,
    teacherTotalClassesTaught: 0,
    teacherTotalSubjectsTaught: 0,
    teacherTotalAssignmentsGiven: 0,
    parentChildClassStudentCount: 0,
    parentChildTotalLessons: 0,
    parentChildTotalAssignments: 0,
    parentChildAttendancePercentage: "0%",
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
            adminTotalStudents: 0, adminTotalTeachers: 0, adminTotalSubjects: 0, adminTotalClasses: 0, adminTotalParents: 0,
            teacherTotalStudentsTaught: 0, teacherTotalClassesTaught: 0, teacherTotalSubjectsTaught: 0, teacherTotalAssignmentsGiven: 0,
            parentChildClassStudentCount: 0, parentChildTotalLessons: 0, parentChildTotalAssignments: 0, parentChildAttendancePercentage: "0%",
        });
        setRecentAnnouncements([]);
        return;
      }

      setLoadingStats(true);
      setLoadingAnnouncements(true);

      const newStats: DashboardStats = {
        adminTotalStudents: 0, adminTotalTeachers: 0, adminTotalSubjects: 0, adminTotalClasses: 0, adminTotalParents: 0,
        teacherTotalStudentsTaught: 0, teacherTotalClassesTaught: 0, teacherTotalSubjectsTaught: 0, teacherTotalAssignmentsGiven: 0,
        parentChildClassStudentCount: 0, parentChildTotalLessons: 0, parentChildTotalAssignments: 0, parentChildAttendancePercentage: "0%",
      };

      try {
        if (role === 'admin') {
          const studentQuery = query(collection(db, "users"), where("role", "==", "siswa"));
          const teacherUserQuery = query(collection(db, "users"), where("role", "==", "guru"));
          const parentUserQuery = query(collection(db, "users"), where("role", "==", "orangtua"));
          const subjectsQuery = collection(db, "subjects");
          const classesQuery = collection(db, "classes");

          const [studentSnap, teacherUserSnap, parentUserSnap, subjectSnap, classSnap] = await Promise.all([
            getDocs(studentQuery),
            getDocs(teacherUserQuery),
            getDocs(parentUserSnap),
            getDocs(subjectsQuery),
            getDocs(classesQuery),
          ]);

          newStats.adminTotalStudents = studentSnap.size;
          newStats.adminTotalTeachers = teacherUserSnap.size;
          newStats.adminTotalParents = parentUserSnap.size;
          newStats.adminTotalSubjects = subjectSnap.size;
          newStats.adminTotalClasses = classSnap.size;

        } else if (role === 'guru' && user.uid) {
            const teacherProfileQuery = query(collection(db, "teachers"), where("uid", "==", user.uid), limit(1));
            const teacherProfileSnapshot = await getDocs(teacherProfileQuery);

            if (!teacherProfileSnapshot.empty) {
                const teacherProfileDoc = teacherProfileSnapshot.docs[0];
                const teacherProfileId = teacherProfileDoc.id;

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
                 console.warn(\`No teacher profile found in 'teachers' collection linked to Auth UID: \${user.uid}. Ensure a teacher profile exists and its 'uid' field matches the Firebase Auth UID.\`);
            }
        } else if (role === 'orangtua' && user.uid && user.linkedStudentClassId) {
            const classId = user.linkedStudentClassId;

            const studentsInClassQuery = query(collection(db, "users"), where("role", "==", "siswa"), where("classId", "==", classId));
            const studentsInClassSnap = await getDocs(studentsInClassQuery);
            newStats.parentChildClassStudentCount = studentsInClassSnap.size;

            const lessonsInClassQuery = query(collection(db, "lessons"), where("classId", "==", classId));
            const lessonsInClassSnap = await getDocs(lessonsInClassQuery);
            newStats.parentChildTotalLessons = lessonsInClassSnap.size;

            if (user.linkedStudentId) {
                const assignmentsQuery = query(collection(db, "assignments"), where("classId", "==", classId));
                const assignmentsSnap = await getDocs(assignmentsQuery);
                newStats.parentChildTotalAssignments = assignmentsSnap.size;
            } else {
                 newStats.parentChildTotalAssignments = 0;
            }
            // Placeholder for attendance - this would need more complex logic
            newStats.parentChildAttendancePercentage = "0%";
        }
        setStats(newStats);
      } catch (error) {
        console.error("Error fetching stats: ", error);
        setStats({ // Reset to default on error
            adminTotalStudents: 0, adminTotalTeachers: 0, adminTotalSubjects: 0, adminTotalClasses: 0, adminTotalParents: 0,
            teacherTotalStudentsTaught: 0, teacherTotalClassesTaught: 0, teacherTotalSubjectsTaught: 0, teacherTotalAssignmentsGiven: 0,
            parentChildClassStudentCount: 0, parentChildTotalLessons: 0, parentChildTotalAssignments: 0, parentChildAttendancePercentage: "0%",
        });
      } finally {
        setLoadingStats(false);
      }

      try {
        const announcementsRef = collection(db, "announcements");
        let announcementsQueryInstance;

        if (role === 'siswa' && user?.classId) {
           announcementsQueryInstance = query(
            announcementsRef,
            orderBy("date", "desc"),
            limit(10) // Fetch more initially to ensure enough after filtering
          );
        } else if (role === 'orangtua' && user?.linkedStudentClassId) {
           announcementsQueryInstance = query(
            announcementsRef,
            orderBy("date", "desc"),
            limit(10)
          );
        } else if (role === 'guru') {
           announcementsQueryInstance = query(
            announcementsRef,
            orderBy("date", "desc"),
            limit(10)
          );
        }
        else { // Admin or other roles
         announcementsQueryInstance = query(announcementsRef, orderBy("date", "desc"), limit(3));
        }

        const querySnapshot = await getDocs(announcementsQueryInstance);
        let fetchedAnnouncements = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Announcement[];

        // Client-side filtering based on role and class if needed
        if (user) {
            if (role === 'siswa' && user.classId) {
                fetchedAnnouncements = fetchedAnnouncements.filter(ann =>
                    ann.targetAudience.includes(role!) || // Target audience includes 'siswa'
                    (ann.targetClassIds && ann.targetClassIds.includes(user.classId!)) // Or target class includes student's class
                ).slice(0,3); // Then take top 3
            } else if (role === 'orangtua' && user.linkedStudentClassId) {
                 fetchedAnnouncements = fetchedAnnouncements.filter(ann =>
                    ann.targetAudience.includes(role!) ||
                    (ann.targetClassIds && ann.targetClassIds.includes(user.linkedStudentClassId!))
                ).slice(0,3);
            } else if (role === 'guru') { // For teachers, show if target is 'guru', 'semua', or created by them
                fetchedAnnouncements = fetchedAnnouncements.filter(ann =>
                    ann.targetAudience.includes('guru') ||
                    ann.targetAudience.includes('semua') || // 'semua' might need to be a defined role or constant
                    ann.createdById === user.uid
                ).slice(0, 3);
            }
        }

        setRecentAnnouncements(fetchedAnnouncements);
      } catch (error) {
        console.error("Error fetching announcements:", error);
        // setRecentAnnouncements([]); // Clear or handle error appropriately
      } finally {
        setLoadingAnnouncements(false);
      }
    };

    if (user && role) { // Ensure user and role are available
        fetchAllData();
    } else if (!user && !authLoading) { // If not loading and no user, stop loading indicators
        setLoadingStats(false);
        setLoadingAnnouncements(false);
    }

  }, [user, role, authLoading]);


  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">
          Selamat Datang{user?.displayName ? \`, \${user.displayName}\` : ''}!
        </h1>
        <p className="text-muted-foreground">Platform manajemen informasi sekolah Ardalas.</p>
      </div>

      {role === 'admin' && (
        <section>
          <h2 className="text-2xl font-semibold mb-4 font-headline">Statistik Sekolah</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <StatCard title="Total Siswa" value={stats.adminTotalStudents} icon={Users} loading={loadingStats} href="/students" />
            <StatCard title="Total Guru" value={stats.adminTotalTeachers} icon={GraduationCap} loading={loadingStats} href="/teachers" />
            <StatCard title="Total Orang Tua" value={stats.adminTotalParents} icon={UserCircle} loading={loadingStats} href="/parents" />
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

      {role === 'siswa' && user && (
        <section>
          <h2 className="text-2xl font-semibold mb-4 font-headline">Info Cepat Siswa</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
                <CardHeader className="pb-2"><CardTitle className="text-base font-medium">Kelas Saya</CardTitle></CardHeader>
                <CardContent>
                    <div className="text-3xl font-bold">{user.className || user.classId || "Belum ada kelas"}</div>
                    <p className="text-xs text-muted-foreground pt-1">Informasi kelas Anda saat ini.</p>
                     <Button variant="link" size="sm" asChild className="p-0 h-auto text-xs mt-2 text-primary"><Link href="/my-class">Detail Kelas <ExternalLink className="ml-1 h-3 w-3" /></Link></Button>
                </CardContent>
            </Card>
             {/* Placeholder, actual data to be fetched */}
             <StatCard title="Jumlah Tugas" value={0} icon={ClipboardCheck} loading={loadingStats} description="Tugas aktif dan belum dikerjakan." href="/assignments"/>
             <StatCard title="Kehadiran Bulan Ini" value={"0%"} icon={CalendarCheck} loading={loadingStats} description="Persentase kehadiran Anda." href="/attendance"/>
          </div>
        </section>
      )}

      {role === 'orangtua' && user && (
         <section>
          <h2 className="text-2xl font-semibold mb-4 font-headline">Info Cepat Anak ({user.linkedStudentName || "Siswa"})</h2>
           <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
                <CardHeader className="pb-2"><CardTitle className="text-base font-medium">Kelas Anak</CardTitle></CardHeader>
                <CardContent>
                    <div className="text-3xl font-bold">
                      {loadingStats ? <Skeleton className="h-8 w-32" /> :
                       (user.linkedStudentClassName || user.linkedStudentClassId || "0")
                      }
                    </div>
                    <div className="text-xs text-muted-foreground pt-1">
                      {loadingStats ? <Skeleton className="h-4 w-24" /> :
                       \`(\${stats.parentChildClassStudentCount || 0} siswa)\`
                      }
                    </div>
                    {user.linkedStudentClassId && !loadingStats && <Button variant="link" size="sm" asChild className="p-0 h-auto text-xs mt-2 text-primary"><Link href={'/classes'}>Detail Kelas <ExternalLink className="ml-1 h-3 w-3" /></Link></Button>}
                </CardContent>
            </Card>
             <StatCard title="Jadwal Pelajaran Anak" value={loadingStats ? "" : (stats.parentChildTotalLessons || 0)} icon={BookCopy} loading={loadingStats} description="Total pelajaran dijadwalkan." href="/lessons"/>
             <StatCard title="Tugas Anak" value={loadingStats ? "" : (stats.parentChildTotalAssignments || 0)} icon={ClipboardCheck} loading={loadingStats} description="Total tugas untuk kelas anak." href="/assignments"/>
             <StatCard title="Kehadiran Anak" value={loadingStats ? "" : (stats.parentChildAttendancePercentage || "0%")} icon={CalendarCheck} loading={loadingStats} description="Persentase kehadiran anak." href="/attendance"/>
          </div>
        </section>
      )}

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
                     {announcement.date ? format(announcement.date.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale }) : "Tanggal tidak tersedia"}
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
                    <Link href={'/announcements'}>
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

    