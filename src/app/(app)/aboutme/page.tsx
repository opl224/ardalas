
"use client";

import ProfileCard from '@/components/ui/ProfileCard';
import '@/components/ui/ProfileCard.css';
import CircularText from '@/components/ui/CircularText';
import '@/components/ui/CircularText.css';
import ScrambledText from '@/components/ui/ScrambledText';
import Image from 'next/image';

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

      <div className="flex items-center justify-center gap-6">
        <Image
          src="/logo-icon/github.png"
          alt="GitHub Logo"
          width={48}
          height={48}
          className="h-12 w-12 dark:invert"
          data-ai-hint="github logo"
        />
        <Image
          src="/logo-icon/nextjs.png"
          alt="Next.js Logo"
          width={48}
          height={48}
          className="h-12 w-12 dark:invert"
          data-ai-hint="nextjs logo"
        />
      </div>

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
