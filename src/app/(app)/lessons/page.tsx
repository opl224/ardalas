import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookCopy } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Manajemen Pelajaran - EduCentral',
  description: 'Kelola jadwal pelajaran dan materi ajar di EduCentral.',
};

export default function LessonsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Pelajaran</h1>
        <p className="text-muted-foreground">Kelola jadwal pelajaran, materi ajar, dan silabus.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookCopy className="h-6 w-6 text-primary" />
            <span>Jadwal & Materi Pelajaran</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Fitur manajemen pelajaran (CRUD jadwal, upload materi) akan diimplementasikan di sini.
          </p>
          <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
            Area untuk menampilkan jadwal pelajaran, daftar materi, dan f