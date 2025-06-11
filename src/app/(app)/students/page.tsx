
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react"; // Can use a different icon if desired, e.g. GraduationCap
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Manajemen Murid - EduCentral',
  description: 'Kelola data murid di EduCentral.',
};

export default function StudentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Murid</h1>
        <p className="text-muted-foreground">Kelola data murid, absensi, nilai, dan informasi terkait.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            <span>Daftar Murid</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Fitur manajemen murid (CRUD) akan diimplementasikan di sini. Ini akan mencakup kemampuan untuk menambah, melihat, memperbarui, dan menghapus data murid.
          </p>
          <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
            Area untuk menampilkan daftar murid
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
