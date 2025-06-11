import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Manajemen Subjek - EduCentral',
  description: 'Kelola data subjek pelajaran di EduCentral.',
};

export default function SubjectsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Subjek Pelajaran</h1>
        <p className="text-muted-foreground">Kelola daftar subjek atau mata pelajaran yang diajarkan.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <span>Daftar Subjek</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Fitur manajemen subjek pelajaran (CRUD) akan diimplementasikan di sini.
          </p>
          <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
            Area untuk menampilkan daftar subjek dan fungsionalitas CRUD.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}