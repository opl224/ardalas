
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
  const [errorLottie, setErrorLottie] = useState<string | null>(null);

  useEffect(() => {
    const loadAnimation = async () => {
      try {
        // Ensure the path is correct and the file is in the public folder
        const response = await fetch("/lottie-animations/loader-animation.json");
        if (!response.ok) {
          throw new Error(`Failed to fetch Lottie: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        setAnimationData(data);
      } catch (err: any) {
        console.error("Error loading Lottie animation:", err);
        setErrorLottie(err.message || "Could not load animation");
      }
    };

    loadAnimation();
  }, []);

  if (errorLottie || !animationData) {
    // If animation fails to load, display a fallback or nothing.
    // For now, returning a simple div to maintain layout if size is important.
    // Or, you could return null if you prefer it to be invisible on error.
    return <div className={cn("flex items-center justify-center text-destructive text-xs", className)} style={{ width, height }} aria-label="Animation failed to load"></div>;
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
