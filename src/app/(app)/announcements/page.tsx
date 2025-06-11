import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Filter, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLES, roleDisplayNames } from "@/config/roles";
import type { Metadata } from 'next';
import Link from "next/link";

export const metadata: Metadata = {
  title: 'Pengumuman - EduCentral',
  description: 'Lihat semua pengumuman penting dari sekolah.',
};

// Placeholder data for announcements
const announcements = [
  { id: "1", title: "Libur Hari Raya Idul Fitri", date: "10 April 2024", content: "Diberitahukan kepada seluruh siswa, guru, dan staf bahwa kegiatan belajar mengajar akan diliburkan dalam rangka Hari Raya Idul Fitri 1445 H mulai tanggal 8 April hingga 15 April 2024. Kegiatan belajar mengajar akan dimulai kembali pada tanggal 16 April 2024. Selamat merayakan Idul Fitri, mohon maaf lahir dan batin.", roles: ["siswa", "guru", "orangtua", "admin"] },
  { id: "2", title: "Ujian Tengah Semester Genap", date: "15 Maret 2024", content: "Pelaksanaan Ujian Tengah Semester (UTS) Genap tahun ajaran 2023/2024 akan dilaksanakan mulai tanggal 25 Maret hingga 29 Maret 2024. Jadwal lengkap dan tata tertib ujian dapat diunduh melalui link berikut atau dilihat di papan pengumuman sekolah. Diharapkan semua siswa mempersiapkan diri dengan baik.", roles: ["siswa", "orangtua"] },
  { id: "3", title: "Rapat Guru Bulanan", date: "05 Maret 2024", content: "Kepada seluruh Bapak/Ibu Guru, diharapkan kehadirannya dalam rapat bulanan yang akan diselenggarakan pada: Hari/Tanggal: Jumat, 8 Maret 2024, Waktu: 13.00 - Selesai, Tempat: Ruang Rapat Guru. Agenda rapat akan membahas evaluasi KBM bulan Februari dan persiapan UTS. Terima kasih.", roles: ["guru"] },
  { id: "4", title: "Pembaruan Sistem EduCentral", date: "28 Februari 2024", content: "Sistem EduCentral akan mengalami pembaruan pada hari Sabtu, 2 Maret 2024 pukul 00:00 - 04:00 WIB. Selama periode tersebut, sistem mungkin tidak dapat diakses sementara. Pembaruan ini bertujuan untuk meningkatkan performa dan menambahkan fitur baru. Mohon maaf atas ketidaknyamanannya.", roles: ["admin", "guru", "siswa", "orangtua"] },
];

// TODO: Implement actual filtering and fetching logic based on user role and search/filter inputs.
// This component should ideally be a client component if filters are interactive client-side,
// or use server actions/searchParams for server-side filtering. For now, it's a server component displaying all.

export default function AnnouncementsPage() {
  // In a real app, you'd fetch announcements and filter them based on user role from AuthContext
  // For now, we simulate this by displaying all announcements
  // const { role } = useAuth();
  // const filteredAnnouncements = announcements.filter(ann => role && ann.roles.includes(role));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-headline">Pengumuman Sekolah</h1>
          <p className="text-muted-foreground">Informasi terbaru dan penting untuk Anda.</p>
        </div>
        {/* TODO: Add create button for admin/authorized roles */}
        {/* <Button asChild>
          <Link href="/announcements/create">
            <PlusCircle className="mr-2 h-4 w-4" /> Buat Pengumuman
          </Link>
        </Button> */}
      </div>

      {/* Filters and Search */}
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cari pengumuman..." className="pl-8" />
            </div>
            <Select>
              <SelectTrigger className="w-full md:w-[180px]">
                <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Filter per Tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tipe</SelectItem>
                <SelectItem value="akademik">Akademik</SelectItem>
                <SelectItem value="kegiatan">Kegiatan</SelectItem>
                <SelectItem value="umum">Umum</SelectItem>
              </SelectContent>
            </Select>
            <Select>
              <SelectTrigger className="w-full md:w-[180px]">
                <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Filter per Peran" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Peran</SelectItem>
                {ROLES.map(r => <SelectItem key={r} value={r}>{roleDisplayNames[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Announcements List */}
      <div className="space-y-4">
        {announcements.length > 0 ? (
          announcements.map((announcement) => (
            <Card key={announcement.id} className="bg-card/70 backdrop-blur-sm border-border shadow-md hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="text-xl">{announcement.title}</CardTitle>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <span>{announcement.date}</span>
                  <span>&bull;</span>
                  <span>Untuk: {announcement.roles.map(r => roleDisplayNames[r as keyof typeof roleDisplayNames] || r).join(", ")}</span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground whitespace-pre-line line-clamp-3">{announcement.content}</p>
                <Button variant="link" asChild className="p-0 h-auto mt-2 text-primary">
                  {/* In a real app, this would link to a dynamic announcement page e.g., /announcements/[id] */}
                  <Link href={`/announcements`}> 
                    Baca Selengkapnya
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="bg-card/70 backdrop-blur-sm border-border">
            <CardContent className="p-6 text-center text-muted-foreground">
              <Megaphone className="mx-auto h-12 w-12 mb-4" />
              <p>Belum ada pengumuman saat ini.</p>
            </CardContent>
          </Card>
        )}
      