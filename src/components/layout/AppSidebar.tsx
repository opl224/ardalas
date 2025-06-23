
"use client";

import Link from "next/link";
import Image from "next/image"; // Added Image import
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Settings, ChevronRight, UserCog, PanelLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navItems } from "@/config/nav";
import type { NavItem } from "@/config/nav";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { useToast } from "@/hooks/use-toast";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar, 
} from "@/components/ui/sidebar";
import { SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"; 
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect } from "react";

function AppLogo() {
  const { state, isMobile } = useSidebar();
  const isCollapsedAndNotMobile = state === 'collapsed' && !isMobile;

  return (
    <Link
      href="/dashboard"
      className={cn(
        "flex items-center justify-center font-headline text-lg font-semibold tracking-tight text-primary",
        isCollapsedAndNotMobile ? "justify-center w-full h-full" : "gap-2 px-4" 
      )}
    >
      <Image
        src="/logo3.png"
        alt="Ardalas Logo"
        width={120} 
        height={52} 
        data-ai-hint="logo company"
        className={cn(
            isCollapsedAndNotMobile && "relative left-1" 
        )}
      />
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  const { isMobile, setOpenMobile, state, openMobile } = useSidebar();
  const [isClosing, setIsClosing] = useState(false);


  const toggleSubmenu = (title: string) => {
    setOpenSubmenu(prevOpenTitle => (prevOpenTitle === title ? null : title));
  };

  const handleSheetClose = () => {
    setIsClosing(true);
    // Delay actual closing to allow animation to play
    setTimeout(() => {
      setOpenMobile(false);
      setIsClosing(false);
    }, 300); // Match animation duration
  };

  const renderNavItemsRecursive = (items: NavItem[], currentPath: string, userRole: string | null, isSubMenuParam = false, parentTitle: string | null = null) => {
    return items
      .filter(item => !item.roles || (userRole && item.roles.includes(userRole as any)))
      .map((item) => {
        const hasChildren = item.children && item.children.length > 0;
        const isCurrentSubmenuOpen = hasChildren && openSubmenu === item.title;
        
        const isParentOrChildActive = hasChildren
          ? item.children?.some(child => currentPath === child.href || (child.href !== "/dashboard" && child.href !== "#" && currentPath.startsWith(child.href))) ?? false
          : false;
        
        const isActive = hasChildren 
          ? (isCurrentSubmenuOpen || isParentOrChildActive) 
          : currentPath === item.href || (item.href !== "/dashboard" && item.href !== "#" && currentPath.startsWith(item.href));


        const ButtonComponent = isSubMenuParam ? SidebarMenuSubButton : SidebarMenuButton;
        const ItemComponent = isSubMenuParam ? SidebarMenuSubItem : SidebarMenuItem;

        if (hasChildren) {
          return (
            <ItemComponent key={item.title}>
              <ButtonComponent
                onClick={() => toggleSubmenu(item.title)}
                isActive={isActive} 
                className={cn(
                  "w-full justify-between",
                  (isActive) && "bg-sidebar-accent text-sidebar-accent-foreground dark:bg-sidebar-accent dark:text-sidebar-accent-foreground"
                )}
                tooltip={item.title}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  {typeof item.icon === 'string' ? (
                    <Image src={item.icon} alt={item.title} width={20} height={20} className="h-5 w-5 shrink-0 rounded-full object-cover dark:invert dark:brightness-95" />
                  ) : (
                    <item.icon className="h-5 w-5 shrink-0" />
                  )}
                  <span className="truncate">{item.title}</span>
                </div>
                <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform duration-500", isCurrentSubmenuOpen && "rotate-90")} />
              </ButtonComponent>
              <SidebarMenuSub
                className={cn(
                  "overflow-hidden transition-all duration-500 ease-in-out",
                  isCurrentSubmenuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                )}
              >
                {renderNavItemsRecursive(item.children, currentPath, userRole, true, item.title)}
              </SidebarMenuSub>
            </ItemComponent>
          );
        } else {
          return (
            <ItemComponent key={item.title}>
              <ButtonComponent
                asChild
                isActive={isActive}
                className={cn(
                  "w-full",
                  !isMobile && state === 'collapsed' ? "justify-center" : "justify-start",
                  isActive && "bg-sidebar-accent text-sidebar-accent-foreground dark:bg-sidebar-accent dark:text-sidebar-accent-foreground"
                )}
                tooltip={item.title}
              >
                <Link href={item.href} onClick={() => { 
                  if (isMobile) handleSheetClose(); // Use animated close
                  if (!hasChildren && (!isSubMenuParam || (isSubMenuParam && parentTitle !== item.title && parentTitle !== openSubmenu))) {
                     setOpenSubmenu(null);
                  }
                }}>
                  {typeof item.icon === 'string' ? (
                    <Image src={item.icon} alt={item.title} width={20} height={20} className="h-5 w-5 shrink-0 rounded-full object-cover dark:invert dark:brightness-95" />
                  ) : (
                    <item.icon className="h-5 w-5 shrink-0" />
                  )}
                  <span className="truncate">{item.title}</span>
                  {item.label && <span className="ml-auto text-xs">{item.label}</span>}
                </Link>
              </ButtonComponent>
            </ItemComponent>
          );
        }
      });
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({ title: "Logout Berhasil", description: "Anda telah keluar dari akun." });
      if(isMobile) handleSheetClose(); // Use animated close
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
      toast({ title: "Logout Gagal", description: "Terjadi kesalahan saat logout.", variant: "destructive" });
    }
  };

  const sidebarDesktopContent = (
    <>
      <div className={cn(
        "flex h-16 items-center border-b border-border", 
        (!isMobile && state === 'collapsed') ? 'justify-center px-0' : 'px-0 justify-center' 
      )}>
         <AppLogo />
      </div>
      <SidebarContent className="flex-1"> 
        <ScrollArea className="h-full w-full p-2">
          <SidebarMenu>
            {renderNavItemsRecursive(navItems, pathname, role)}
          </SidebarMenu>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="p-2 border-t border-border">
        <SidebarMenu>
          {user && (
            <SidebarMenuItem>
              <SidebarMenuButton 
                onClick={handleLogout} 
                className="justify-start w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                tooltip="Logout"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                <span className="truncate">Logout</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </>
  );


  if (isMobile) {
    return (
      <SheetContent
        side="left" 
        className="w-[18rem] bg-sidebar p-0 text-sidebar-foreground flex flex-col"
        aria-labelledby="mobile-sidebar-title-component" 
        // Remove onOpenChange from here if we manage openMobile directly via setOpenMobile(false)
      >
        <SheetHeader className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
             <AppLogo />
             <Button variant="ghost" size="icon" onClick={handleSheetClose} className={cn(isClosing && "animate-x-spin-once")}>
                <X className="h-5 w-5" />
                <span className="sr-only">Tutup Sidebar</span>
              </Button>
          </div>
          <SheetTitle id="mobile-sidebar-title-component" className="sr-only">Navigasi Utama</SheetTitle>
        </SheetHeader>
        <SidebarContent className="flex-1"> 
          <ScrollArea className="h-full w-full p-2"> 
            <SidebarMenu>
              {renderNavItemsRecursive(navItems, pathname, role)}
            </SidebarMenu>
          </ScrollArea>
        </SidebarContent>
        <SidebarFooter className="p-2 border-t border-border">
          <SidebarMenu>
            {user && (
              <SidebarMenuItem>
                <SidebarMenuButton 
                  onClick={handleLogout} 
                  className="justify-start w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut className="h-5 w-5 shrink-0" />
                  <span className="truncate">Logout</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarFooter>
      </SheetContent>
    );
  }

  return (
      <Sidebar
        className="border-r border-border bg-sidebar hidden md:flex" 
        collapsible="icon"
      >
        {sidebarDesktopContent}
      </Sidebar>
  );
}
