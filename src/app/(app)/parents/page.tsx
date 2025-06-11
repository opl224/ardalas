import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCircle } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Manajemen Orang Tua - EduCentral',
  description: 'Kelola data orang tua murid di EduCentral.',
};

export default function ParentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manajemen Orang Tua</h1>
        <p className="text-muted-foreground">Kelola data orang tua, komunikasi, dan informasi terkait anak.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCircle className="h-6 w-6 text-primary" />
            <span>Daftar Orang Tua</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Fitur manajemen orang tua (CRUD) akan diimplementasikan di sini. Ini akan mencakup kemampuan untuk menambah, melihat, memperbarui, dan menghapus data orang tua, serta menghubungkannya dengan data murid.
          </p>
          <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
            Area untuk menampilkan daftar orang tua dan fungsionalitas CRUD.
          </div>
        </Card