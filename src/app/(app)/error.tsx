// src/app/(app)/error.tsx
"use client"; // Error components must be Client Components

import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.20))] text-center p-4">
      <h2 className="text-2xl font-bold mb-4">Ada Sesuatu yang Salah!</h2>
      <p className="text-muted-foreground mb-6">
        {error.message || "Terjadi kesalahan yang tidak terduga. Silakan coba lagi atau hubungi dukungan jika masalah berlanjut."}
      </p>
      <Button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
      >
        Coba Lagi
      </Button>
    </div>
  );
}
