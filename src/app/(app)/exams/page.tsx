import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Manajemen Ujian - EduCentral',
  description: 'Kelola jadwal dan hasil ujian di EduCentral.',
};

export default function ExamsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Ujian</h1>
        <p className="text-muted-foreground">Kelola jadwal ujian, input soal, dan pelaksanaan ujian.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <span>Daftar Ujian</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Fitur manajemen ujian (CRUD jadwal, input soal, monitoring) akan diimplementasikan di sini.
          </p>
          <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
            Area untuk menampilkan daftar ujian dan fungsionalitas CRUD.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}