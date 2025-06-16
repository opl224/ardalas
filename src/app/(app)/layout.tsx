
"use client"; 

import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { Sheet } from "@/components/ui/sheet"; 
import LottieLoader from "@/components/ui/LottieLoader";

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
  const [lottieAuthLoadingLoaded, setLottieAuthLoadingLoaded] = useState(false);
  const [lottieRedirectLoaded, setLottieRedirectLoaded] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4 p-4">
<<<<<<< HEAD
            <LottieLoader width={150} height={150} />
<<<<<<< HEAD
=======
            <h1 className="text-2xl font-semibold">Memuat Ardalas...</h1>
            <p className="text-muted-foreground">Silakan tunggu sebentar.</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4 p-4">
          <LottieLoader width={150} height={150} onAnimationLoaded={() => setLottieRedirectLoaded(true)} />
          {lottieRedirectLoaded ? (
            <h1 className="text-xl font-semibold text-muted-foreground">Mengalihkan ke halaman login...</h1>
          ) : (
            <div style={{ height: "1.75rem" }} aria-hidden="true" /> // Placeholder for h1 (text-xl)
          )}
        </div>
      </div>
    );
  }
  
  return (
    <SidebarProvider defaultOpen>
      <AppLayoutInternal>{children}</AppLayoutInternal>
    </SidebarProvider>
    );
}
