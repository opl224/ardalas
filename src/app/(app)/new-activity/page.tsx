
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban, PlusCircle } from "lucide-react";
import Folder from "@/components/ui/Folder";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function NewActivityPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // This will be replaced with data from Firestore later
  const activities = [
    { date: "17 Agustus 2024", color: "#EB5757", href: "/new-activity/gallery" },
    { date: "25 September 2024", color: "#8784EB", href: "/new-activity/gallery" },
    { date: "10 November 2024", color: "#2F80ED", href: "/new-activity/gallery" },
  ];

  const handleAddActivity = (event: React.FormEvent) => {
    event.preventDefault();
    // Placeholder for actual Firestore logic
    toast({
      title: "Fitur Dalam Pengembangan",
      description: "Kemampuan untuk menambahkan kegiatan baru akan segera hadir.",
    });
    setIsAddDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Kegiatan Baru Sekolah</h1>
        <p className="text-muted-foreground">Klik folder di bawah untuk melihat galeri kegiatan yang telah dibagikan.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-primary" />
            <span>Galeri Kegiatan</span>
          </CardTitle>
          {role === 'admin' && (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Tambah Kegiatan
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Tambah Folder Kegiatan Baru</DialogTitle>
                  <DialogDescription>
                    Buat folder baru untuk menampilkan galeri foto dan video kegiatan.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddActivity} className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="activity-title">Judul Kegiatan</Label>
                    <Input id="activity-title" placeholder="Contoh: Pentas Seni 2024" required />
                  </div>
                  <div>
                    <Label htmlFor="activity-date">Tanggal Kegiatan</Label>
                    <Input id="activity-date" placeholder="Contoh: 25 Desember 2024" required />
                  </div>
                   <div>
                    <Label htmlFor="activity-color">Warna Folder (Hex)</Label>
                    <Input id="activity-color" placeholder="#2F80ED" defaultValue="#2F80ED" required />
                  </div>
                  <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
                    <Button type="submit">Simpan (Segera Hadir)</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent className="flex flex-row gap-4 p-4 overflow-x-auto md:grid md:grid-cols-3 md:gap-6 md:p-12 md:overflow-x-visible justify-start md:justify-center">
          {activities.map((activity, index) => (
            <div key={index} className="flex flex-col items-center gap-2 flex-shrink-0">
              <Link href={activity.href}>
                <Folder color={activity.color} size={0.8} />
              </Link>
              <p className="text-xs font-medium text-muted-foreground">{activity.date}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
