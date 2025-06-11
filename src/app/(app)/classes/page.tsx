import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { School } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Manajemen Kelas - EduCentral',
  description: 'Kelola data kelas di EduCentral.',
};

export default function ClassesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Kelas</h1>
        <p className="text-muted-foreground">Kelola daftar kelas, wali kelas, dan siswa per kelas.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <School className="h-6 w-6 text-primary" />
            <span>Daftar Kelas</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Fitur manajemen kelas (CRUD) akan diimplementasikan di sini.
          </p>
          <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
            Area untuk menampilkan daftar kelas dan fungsionalitas CRUD.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}