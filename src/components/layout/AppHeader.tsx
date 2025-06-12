
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
import { auth } from "@/lib/firebase/config";
import { cn } from "@/lib/utils";
import { signOut } from "firebase/auth";
import { Bell, LogOut, Search, Settings, UserCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { SidebarTrigger } from "../ui/sidebar";
import { useState, useEffect, type ReactNode } from "react"; // Added ReactNode

interface MockNotification {
  id: string;
  title: string;
  description: string;
  read: boolean;
  createdAt: Date;
  href?: string;
}

function NotificationBell() {
  const [notifications, setNotifications] = useState<MockNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Simulate fetching notifications
    const mockData: MockNotification[] = [
      { id: "1", title: "Pengumuman Baru: Libur Sekolah", description: "Kegiatan belajar mengajar diliburkan...", read: false, createdAt: new Date(Date.now() - 3600000) }, // 1 hour ago
      { id: "2", title: "Tugas Matematika Dikumpulkan Besok", description: "Jangan lupa kumpulkan tugas Bab 3.", read: true, createdAt: new Date(Date.now() - 86400000) }, // 1 day ago
      { id: "3", title: "Acara Sekolah: Pentas Seni", description: "Pentas seni akan diadakan hari Sabtu.", read: false, createdAt: new Date(Date.now() - 172800000) }, // 2 days ago
    ];
    setNotifications(mockData);
    setUnreadCount(mockData.filter(n => !n.read).length);
  }, []);

  const handleMarkAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => prev > 0 ? prev - 1 : 0);
  };
  
  const handleMarkAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
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
          <span>Notifikasi</span>
          {unreadCount > 0 && (
            <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={handleMarkAllAsRead}>
              Tandai semua dibaca
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <DropdownMenuItem disabled className="justify-center text-muted-foreground">
            Tidak ada notifikasi baru.
          </DropdownMenuItem>
        ) : (
          notifications.slice(0, 5).map(notification => ( // Show max 5 notifications
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
                      {notification.createdAt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                 </Link>
              ) : (
                <div className="w-full">
                  <p className="font-semibold text-sm">{notification.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{notification.description}</p>
                   <p className="text-xs text-muted-foreground/70">
                      {notification.createdAt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
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
              {/* In a real app, this would link to a dedicated notifications page */}
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
        <DropdownMenuLabel className="font-normal">
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
        </DropdownMenuLabel>
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
  const currentNavItem = navItems.find(item => item.href === pathname || (item.href !== "/dashboard" && pathname.startsWith(item.href)));
  const pageTitle = currentNavItem?.title || "EduCentral";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/50 bg-background/80 px-4 shadow-sm backdrop-blur-md sm:px-6">
      <div className="md:hidden"> 
        <SidebarTrigger />
      </div>
      
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold font-headline">{pageTitle}</h1>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        <form className="relative ml-auto hidden sm:block flex-1 md:grow-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Cari..."
              className="w-full rounded-lg bg-muted pl-8 md:w-[200px] lg:w-[320px]"
            />
        </form>
        <NotificationBell />
        <UserNav />
      </div>
    </header>
  );
}

