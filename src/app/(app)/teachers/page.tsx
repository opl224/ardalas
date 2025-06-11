import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Manajemen Guru - EduCentral',
  description: 'Kelola data guru di EduCentral.',
};

export default function TeachersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Guru</h1>
        <p className="text-muted-foreground">Kelola data guru, jadwal mengajar, dan informasi terkait.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            <span>Daftar Guru</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Fitur manajemen guru (CRUD) akan diimplementasikan di sini. Ini akan mencakup kemampuan untuk menambah, melihat, memperbarui, dan menghapus data guru.
          </p>
          {/* Placeholder for table or list of teachers */}
          <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
            Area untuk menampilkan daftar guru dan fungsionalitas CRUD.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}