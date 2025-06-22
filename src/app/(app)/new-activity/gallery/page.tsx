
"use client";

import { useSearchParams } from 'next/navigation';
import React, { Suspense, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Camera, Video, ArrowLeft, ImagePlus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import { doc, getDoc, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { id as indonesiaLocale } from 'date-fns/locale';
import { uploadActivityMedia } from '@/app/actions/uploadActions';

interface Activity {
  id: string;
  title: string;
  date: Timestamp;
}

interface MediaItem {
  id: string;
  type: 'photo' | 'video';
  url: string;
  caption?: string;
  createdAt: Timestamp;
}

function GalleryContent() {
  const searchParams = useSearchParams();
  const activityId = searchParams.get('id');
  const { role } = useAuth();
  const { toast } = useToast();

  const [activity, setActivity] = useState<Activity | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);
  const [isLoadingMedia, setIsLoadingMedia] = useState(true);
  
  const [isAddMediaOpen, setIsAddMediaOpen] = useState(false);
  const [newMediaType, setNewMediaType] = useState<'photo' | 'video'>('photo');
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newMediaCaption, setNewMediaCaption] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (!activityId) {
      setIsLoadingActivity(false);
      return;
    }

    // Fetch Activity Details
    const activityDocRef = doc(db, "activities", activityId);
    const unsubscribeActivity = onSnapshot(activityDocRef, (doc) => {
      if (doc.exists()) {
        setActivity({ id: doc.id, ...doc.data() } as Activity);
      } else {
        console.error("Activity not found!");
        setActivity(null);
      }
      setIsLoadingActivity(false);
    });

    // Fetch Media Items
    const mediaCollectionRef = collection(db, "activities", activityId, "media");
    const q = query(mediaCollectionRef, orderBy("createdAt", "desc"));
    const unsubscribeMedia = onSnapshot(q, (querySnapshot) => {
      const fetchedMedia: MediaItem[] = [];
      querySnapshot.forEach((doc) => {
        fetchedMedia.push({ id: doc.id, ...doc.data() } as MediaItem);
      });
      setMedia(fetchedMedia);
      setIsLoadingMedia(false);
    });

    return () => {
      unsubscribeActivity();
      unsubscribeMedia();
    };
  }, [activityId]);
  
  const handleAddMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityId) return;

    setIsSubmitting(true);
    try {
      let mediaUrl = newMediaUrl;

      if (newMediaType === 'photo') {
        if (!selectedFile) {
          toast({ title: "File foto harus dipilih", variant: "destructive" });
          setIsSubmitting(false);
          return;
        }
        const formData = new FormData();
        formData.append('file', selectedFile);
        
        const result = await uploadActivityMedia(activityId, formData);
        
        if (result.error) {
          toast({
            title: "Gagal Mengunggah",
            description: result.error.includes("Bucket not found")
              ? "Bucket 'activities' tidak ditemukan di Supabase. Harap buat bucket publik dengan nama 'activities' di dasbor Supabase Anda."
              : result.error,
            variant: "destructive",
            duration: 9000,
          });
          setIsSubmitting(false);
          return;
        }
        if (result.url) {
          mediaUrl = result.url;
        } else {
            throw new Error("Gagal mendapatkan URL setelah upload.");
        }
      } else if (newMediaType === 'video') {
          if (!newMediaUrl) {
            toast({ title: "URL video tidak boleh kosong", variant: "destructive" });
            setIsSubmitting(false);
            return;
          }
          if (!mediaUrl.startsWith("https://www.youtube.com/embed/")) {
              toast({ title: "Format URL Video Salah", description: "Harap gunakan format embed YouTube (e.g., https://www.youtube.com/embed/...)", variant: "destructive" });
              setIsSubmitting(false);
              return;
          }
      }

      await addDoc(collection(db, "activities", activityId, "media"), {
        type: newMediaType,
        url: mediaUrl,
        caption: newMediaCaption,
        createdAt: serverTimestamp(),
      });

      toast({ title: "Media berhasil ditambahkan" });
      setIsAddMediaOpen(false);
      setNewMediaType('photo');
      setNewMediaUrl('');
      setNewMediaCaption('');
      setSelectedFile(null);
    } catch (error: any) {
      console.error("Error adding media: ", error);
      toast({ title: "Gagal menambahkan media", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const photos = media.filter(item => item.type === 'photo');
  const videos = media.filter(item => item.type === 'video');

  if (isLoadingActivity) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!activity) {
    return (
      <div className="text-center">
        <p className="text-destructive">Kegiatan tidak ditemukan.</p>
        <Button variant="link" asChild><Link href="/new-activity">Kembali ke Daftar Kegiatan</Link></Button>
      </div>
    );
  }

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
          <h1 className="text-3xl font-bold font-headline">{activity.title}</h1>
          <p className="text-muted-foreground">
            Galeri kegiatan pada tanggal {activity.date ? format(activity.date.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale }) : '...'}
          </p>
        </div>
        {role === 'admin' && (
          <Dialog open={isAddMediaOpen} onOpenChange={setIsAddMediaOpen}>
            <DialogTrigger asChild>
              <Button className="ml-auto">
                <ImagePlus className="mr-2 h-4 w-4" /> Tambah Media
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Media Baru</DialogTitle>
                <DialogDescription>Tambahkan foto atau video ke galeri kegiatan ini.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddMedia} className="space-y-4">
                 <div>
                   <Label htmlFor="media-type">Tipe Media</Label>
                   <Select value={newMediaType} onValueChange={(value) => {
                      setNewMediaType(value as 'photo' | 'video');
                      setNewMediaUrl('');
                      setSelectedFile(null);
                   }}>
                     <SelectTrigger id="media-type" className="mt-1">
                       <SelectValue placeholder="Pilih tipe media" />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="photo">Foto</SelectItem>
                       <SelectItem value="video">Video (YouTube Embed)</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
                {newMediaType === 'photo' ? (
                  <div>
                    <Label htmlFor="media-file">Pilih File Foto</Label>
                    <Input 
                      id="media-file"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                      className="mt-1"
                      required
                    />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="media-url">URL Video Embed</Label>
                    <Input 
                      id="media-url" 
                      value={newMediaUrl} 
                      onChange={(e) => setNewMediaUrl(e.target.value)} 
                      placeholder={"https://www.youtube.com/embed/..."} 
                      required 
                    />
                  </div>
                )}
                 <div>
                   <Label htmlFor="media-caption">Keterangan (Opsional)</Label>
                   <Textarea 
                      id="media-caption"
                      value={newMediaCaption}
                      onChange={(e) => setNewMediaCaption(e.target.value)}
                      placeholder="Deskripsi singkat tentang media ini"
                   />
                 </div>
                 <DialogFooter>
                   <DialogClose asChild><Button variant="outline" type="button">Batal</Button></DialogClose>
                   <Button type="submit" disabled={isSubmitting}>
                     {isSubmitting ? 'Menyimpan...' : 'Simpan Media'}
                   </Button>
                 </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <section>
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Camera className="h-6 w-6 text-primary" />
            <span>Foto Kegiatan</span>
        </h2>
        {isLoadingMedia ? <Skeleton className="h-48 w-full" /> : photos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((image) => (
              <Card key={image.id} className="overflow-hidden group transition-all duration-300 hover:shadow-xl">
                <div className="aspect-video relative">
                  <Image
                    src={image.url}
                    alt={image.caption || activity.title}
                    layout="fill"
                    objectFit="cover"
                    className="group-hover:scale-105 transition-transform duration-300"
                    data-ai-hint="school activity"
                  />
                </div>
                {image.caption && (
                  <CardContent className="p-3">
                    <p className="text-sm font-medium truncate">{image.caption}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground italic">Belum ada foto untuk kegiatan ini.</p>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Video className="h-6 w-6 text-primary" />
            <span>Video Dokumentasi</span>
        </h2>
        {isLoadingMedia ? <Skeleton className="h-48 w-full" /> : videos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {videos.map(video => (
              <Card key={video.id} className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-lg">{video.caption || 'Video Kegiatan'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video rounded-md overflow-hidden bg-muted">
                    <iframe
                      className="w-full h-full"
                      src={video.url}
                      title={video.caption || "YouTube video player"}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground italic">Belum ada video untuk kegiatan ini.</p>
        )}
      </section>
    </div>
  );
}

// Suspense Boundary for useSearchParams
export default function ActivityGalleryPage() {
  return (
    <Suspense fallback={<div>Memuat...</div>}>
      <GalleryContent />
    </Suspense>
  );
}
