
"use client"; 

import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { Sheet } from "@/components/ui/sheet"; // Import Sheet

// Internal component to consume sidebar context
function AppLayoutInternal({ children }: { children: ReactNode }) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  return (
    <Sheet open={isMobile && openMobile} onOpenChange={setOpenMobile}>
      <div className="flex min-h-screen w-full">
        <AppSidebar /> {/* Renders SheetContent for mobile */}
        <div className="flex flex-1 flex-col pl-px"> {/* Added pl-px here */}
          <AppHeader /> {/* Renders SheetTrigger for mobile */}
          <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-screen-2xl">
             {children}
            </div>
          </main>
        </div>
      </div>
    </Sheet>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-4 p-4">
            <div className="flex items-center space-x-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
              </div>
            </div>
            <Skeleton className="h-[300px] w-[300px] rounded-md" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p>Redirecting to login...</p>
      </div>
    );
  }
  
  return (
    <SidebarProvider defaultOpen>
      <AppLayoutInternal>{children}</AppLayoutInternal>
    </SidebarProvider>
    );
}
