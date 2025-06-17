
"use client";

import React, { useEffect, useState } from "react";
import Lottie from "lottie-react";
import { cn } from "@/lib/utils";

interface LottieLoaderProps {
  className?: string;
  width?: number | string; 
  height?: number | string; 
  onAnimationLoaded?: () => void; // Callback when animation data is loaded
}

const LottieLoader: React.FC<LottieLoaderProps> = ({
  className,
  width = 32, 
  height = 32, 
  onAnimationLoaded,
}) => {
  const [animationData, setAnimationData] = useState<object | null>(null);
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
        onAnimationLoaded?.(); // Call the callback
      } catch (err: any) {
        console.error("Error loading Lottie animation:", err);
        setErrorLottie(err.message || "Could not load animation");
        onAnimationLoaded?.(); // Call callback even on error to unlock text
      }
    };

    loadAnimation();
  }, [onAnimationLoaded]);

  if (errorLottie) {
    return (
      <div 
        className={cn("flex items-center justify-center text-destructive text-xs p-1 text-center", className)} 
        style={{ width, height }} 
        role="img" 
        aria-label="Animasi gagal dimuat"
      >
        ⚠️
      </div>
    );
  }

  if (!animationData) {
    // Render a placeholder with the same dimensions to prevent layout shift
    return <div style={{ width, height }} className={cn(className)} aria-busy="true" aria-label="Memuat animasi..." />;
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
