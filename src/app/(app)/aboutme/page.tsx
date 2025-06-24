
"use client";

import ProfileCard from '@/components/ui/ProfileCard';
import '@/components/ui/ProfileCard.css';
import CircularText from '@/components/ui/CircularText';
import '@/components/ui/CircularText.css';
import ScrambledText from '@/components/ui/ScrambledText';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function AboutMePage() {
  return (
    <div className="relative space-y-8 flex flex-col items-center">
      <div className="absolute top-2 right-2 md:top-0 md:right-12 z-20 opacity-50 scale-75">
         <CircularText
           text="NOVAL-FIRDAUS-NOVAL-FIRDAUS-"
           onHover="speedUp"
           spinDuration={30}
           radius={70}
         />
       </div>
      <div className="flex justify-center items-center pt-8">
        <ProfileCard
            name="Noval Firdaus"
            title="Developer Pemula"
            handle="opank"
            status="mahasiswa"
            contactText="Hubungi Saya"
            avatarUrl="/opank1.png"
            showUserInfo={true}
            enableTilt={true}
            onContactClick={() => window.location.href = 'mailto:nnovalfirdaus@gmail.com'}
        />
      </div>

      <Link href="#" className="inline-flex items-center gap-4 rounded-full bg-secondary px-6 py-3 text-lg font-semibold text-secondary-foreground shadow-md transition-all hover:bg-secondary/90 hover:shadow-lg hover:scale-105">
        <div className="flex items-center gap-3">
          <Image
            src="/logo-icon/github.png"
            alt="GitHub Logo"
            width={32}
            height={32}
            className="h-8 w-8 dark:invert"
            data-ai-hint="github logo"
          />
          <Image
            src="/logo-icon/nextjs.png"
            alt="Next.js Logo"
            width={32}
            height={32}
            className="h-8 w-8 dark:invert"
            data-ai-hint="nextjs logo"
          />
        </div>
        <span>Projek</span>
        <ArrowRight className="h-5 w-5" />
      </Link>

       <div className="text-center max-w-lg text-xl font-mono text-foreground">
        <ScrambledText
          radius={100}
          duration={1.2}
          speed={0.5}
          scrambleChars=".:"
        >
          "Saya Manusia Biasa Makan Nasi"
        </ScrambledText>
      </div>
    </div>
  );
}
