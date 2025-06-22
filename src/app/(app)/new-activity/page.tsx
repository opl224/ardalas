"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban } from "lucide-react";
import Folder from "@/components/ui/Folder";
import Link from "next/link";

export default function NewActivityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Kegiatan Baru Sekolah</h1>
        <p className="text-muted-foreground">Klik folder di bawah untuk melihat galeri kegiatan yang telah dibagikan.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-primary" />
            <span>Galeri Kegiatan</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center p-16">
          <Link href="/new-activity/gallery">
            <Folder color="#8784EB" size={2} />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
