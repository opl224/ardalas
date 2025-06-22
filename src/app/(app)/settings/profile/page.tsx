
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCircle } from "lucide-react";
import type { Metadata } from 'next';

// export const metadata: Metadata = {
//   title: 'Tentang Saya - Ardalas',
//   description: 'Halaman tentang saya.',
// };

export default function AboutMePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Tentang Saya</h1>
        <p className="text-muted-foreground">Informasi mengenai aplikasi atau pengembang.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCircle className="h-6 w-6 text-primary" />
            <span>Tentang Aplikasi</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Halaman ini dapat diisi dengan informasi mengenai aplikasi Ardalas, visi & misi sekolah, atau profil pengembang.
          </p>
          <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
            Konten akan ditambahkan di sini.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
