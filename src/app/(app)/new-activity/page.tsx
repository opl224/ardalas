"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban } from "lucide-react";
import Folder from "@/components/ui/Folder";
import Link from "next/link";

export default function NewActivityPage() {
  const activities = [
    { date: "17 Agustus 2024", color: "#EB5757", href: "/new-activity/gallery" },
    { date: "25 September 2024", color: "#8784EB", href: "/new-activity/gallery" },
    { date: "10 November 2024", color: "#2F80ED", href: "/new-activity/gallery" },
  ];

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
        {/* Use flex for mobile horizontal scroll, and grid for md and up */}
        <CardContent className="flex flex-row gap-8 p-6 overflow-x-auto md:grid md:grid-cols-3 md:gap-8 md:p-12 md:overflow-x-visible justify-start md:justify-center">
          {activities.map((activity, index) => (
            <div key={index} className="flex flex-col items-center gap-4 flex-shrink-0">
              <Link href={activity.href}>
                <Folder color={activity.color} size={1} />
              </Link>
              <p className="text-sm font-medium text-muted-foreground">{activity.date}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
