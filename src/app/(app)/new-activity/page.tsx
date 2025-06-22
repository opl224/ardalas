
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban } from "lucide-react";
import Folder from "@/components/ui/Folder";
import Image from "next/image";

const folderItems = [
    <Image key="img1" src="https://placehold.co/100x80.png" alt="Kegiatan 1" layout="fill" objectFit="cover" data-ai-hint="school event" />,
    <Image key="img2" src="https://placehold.co/100x80.png" alt="Kegiatan 2" layout="fill" objectFit="cover" data-ai-hint="student activity" />,
    <Image key="img3" src="https://placehold.co/100x80.png" alt="Kegiatan 3" layout="fill" objectFit="cover" data-ai-hint="sports day" />,
];

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
        <CardContent className="flex items-center justify-center p-16">
            <Folder color="#8784EB" className="custom-folder" items={folderItems} />
        </CardContent>
      </Card>
    </div>
  );
}
