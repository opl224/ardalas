
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
import { useSidebar } from "@/components/ui/sidebar";

interface Activity {
  id: string;
  title: string;
  date: Timestamp;
  color: string;
}

export default function NewActivityPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const { isMobile } = useSidebar();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form state for new activity
  const [newActivityTitle, setNewActivityTitle] = useState("");
  const [newActivityDate, setNewActivityDate] = useState("");
  const [newActivityColor, setNewActivityColor] = useState("#2F80ED");

  // States for delete mode
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
      // Reset form
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

  const handleSingleDelete = async (activityId: string, activityTitle: string) => {
    setIsDeleting(true);
    try {
        const result = await deleteActivity(activityId);
        if (result.error) {
            toast({ title: "Gagal Menghapus", description: result.error, variant: "destructive" });
        } else {
            toast({ title: "Berhasil Dihapus", description: `Folder kegiatan "${activityTitle}" berhasil dihapus.` });
        }
    } catch (error: any) {
        console.error("Kesalahan menghapus kegiatan:", error);
        toast({ title: "Terjadi Kesalahan", description: "Proses penghapusan gagal.", variant: "destructive" });
    } finally {
        setIsDeleting(false);
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Galeri Kegiatan Sekolah</h1>
        <p className="text-muted-foreground">Klik folder di bawah untuk melihat galeri kegiatan yang telah dibagikan.</p>
      </div>
      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-primary" />
            <span>Dokumentasi Kegiatan</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {role === 'admin' && (
            <div className="flex items-center justify-end gap-2 mb-6 p-4 border-b">
              {isMobile && isDeleteMode ? (
                 <>
                  <span className="text-sm font-medium mr-auto">Pilih folder untuk dihapus...</span>
                  <Button variant="outline" size="sm" onClick={() => { setIsDeleteMode(false); setSelectedToDelete([]); }}>
                    Batal
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                       <Button variant="destructive" size="sm" disabled={selectedToDelete.length === 0}>
                        Hapus ({selectedToDelete.length})
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
                  {isMobile && (
                     <Button variant="outline" size="icon" onClick={() => setIsDeleteMode(true)} aria-label="Aktifkan mode hapus">
                       <Trash2 className="h-4 w-4" />
                     </Button>
                  )}
                </>
              )}
            </div>
          )}
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
                        // Mobile-specific styles for delete mode
                        isMobile && isDeleteMode && "cursor-pointer rounded-lg p-2",
                        isMobile && isDeleteMode && isSelectedForDelete && "bg-destructive/20 ring-2 ring-destructive",
                        isMobile && isDeleteMode && !isSelectedForDelete && "hover:bg-muted",
                        // Desktop-specific style for hover effect
                        !isMobile && "group"
                      )}
                      onClick={() => {
                        if (isMobile && isDeleteMode) {
                          setSelectedToDelete(prev => 
                            prev.includes(activity.id)
                              ? prev.filter(id => id !== activity.id)
                              : [...prev, activity.id]
                          );
                        }
                      }}
                    >
                      {/* Mobile checkbox for delete mode */}
                      {isMobile && isDeleteMode && (
                          <Checkbox
                              checked={isSelectedForDelete}
                              className="absolute top-1 left-1 z-10 bg-background"
                              aria-label={`Pilih ${activity.title}`}
                          />
                      )}

                      {/* Desktop hover delete button */}
                      {!isMobile && role === 'admin' && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="icon"
                              className="absolute top-0 right-0 z-10 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); }}
                              aria-label={`Hapus folder ${activity.title}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Konfirmasi Penghapusan</AlertDialogTitle>
                              <AlertDialogDescription>
                                Anda akan menghapus folder kegiatan "{activity.title}" beserta semua isinya. Tindakan ini tidak dapat dibatalkan.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Batal</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleSingleDelete(activity.id, activity.title)}
                                disabled={isDeleting}
                              >
                                {isDeleting ? "Menghapus..." : "Ya, Hapus"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                      
                      <Link 
                        href={(isMobile && isDeleteMode) ? '#' : `/new-activity/gallery?id=${activity.id}`} 
                        onClick={(e) => { if (isMobile && isDeleteMode) e.preventDefault(); }}
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
  );
}
