import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pesan - SDN',
  description: 'Fitur perpesanan antar pengguna di SDN.',
};

export default function MessagesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Pesan</h1>
        <p className="text-muted-foreground">Komunikasi internal antar pengguna sistem.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" />
            <span>Kotak Masuk</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Fitur perpesanan (kirim, terima, daftar kontak) akan diimplementasikan di sini.
          </p>
          <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
            Area untuk menampilkan daftar pesan dan fungsionalitas perpesanan.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}