
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban, PlusCircle, Trash2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, addDoc, query, orderBy, onSnapshot, Timestamp, serverTimestamp } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from 'date-fns';
import { id as indonesiaLocale } from 'date-fns/locale';
import { deleteActivity } from '@/app/actions/uploadActions';
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  title: string;
  date: Timestamp;
  color: string;
}

export default function NewActivityPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [newActivityTitle, setNewActivityTitle] = useState("");
  const [newActivityDate, setNewActivityDate] = useState("");
  const [newActivityColor, setNewActivityColor] = useState("#2F80ED");

  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedToDelete, setSelectedToDelete] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "activities"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedActivities: Activity[] = [];
      querySnapshot.forEach((doc) => {
        fetchedActivities.push({ id: doc.id, ...doc.data() } as Activity);
      });
      setActivities(fetchedActivities);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching activities: ", error);
      toast({
        title: "Gagal Memuat Kegiatan",
        description: "Tidak dapat mengambil data kegiatan dari database.",
        variant: "destructive",
      });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);


  const handleAddActivity = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newActivityTitle || !newActivityDate) {
        toast({ title: "Data tidak lengkap", description: "Judul dan tanggal kegiatan harus diisi.", variant: "destructive" });
        return;
    }

    try {
      await addDoc(collection(db, "activities"), {
        title: newActivityTitle,
        date: Timestamp.fromDate(new Date(newActivityDate)),
        color: newActivityColor,
        createdAt: serverTimestamp(),
      });

      toast({
        title: "Kegiatan Ditambahkan",
        description: `Folder untuk "${newActivityTitle}" berhasil dibuat.`,
      });
      setIsAddDialogOpen(false);
      setNewActivityTitle("");
      setNewActivityDate("");
      setNewActivityColor("#2F80ED");
    } catch (error) {
      console.error("Error adding activity: ", error);
      toast({
        title: "Gagal Menambahkan Kegiatan",
        description: "Terjadi kesalahan saat menyimpan ke database.",
        variant: "destructive",
      });
    }
  };

  const handleMultipleDelete = async () => {
    if (selectedToDelete.length === 0) return;
    setIsDeleting(true);
    const deletePromises = selectedToDelete.map(id => deleteActivity(id));
    
    try {
        const results = await Promise.all(deletePromises);
        const failedDeletes = results.filter(result => result.error);
        
        if (failedDeletes.length > 0) {
            toast({
                title: "Sebagian Gagal Dihapus",
                description: `${failedDeletes.length} dari ${selectedToDelete.length} folder gagal dihapus.`,
                variant: "destructive"
            });
        } else {
            toast({
                title: "Berhasil Dihapus",
                description: `${selectedToDelete.length} folder kegiatan berhasil dihapus.`,
            });
        }
    } catch (error) {
        console.error("Error during multiple delete process:", error);
        toast({ title: "Terjadi Kesalahan", description: "Proses penghapusan gagal.", variant: "destructive" });
    } finally {
        setIsDeleting(false);
        setIsDeleteMode(false);
        setSelectedToDelete([]);
    }
  };


  return (
    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold font-headline">Galeri Kegiatan Sekolah</h1>
          <p className="text-muted-foreground">Klik folder di bawah untuk melihat galeri kegiatan yang telah dibagikan.</p>
        </div>
        <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="h-6 w-6 text-primary" />
              <span>Dokumentasi Kegiatan</span>
            </CardTitle>
          </CardHeader>
           {role === 'admin' && (
              <div className="flex items-center justify-between gap-2 mb-6 p-4 border-b">
                {isDeleteMode ? (
                  <>
                    <span className="text-sm font-medium mr-auto">Pilih folder untuk dihapus...</span>
                    <Button variant="outline" size="sm" onClick={() => { setIsDeleteMode(false); setSelectedToDelete([]); }}>
                      Batal
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" disabled={selectedToDelete.length === 0 || isDeleting}>
                          {isDeleting ? "Menghapus..." : `Hapus (${selectedToDelete.length})`}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Konfirmasi Penghapusan</AlertDialogTitle>
                          <AlertDialogDescription>
                            Anda akan menghapus {selectedToDelete.length} folder kegiatan beserta semua isinya. Tindakan ini tidak dapat dibatalkan.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Batal</AlertDialogCancel>
                          <AlertDialogAction onClick={handleMultipleDelete} disabled={isDeleting}>
                            {isDeleting ? "Menghapus..." : "Ya, Hapus Semua"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                ) : (
                  <>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Tambah Kegiatan
                      </Button>
                    </DialogTrigger>
                    <Button variant="outline" size="icon" onClick={() => setIsDeleteMode(true)} aria-label="Aktifkan mode hapus">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            )}
          <CardContent>
            <div 
              className="flex flex-row gap-4 p-4 overflow-x-auto md:grid md:grid-cols-3 md:gap-6 md:p-12 md:overflow-x-visible justify-start md:justify-center"
            >
              {isLoading ? (
                [...Array(3)].map((_, index) => (
                  <div key={index} className="flex flex-col items-center gap-2 flex-shrink-0">
                    <Skeleton className="w-[80px] h-[64px] rounded-lg" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))
              ) : activities.length > 0 ? (
                  activities.map((activity) => {
                    const isSelectedForDelete = selectedToDelete.includes(activity.id);
                    return (
                      <div 
                        key={activity.id} 
                        className={cn(
                          "relative flex flex-col items-center gap-2 flex-shrink-0 transition-all duration-200",
                          isDeleteMode && "cursor-pointer rounded-lg p-2",
                          isDeleteMode && isSelectedForDelete && "bg-destructive/20 ring-2 ring-destructive",
                          isDeleteMode && !isSelectedForDelete && "hover:bg-muted"
                        )}
                        onClick={() => {
                          if (isDeleteMode) {
                            setSelectedToDelete(prev => 
                              prev.includes(activity.id)
                                ? prev.filter(id => id !== activity.id)
                                : [...prev, activity.id]
                            );
                          }
                        }}
                      >
                        {isDeleteMode && role === 'admin' && (
                            <Checkbox
                                checked={isSelectedForDelete}
                                className="absolute top-1 left-1 z-10 bg-background"
                                aria-label={`Pilih ${activity.title}`}
                            />
                        )}
                        
                        <Link 
                          href={isDeleteMode ? '#' : `/new-activity/gallery?id=${activity.id}`} 
                          onClick={(e) => { if (isDeleteMode) e.preventDefault(); }}
                          aria-label={`Buka galeri ${activity.title}`}
                        >
                          <Folder color={activity.color} size={0.8} />
                        </Link>
                        <p className="text-sm font-semibold">{activity.title}</p>
                        <p className="text-xs font-medium text-muted-foreground">{activity.date ? format(activity.date.toDate(), "dd MMMM yyyy", { locale: indonesiaLocale }) : 'Tanggal tidak valid'}</p>
                      </div>
                    );
                  })
              ) : (
                <p className="col-span-3 text-center text-muted-foreground">Belum ada kegiatan yang ditambahkan.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

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
            <Input id="activity-title" placeholder="Contoh: Pentas Seni 2024" value={newActivityTitle} onChange={(e) => setNewActivityTitle(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="activity-date">Tanggal Kegiatan</Label>
            <Input id="activity-date" type="date" value={newActivityDate} onChange={(e) => setNewActivityDate(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="activity-color">Warna Folder</Label>
            <Input id="activity-color" type="color" value={newActivityColor} onChange={(e) => setNewActivityColor(e.target.value)} className="p-1 h-10" required />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Batal</Button></DialogClose>
            <Button type="submit">Simpan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
