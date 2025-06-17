
"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase/config";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { BellRing, AlertCircle, FileText, Megaphone, Filter, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { id as indonesiaLocale } from "date-fns/locale";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface NotificationDoc {
  id: string;
  title: string;
  description: string;
  read: boolean;
  createdAt: Timestamp | null;
  href?: string;
  type?: "new_assignment" | "new_announcement" | "new_exam" | string; // Added string for future types
  userId?: string;
}

type NotificationFilter = "all" | "tugas" | "pengumuman";

const NOTIFICATION_TYPE_MAP: Record<string, string> = {
  new_assignment: "Tugas",
  new_announcement: "Pengumuman",
  new_exam: "Ujian",
};

export default function AllNotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<NotificationDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const { toast } = useToast();

  useEffect(() => {
    if (authLoading || !user || !user.uid) {
      setIsLoading(false);
      setNotifications([]);
      return;
    }

    const fetchAllNotifications = async () => {
      setIsLoading(true);
      try {
        const notificationsRef = collection(db, "notifications");
        const q = query(
          notificationsRef,
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);
        const fetchedNotifications: NotificationDoc[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          fetchedNotifications.push({
            id: docSnap.id,
            title: data.title || "Tanpa Judul",
            description: data.description || "",
            read: data.read === true,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
            href: data.href,
            type: data.type,
            userId: data.userId,
          });
        });
        setNotifications(fetchedNotifications);
      } catch (error) {
        console.error("Error fetching all notifications:", error);
        toast({
          title: "Gagal Memuat Notifikasi",
          description: "Terjadi kesalahan saat mengambil semua notifikasi.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllNotifications();
  }, [user, authLoading, toast]);

  const handleMarkAsRead = async (id: string, index: number) => {
    if (notifications[index]?.read) return; // Already read

    const notificationRef = doc(db, "notifications", id);
    try {
      await updateDoc(notificationRef, { read: true });
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
    } catch (error) {
      console.error("Error marking notification as read:", error);
      toast({
        title: "Update Notifikasi Gagal",
        variant: "destructive",
      });
    }
  };

  const filteredNotifications = useMemo(() => {
    if (filter === "all") return notifications;
    if (filter === "tugas") return notifications.filter(n => n.type === "new_assignment" || n.type === "new_exam"); // Combine exam with task for simplicity
    if (filter === "pengumuman") return notifications.filter(n => n.type === "new_announcement");
    return notifications;
  }, [notifications, filter]);

  if (authLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-8 w-1/3" />
        <Card><CardContent className="p-4"><Skeleton className="h-40 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-2xl font-bold">Akses Ditolak</h1>
        <p className="text-muted-foreground">Anda harus login untuk melihat notifikasi.</p>
        <Button asChild><Link href="/login">Login</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline flex items-center gap-2">
          <BellRing className="h-7 w-7" />
          Semua Notifikasi
        </h1>
        <p className="text-muted-foreground">Lihat semua pemberitahuan yang Anda terima.</p>
      </div>

      <Card className="bg-card/70 backdrop-blur-sm border-border shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">Filter Notifikasi</CardTitle>
          <div className="flex space-x-2 pt-2">
            <Button variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")} size="sm">
              <Filter className="mr-2 h-4 w-4" /> Semua
            </Button>
            <Button variant={filter === "tugas" ? "default" : "outline"} onClick={() => setFilter("tugas")} size="sm">
              <FileText className="mr-2 h-4 w-4" /> Tugas & Ujian
            </Button>
            <Button variant={filter === "pengumuman" ? "default" : "outline"} onClick={() => setFilter("pengumuman")} size="sm">
              <Megaphone className="mr-2 h-4 w-4" /> Pengumuman
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3 mt-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-md" />)}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="mt-4 p-8 border border-dashed border-border rounded-md text-center text-muted-foreground">
              <BellRing className="mx-auto h-12 w-12 mb-4" />
              Tidak ada notifikasi {filter !== "all" ? `untuk kategori ${filter === "tugas" ? "Tugas & Ujian" : "Pengumuman"}` : ""} saat ini.
            </div>
          ) : (
            <div className="mt-4 space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              {filteredNotifications.map((notification, index) => (
                <Card 
                  key={notification.id} 
                  className={cn("hover:shadow-md transition-shadow", !notification.read && "bg-primary/5 border-primary/30")}
                  onClick={() => handleMarkAsRead(notification.id, index)}
                >
                  <CardHeader className="pb-3 pt-4 px-4">
                    <div className="flex justify-between items-start">
                        <CardTitle className="text-base font-semibold leading-tight block truncate">
                            {notification.href ? (
                                <Link href={notification.href} className="hover:underline focus:outline-none focus:ring-1 focus:ring-ring rounded-sm block truncate">
                                    {notification.title}
                                </Link>
                            ) : (
                                <span className="block truncate">{notification.title}</span>
                            )}
                        </CardTitle>
                        {!notification.read && (
                            <span className="flex-shrink-0 ml-2 h-2.5 w-2.5 rounded-full bg-primary" title="Belum dibaca"></span>
                        )}
                    </div>
                    <CardDescription className="text-xs text-muted-foreground pt-0.5">
                      {notification.createdAt && typeof notification.createdAt.toDate === 'function'
                        ? notification.createdAt.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
                        : "Tanggal tidak valid"}
                      {notification.type && NOTIFICATION_TYPE_MAP[notification.type] && (
                        <span className="ml-2 inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {NOTIFICATION_TYPE_MAP[notification.type]}
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-foreground pt-0 pb-4 px-4">
                    <p className="line-clamp-2 truncate">{notification.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
