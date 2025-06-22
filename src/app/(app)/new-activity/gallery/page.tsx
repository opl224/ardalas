"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Camera, Video, ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ActivityGalleryPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/new-activity">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Kembali</span>
          </Link>
        </Button>
        <div>
            <h1 className="text-3xl font-bold font-headline">Galeri Kegiatan Sekolah</h1>
            <p className="text-muted-foreground">Kumpulan foto dan video dari berbagai kegiatan yang telah dilaksanakan.</p>
        </div>
      </div>

      <section>
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Camera className="h-6 w-6 text-primary" />
            <span>Foto Kegiatan</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[
            { src: "https://placehold.co/600x400.png", alt: "Kegiatan sekolah 1", hint: "school students" },
            { src: "https://placehold.co/600x400.png", alt: "Kegiatan olahraga 1", hint: "sports day" },
            { src: "https://placehold.co/600x400.png", alt: "Pentas seni", hint: "art performance" },
            { src: "https://placehold.co/600x400.png", alt: "Upacara bendera", hint: "flag ceremony" },
            { src: "https://placehold.co/600x400.png", alt: "Lomba 17 Agustus", hint: "independence day" },
            { src: "https://placehold.co/600x400.png", alt: "Studi tur", hint: "study tour" },
            { src: "https://placehold.co/600x400.png", alt: "Kerja bakti", hint: "community service" },
            { src: "https://placehold.co/600x400.png", alt: "Pramuka", hint: "scout activity" },
          ].map((image, index) => (
            <Card key={index} className="overflow-hidden group transition-all duration-300 hover:shadow-xl">
              <div className="aspect-video relative">
                <Image
                  src={image.src}
                  alt={image.alt}
                  layout="fill"
                  objectFit="cover"
                  className="group-hover:scale-105 transition-transform duration-300"
                  data-ai-hint={image.hint}
                />
              </div>
              <CardContent className="p-3">
                 <p className="text-sm font-medium truncate">{image.alt}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Video className="h-6 w-6 text-primary" />
            <span>Video Dokumentasi</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <Card className="overflow-hidden">
                <CardHeader>
                    <CardTitle className="text-lg">Dokumentasi Pensi 2024</CardTitle>
                    <CardDescription>Kompilasi momen terbaik dari Pentas Seni tahun ini.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="aspect-video rounded-md overflow-hidden bg-muted">
                      <iframe
                        className="w-full h-full"
                        src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    </div>
                </CardContent>
            </Card>
             <Card className="overflow-hidden">
                <CardHeader>
                    <CardTitle className="text-lg">Class Meeting Olahraga</CardTitle>
                    <CardDescription>Semangat sportivitas dalam pertandingan antar kelas.</CardDescription>
                </CardHeader>
                <CardContent>
                     <div className="aspect-video rounded-md overflow-hidden bg-muted">
                      <iframe
                        className="w-full h-full"
                        src="https://www.youtube.com/embed/tS_u-_S_p3E"
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    </div>
                </CardContent>
            </Card>
        </div>
      </section>

    </div>
  );
}
