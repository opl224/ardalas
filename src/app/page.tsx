
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LottieLoader from "@/components/ui/LottieLoader"; // Import LottieLoader

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

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
        <LottieLoader width={150} height={150} /> 
<<<<<<< HEAD
        <h1 className="text-2xl font-semibold">Berusaha masuk...</h1>
=======
        <h1 className="text-2xl font-semibold">Memuat Ardalas...</h1>
>>>>>>> 81780d2 (hapus silahkan unggu sebentar dan hilangkan loader skeleton pada lottie-)
      </div>
    </div>
  );
}
