
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { School, AlertCircle, Users } from "lucide-react"; // Added Users icon
import LottieLoader from "@/components/ui/LottieLoader";
import type { Metadata } from 'next';
import { Button } from "@/components/ui/button"; // Added Button import
import Link from "next/link"; // Added Link import

// Cannot export metadata from client component directly, will be handled by parent or layout
// export const metadata: Metadata = {
//   title: 'Kelas Saya - Ardalas',
//   description: 'Informasi mengenai kelas Anda saat ini.',
// };

export default function MyClassPage() {
  const { user, loading: authLoading, role } = useAuth();

  if (authLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardHeader>
            <Skeleton className="h-6 w-1/3" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center p-8">
              <LottieLoader width={32} height={32} className="mr-2" />
              Memuat informasi kelas...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user || role !== 'siswa') {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-headline">Kelas Saya</h1>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <AlertCircle className="w-12 h-12 mb-4 text-destructive" />
              <p className="font-semibold">Halaman ini hanya untuk siswa.</p>
              <p>Silakan login sebagai siswa untuk melihat informasi kelas.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Informasi Kelas Saya</h1>
        <p className="text-muted-foreground">Detail mengenai kelas saat ini.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <School className="h-6 w-6 text-primary" />
            <span>
              {user.className ? `Kelas: ${user.className}` : "Detail Kelas"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {user.className ? (
            <p className="text-lg">
              Anda terdaftar di kelas: <span className="font-semibold">{user.className}</span>.
            </p>
          ) : user.classId ? (
            <p className="text-lg">
              Anda terdaftar di kelas dengan ID: <span className="font-semibold">{user.classId}</span>. <br />
              <span className="text-sm text-muted-foreground">(Nama kelas tidak tersedia. Hubungi admin jika ini salah.)</span>
            </p>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <AlertCircle className="w-12 h-12 mb-4 text-destructive" />
              <p className="font-semibold">Anda belum terdaftar di kelas mana pun.</p>
              <p>Silakan hubungi administrator sekolah untuk informasi lebih lanjut.</p>
            </div>
          )}
          
          {user.classId && (
            <div className="mt-6 space-y-4">
                <div>
                    <h3 className="text-xl font-semibold mb-2">Detail Tambahan:</h3>
                    <p className="text-sm">ID Kelas: {user.classId}</p>
                    <p className="text-sm text-muted-foreground italic mt-1">
                        Informasi lebih lanjut mengenai jadwal pelajaran, tugas, dan pengumuman kelas 
                        dapat dilihat pada menu terkait.
                    </p>
                </div>
                <Button asChild variant="outline">
                  <Link href="/students">
                    <Users className="mr-2 h-4 w-4" />
                    Lihat Daftar Siswa Kelas Ini
                  </Link>
                </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


