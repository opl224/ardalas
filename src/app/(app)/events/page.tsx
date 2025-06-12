
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Acara Sekolah - EduCentral',
  description: 'Lihat dan kelola acara sekolah di EduCentral.',
};

export default function EventsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Acara Sekolah</h1>
        <p className="text-muted-foreground">Informasi mengenai kegiatan dan acara sekolah.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            <span>Kalender Acara</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Fitur manajemen acara sekolah (CRUD, kalender) akan diimplementasikan di sini.
          </p>
          <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
            Area untuk menampilkan kalender acara dan fungsionalitas CRUD.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
