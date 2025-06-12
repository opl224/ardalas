import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings as SettingsIcon } from "lucide-react"; // Renamed to avoid conflict
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pengaturan Akun - SDN',
  description: 'Kelola pengaturan akun Anda di SDN.',
};

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Pengaturan Akun</h1>
        <p className="text-muted-foreground">Kelola preferensi dan informasi akun Anda.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-primary" />
            <span>Preferensi</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Fitur pengaturan akun (profil, password, notifikasi) akan diimplementasikan di sini.
          </p>
          <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
            Area untuk menampilkan opsi pengaturan.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}