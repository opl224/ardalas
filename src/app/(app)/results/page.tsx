
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hasil Belajar - EduCentral',
  description: 'Lihat hasil belajar dan nilai siswa di EduCentral.',
};

export default function ResultsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Hasil Belajar Siswa</h1>
        <p className="text-muted-foreground">Lihat dan kelola nilai serta rapor siswa.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            <span>Rapor & Nilai</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Fitur manajemen hasil belajar (input nilai, cetak rapor) akan diimplementasikan di sini.
          </p>
          <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
            Area untuk menampilkan data hasil belajar dan fungsionalitas CRUD.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
