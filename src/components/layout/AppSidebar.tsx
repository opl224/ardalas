
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Settings, ChevronRight, UserCog } from "lucide-react";
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
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarTrigger,
  useSidebar, 
} from "@/components/ui/sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useState } from "react";

function AppLogo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-2 font-headline text-lg font-semibold tracking-tight text-primary">
       <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-primary">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
      <span>EduCentral</span>
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  // Get sidebar context for mobile sheet
  const { isMobile, openMobile, setOpenMobile } = useSidebar();


  const toggleSubmenu = (title: string) => {
    setOpenSubmenu(prevOpenTitle => (prevOpenTitle === title ? null : title));
  };

  const renderNavItemsRecursive = (items: NavItem[], currentPath: string, userRole: string | null, isSubMenuParam = false) => {
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
                  (isActive) && "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground"
                )}
                tooltip={item.title}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <item.icon className="h-5 w-5 shrink-0" />
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
                {renderNavItemsRecursive(item.children, currentPath, userRole, true)}
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
                  "justify-start w-full",
                  isActive && "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground"
                )}
                tooltip={item.title}
              >
                <Link href={item.href}>
                  <item.icon className="h-5 w-5 shrink-0" />
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
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
      toast({ title: "Logout Gagal", description: "Terjadi kesalahan saat logout.", variant: "destructive" });
    }
  };

  const sidebarContent = (
    <>
      <SidebarHeader className="p-4 border-b border-border/50">
        <div id="mobile-sidebar-title" className="flex items-center justify-between">
          <AppLogo />
          <SidebarTrigger className="md:hidden" />
        </div>
      </SidebarHeader>
      <SidebarContent className="flex-1 p-2">
        <SidebarMenu>
          {renderNavItemsRecursive(navItems, pathname, role)}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-2 border-t border-border/50">
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
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="left" 
          className="w-[18rem] bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          aria-labelledby="mobile-sidebar-title"
        >
          <div className="flex h-full w-full flex-col">
            {sidebarContent}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
      <Sidebar
        className="border-r border-border/50 bg-sidebar/80 backdrop-blur-md hidden md:flex" 
        collapsible="icon"
      >
        {sidebarContent}
      </Sidebar>
  );
}
