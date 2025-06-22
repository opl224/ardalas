import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kegiatan Baru - Ardalas',
  description: 'Area untuk mengelola kegiatan baru di sekolah.',
};

export default function NewActivityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Kegiatan Baru Sekolah</h1>
        <p className="text-muted-foreground">Kelola dan pantau semua kegiatan baru yang direncanakan.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-primary" />
            <span>Folder Kegiatan</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
            <p>
              Area ini akan digunakan untuk menampilkan dan mengelola folder-folder kegiatan sekolah.
            </p>
            <p className="text-sm mt-2">
              (Fitur sedang dalam pengembangan)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
