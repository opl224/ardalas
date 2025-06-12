
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { navItems } from "@/config/nav";
import { useAuth } from "@/context/AuthContext";
import { auth, db } from "@/lib/firebase/config";
import { cn } from "@/lib/utils";
import { signOut } from "firebase/auth";
import { Bell, LogOut, Search, Settings, UserCircle, PanelLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useSidebar } from "@/components/ui/sidebar"; 
import { SheetTrigger } from "@/components/ui/sheet"; 
import { useState, useEffect, type ReactNode } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  writeBatch,
  Timestamp, 
} from "firebase/firestore";

interface NotificationDoc {
  id: string; 
  title: string;
  description: string;
  read: boolean;
  createdAt: Timestamp | null; 
  href?: string;
  type?: string;
  userId?: string; 
}

function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationDoc[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    if (!user || !user.uid) { 
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const notificationsRef = collection(db, "notifications");
    const q = query(
      notificationsRef,
      where("userId", "==", user.uid), 
      orderBy("createdAt", "desc"),
      limit(10) 
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedNotifications: NotificationDoc[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          // Ensure createdAt is a Firestore Timestamp or null
          let createdAtTimestamp: Timestamp | null = null;
          if (data.createdAt instanceof Timestamp) {
            createdAtTimestamp = data.createdAt;
          }


          fetchedNotifications.push({ 
            id: docSnap.id, 
            title: data.title || "Tanpa Judul",
            description: data.description || "",
            read: data.read === true, 
            createdAt: createdAtTimestamp,
            href: data.href,
            type: data.type,
            userId: data.userId,
          });
        });
        setNotifications(fetchedNotifications);
        setUnreadCount(fetchedNotifications.filter(n => !n.read).length);
      },
      (error) => {
        console.error("Error fetching notifications:", error);
        toast({
          title: "Gagal Memuat Notifikasi",
          description: "Terjadi kesalahan saat mengambil notifikasi.",
          variant: "destructive",
        });
      }
    );

    return () => unsubscribe(); 
  }, [user, toast]);

  const handleMarkAsRead = async (id: string) => {
    if (!user) return;
    const notificationRef = doc(db, "notifications", id);
    try {
      await updateDoc(notificationRef, { read: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      toast({
        title: "Update Notifikasi Gagal",
        description: "Gagal menandai notifikasi sebagai dibaca.",
        variant: "destructive",
      });
    }
  };
  
  const handleMarkAllAsRead = async () => {
    if (!user || unreadCount === 0) return;
    const batch = writeBatch(db);
    notifications.forEach(notification => {
      if (!notification.read) {
        const notificationRef = doc(db, "notifications", notification.id);
        batch.update(notificationRef, { read: true });
      }
    });
    try {
      await batch.commit();
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      toast({
        title: "Update Notifikasi Gagal",
        description: "Gagal menandai semua notifikasi sebagai dibaca.",
        variant: "destructive",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" data-unread={unreadCount > 0}>
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
          )}
          <span className="sr-only">Notifikasi</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 bg-popover/90 backdrop-blur-md" align="end">
        <DropdownMenuLabel className="flex justify-between items-center">
          <span>Notifikasi ({unreadCount})</span>
          {unreadCount > 0 && (
            <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={handleMarkAllAsRead}>
              Tandai semua dibaca
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <DropdownMenuItem disabled className="justify-center text-muted-foreground">
            Tidak ada notifikasi.
          </DropdownMenuItem>
        ) : (
          notifications.slice(0, 5).map(notification => (
            <DropdownMenuItem 
              key={notification.id} 
              className={cn("flex flex-col items-start gap-1", !notification.read && "bg-accent/50")}
              onClick={() => !notification.read && handleMarkAsRead(notification.id)}
              asChild={!!notification.href}
            >
              {notification.href ? (
                 <Link href={notification.href} className="w-full">
                    <p className="font-semibold text-sm">{notification.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{notification.description}</p>
                    <p className="text-xs text-muted-foreground/70">
                      {notification.createdAt && typeof notification.createdAt.toDate === 'function'
                        ? notification.createdAt.toDate().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : "Tanggal tidak valid"}
                    </p>
                 </Link>
              ) : (
                <div className="w-full">
                  <p className="font-semibold text-sm">{notification.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{notification.description}</p>
                   <p className="text-xs text-muted-foreground/70">
                     {notification.createdAt && typeof notification.createdAt.toDate === 'function'
                       ? notification.createdAt.toDate().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                       : "Tanggal tidak valid"}
                    </p>
                </div>
              )}
            </DropdownMenuItem>
          ))
        )}
        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="justify-center">
              <Link href="/notifications" className="text-sm text-primary">Lihat Semua Notifikasi</Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


function UserNav() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({ title: "Logout Berhasil", description: "Anda telah keluar dari akun." });
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
      toast({ title: "Logout Gagal", description: "Terjadi kesalahan saat logout.", variant: "destructive" });
    }
  };

  if (!user) return null;

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "??";
    const names = name.split(" ");
    if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
    return (names[0][0] + names[names.length - 1][0]).toUpperCase();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.photoURL || ""} alt={user.displayName || "User"} data-ai-hint="profile picture" />
            <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 bg-popover/90 backdrop-blur-md" align="end" forceMount>
        {/* <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.displayName || "Pengguna"}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
            {user.role && (
              <p className="text-xs leading-none text-muted-foreground capitalize">
                Peran: {user.role}
              </p>
            )}
          </div>
        </DropdownMenuLabel> */}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/profile"> 
            <UserCircle className="mr-2 h-4 w-4" />
            <span>Profil</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="mr-2 h-4 w-4" />
            <span>Pengaturan</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


export function AppHeader() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar(); 
  const currentNavItem = navItems.find(item => item.href === pathname || (item.href !== "/dashboard" && pathname.startsWith(item.href)));
  const pageTitle = currentNavItem?.title || "SDN";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background px-4 sm:px-8">
      {/* Left Aligned Items: Mobile Trigger + Page Title */}
      <div className="flex items-center gap-2">
        {isMobile && (
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => setOpenMobile(true)} className="md:hidden">
              <PanelLeft className="h-5 w-5" />
              <span className="sr-only">Toggle Sidebar</span>
            </Button>
          </SheetTrigger>
        )}
        <div className="flex items-center"> {/* Wrapper for title only */}
          <h1 className="text-xl font-semibold font-headline">{pageTitle}</h1>
        </div>
      </div>

      {/* Right Aligned Items: Search, Notifications, User Menu */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* <form className="relative hidden sm:block flex-1 md:grow-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Cari..."
              className="w-full rounded-lg bg-muted pl-8 md:w-[200px] lg:w-[320px]"
            />
        </form> */}
        <NotificationBell />
        <UserNav />
      </div>
    </header>
  );
}
