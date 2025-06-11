import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Megaphone, CalendarDays, BookOpen, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Beranda - EduCentral',
  description: 'Halaman utama dashboard EduCentral.',
};


// Placeholder data
const quickLinks = [
  { title: "Lihat Pengumuman", href: "/announcements", icon: Megaphone, description: "Info terbaru dari sekolah." },
  { title: "Kalender Akademik", href: "/events", icon: CalendarDays, description: "Jadwal kegiatan penting." },
  { title: "Materi Pelajaran", href: "/lessons", icon: BookOpen, description: "Akses materi belajar." },
];

const recentAnnouncements = [
  { id: "1", title: "Libur Hari Raya Idul Fitri", date: "10 April 2024", excerpt: "Diberitahukan kepada seluruh siswa bahwa kegiatan belajar mengajar akan diliburkan..." },
  { id: "2", title: "Ujian Tengah Semester Genap", date: "15 Maret 2024", excerpt: "Pelaksanaan Ujian Tengah Semester (UTS) Genap akan dimulai pada tanggal..." },
  { id: "3", title: "Pendaftaran Ekstrakurikuler Baru", date: "01 Maret 2024", excerpt: "Telah dibuka pendaftaran untuk ekstrakurikuler baru, yaitu klub robotik dan fotografi..." },
];


export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">Selamat Datang di EduCentral</h1>
        <p className="text-muted-foreground">Platform manajemen informasi sekolah Anda.</p>
      </div>

      {/* Quick Access Links */}
      <section>
        <h2 className="text-2xl font-semibold mb-4 font-headline">Akses Cepat</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
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
        <div className="space-y-4">
          {recentAnnouncements.map((announcement) => (
            <Card key={announcement.id} className="bg-card/70 backdrop-blur-sm border-border shadow-md">
              <CardHeader>
                <CardTitle className="text-lg">{announcement.title}</CardTitle>
                <CardDescription>{announcement.date}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground truncate">{announcement.excerpt}</p>
                 <Button variant="outline" size="sm" asChild className="mt-2 border-primary text-primary hover:bg-primary/10">
                  <Link href={`/announcements/${announcement.id}`}>
                    Baca Selengkapnya
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Other potential sections: Upcoming Events, Quick Stats (for admin/teacher) */}
       <section>
        <h2 className="text-2xl font-semibold mb-4 font-headline">Informasi Sekolah</h2>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Selamat datang di sistem informasi EduCentral. Di sini Anda dapat mengelola semua aspek kegiatan belajar mengajar,
              mulai dari data siswa dan guru, jadwal pelajaran, hingga pengumuman penting.
              Gunakan menu navigasi di samping untuk mengakses fitur-fitur yang tersedia.
            </p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <h3 className="font-semibold">Visi Sekolah</h3>
                    <p className="text-sm text-muted-foreground">Menjadi lembaga pendidikan unggul yang menghasilkan generasi cerdas, kreatif, dan berakhlak mulia.</p>
                </div>
                <div>
                    <h3 className="font-semibold">Misi Sekolah</h3>
                    <ul className="list-disc list-inside text-sm text-muted-foreground">
                        <li>Menyelenggarakan pendidikan berkualitas.</li>
                        <li>Mengembangkan potensi siswa secara optimal.</li>
                        <li>Menciptakan lingkungan belajar yang kondusif.</li>
                    </ul>
                </div>
            </div>
          </CardContent>
        </Card>
      </section>