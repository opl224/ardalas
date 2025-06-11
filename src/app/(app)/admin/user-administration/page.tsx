
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCog } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Administrasi Pengguna - EduCentral',
  description: 'Kelola pengguna sistem EduCentral.',
};

export default function UserAdministrationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Administrasi Pengguna</h1>
        <p className="text-muted-foreground">Kelola akun pengguna, peran, dan hak akses.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-6 w-6 text-primary" />
            <span>Manajemen Pengguna</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Paragraf sebelumnya dihapus untuk menghindari redundansi */}
          <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
            Fitur untuk menambah, mengedit, dan menghapus pengguna, serta mengelola peran dan hak akses akan diimplementasikan di sini.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
