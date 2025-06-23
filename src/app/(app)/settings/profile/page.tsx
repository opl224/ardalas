
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";

export default function MovedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.20))] text-center p-4">
      <Info className="h-12 w-12 text-primary mb-4" />
      <h2 className="text-2xl font-bold mb-2">Halaman Telah Dipindahkan</h2>
      <p className="text-muted-foreground mb-6">
        Halaman profil sekarang dapat diakses di menu "Tentang Saya".
      </p>
      <Button asChild>
        <Link href="/aboutme">Buka Halaman Profil</Link>
      </Button>
    </div>
  );
}
