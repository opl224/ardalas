
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LottieLoader from "@/components/ui/LottieLoader";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [lottieLoaded, setLottieLoaded] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
    }
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="flex flex-col items-center space-y-4">
<<<<<<< HEAD
        <LottieLoader width={150} height={150} /> 
<<<<<<< HEAD
        <h1 className="text-2xl font-semibold">Berusaha masuk...</h1>
=======
        <h1 className="text-2xl font-semibold">Memuat Ardalas...</h1>
>>>>>>> 81780d2 (hapus silahkan unggu sebentar dan hilangkan loader skeleton pada lottie-)
=======
        <LottieLoader width={150} height={150} onAnimationLoaded={() => setLottieLoaded(true)} /> 
        {lottieLoaded ? (
          <h1 className="text-2xl font-semibold">Memuat Ardalas...</h1>
        ) : (
          <div style={{ height: "2rem" }} aria-hidden="true" /> // Placeholder for h1 height (text-2xl approx line-height)
        )}
>>>>>>> 44bea24 (buat agar lottie animation keluar bersamaan dengan tulisan, soalnya lott)
      </div>
    </div>
  );
}
