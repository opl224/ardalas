
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
import { Bell, LogOut, Search, Settings, PanelLeft, Mail, X, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useSidebar } from "@/components/ui/sidebar"; 
import { SheetTrigger, SheetContent } from "@/components/ui/sheet"; 
import { useState, useEffect, type ReactNode } from "react";
import Image from "next/image";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { roleDisplayNames } from "@/config/roles";

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

  const MAX_DROPDOWN_NOTIFICATIONS = 10;

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
      limit(MAX_DROPDOWN_NOTIFICATIONS) 
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedNotifications: NotificationDoc[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
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
    
    const notificationToUpdate = notifications.find(n => n.id === id);
    if (!notificationToUpdate || notificationToUpdate.read) return;


    setNotifications(prev => prev.map(n => n.id === id && !n.read ? {...n, read: true} : n));
    setUnreadCount(prev => prev > 0 ? prev - 1 : 0);

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
    const unreadNotifications = notifications.filter(n => !n.read);

    unreadNotifications.forEach(notification => {
      const notificationRef = doc(db, "notifications", notification.id);
      batch.update(notificationRef, { read: true });
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
  
  const displayedNotifications = notifications.slice(0, 5);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full focus-visible:ring-0 focus-visible:ring-offset-0" data-unread={unreadCount > 0}>
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
      <DropdownMenuContent className="w-80 bg-popover/95 backdrop-blur-md shadow-xl" align="end">
        <DropdownMenuLabel className="flex justify-between items-center sticky top-0 bg-popover/95 z-10 pt-2 px-2 pb-1.5">
          <span>Notifikasi Terbaru ({unreadCount})</span>
          {unreadCount > 0 && (
            <Button variant="link" size="xs" className="p-0 h-auto text-xs" onClick={handleMarkAllAsRead}>
              Tandai semua dibaca
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mt-0" />
        {displayedNotifications.length === 0 ? (
          <DropdownMenuItem disabled className="justify-center text-muted-foreground py-4">
            Tidak ada notifikasi baru.
          </DropdownMenuItem>
        ) : (
          <ScrollArea className="max-h-[calc(5*3.5rem)]">
            {displayedNotifications.map(notification => (
              <DropdownMenuItem 
                key={notification.id} 
                className={cn(
                  "flex flex-col items-start gap-0.5 p-2 cursor-pointer focus:bg-accent/80 relative", 
                  !notification.read && "bg-accent/50 hover:bg-accent/70"
                )}
                onClick={() => handleMarkAsRead(notification.id)} 
                asChild={!!notification.href}
              >
                {notification.href ? (
                  <Link href={notification.href} className="w-full block">
                    {!notification.read && (
                      <span className="absolute top-1.5 right-1.5 flex h-2 w-2"> 
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                    )}
                    <p className="font-semibold text-sm line-clamp-1 pr-3">{notification.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{notification.description}</p>
                    <p className="text-xs text-muted-foreground/80">
                      {notification.createdAt?.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) || "Baru saja"}
                    </p>
                  </Link>
                ) : (
                  <div className="w-full">
                     {!notification.read && (
                      <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                    )}
                    <p className="font-semibold text-sm line-clamp-1 pr-3">{notification.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{notification.description}</p>
                    <p className="text-xs text-muted-foreground/80">
                      {notification.createdAt?.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) || "Baru saja"}
                    </p>
                  </div>
                )}
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="justify-center focus:bg-accent/80">
          <Link href="/notifications" className="w-full text-center text-sm text-primary font-medium py-1.5">
            Lihat Semua Notifikasi
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


function UserNav() {
  const { user, role } = useAuth();
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
        <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 focus-visible:ring-0 focus-visible:ring-offset-0">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User"} data-ai-hint="profile picture"/>
            <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 bg-popover/90 backdrop-blur-md" align="end" forceMount>
        <DropdownMenuItem asChild>
          <Link href="/profil">
            <User className="mr-2 h-4 w-4" />
            <span>Profil</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="mr-2 h-4 w-4" />
            <span>Pengaturan Akun</span>
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
  const pageTitle = currentNavItem?.title || "Ardalas";
  const [isHamburgerWiggling, setIsHamburgerWiggling] = useState(false);

  const handleHamburgerClick = () => {
    setIsHamburgerWiggling(true);
    setOpenMobile(true);
    setTimeout(() => setIsHamburgerWiggling(false), 500); 
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 backdrop-blur-md px-4 sm:px-8">
      <div className="flex items-center gap-2">
        {isMobile && (
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleHamburgerClick} className={cn("md:hidden", isHamburgerWiggling && "animate-hamburger-wiggle")}>
              <Image 
                src="/hamburger.png" 
                alt="Menu" 
                width={20} 
                height={20} 
                data-ai-hint="menu icon"
                className="dark:invert dark:brightness-95" 
              />
              <span className="sr-only">Toggle Sidebar</span>
            </Button>
          </SheetTrigger>
        )}
        <div className="flex items-center">
          <h1 className="text-xl font-semibold font-headline truncate">{pageTitle}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <NotificationBell />
        <UserNav />
      </div>
    </header>
  );
}
