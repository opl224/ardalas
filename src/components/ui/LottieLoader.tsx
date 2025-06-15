
"use client";

import React, { useEffect, useState } from "react";
import Lottie from "lottie-react";
import { cn } from "@/lib/utils";

interface LottieLoaderProps {
  className?: string;
  width?: number | string; 
  height?: number | string; 
}

const LottieLoader: React.FC<LottieLoaderProps> = ({
  className,
  width = 32, 
  height = 32, 
}) => {
  const [animationData, setAnimationData] = useState<object | null>(null);
  const [isLoadingLottie, setIsLoadingLottie] = useState(true);
  const [errorLottie, setErrorLottie] = useState<string | null>(null);

  useEffect(() => {
    const loadAnimation = async () => {
      try {
        const response = await fetch("/lottie-animations/loader-animation.json");
        if (!response.ok) {
          throw new Error(`Failed to fetch Lottie: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        setAnimationData(data);
      } catch (err: any) {
        console.error("Error loading Lottie animation:", err);
        setErrorLottie(err.message || "Could not load animation");
      } finally {
        setIsLoadingLottie(false);
      }
    };

    loadAnimation();
  }, []);

  if (isLoadingLottie) {
    return <div className={cn("animate-pulse rounded-md bg-muted", className)} style={{ width, height }} aria-label="Loading animation..."></div>;
  }

  if (errorLottie || !animationData) {
    return (
      <div className={cn("text-destructive text-xs text-center p-1 flex items-center justify-center", className)} style={{ width, height }}>
        Animasi Gagal Dimuat
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-center", className)} style={{ width, height }}>
      <Lottie
        animationData={animationData}
        loop={true}
        autoplay={true}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};

export default LottieLoader;
