
"use client";

import ProfileCard from '@/components/ui/ProfileCard';
import '@/components/ui/ProfileCard.css';
import CircularText from '@/components/ui/CircularText';
import '@/components/ui/CircularText.css';
import ScrambledText from '@/components/ui/ScrambledText';

export default function AboutMePage() {
  return (
    <div className="space-y-8 flex flex-col items-center">
      <div className="relative flex justify-center items-center pt-8">
         <div className="absolute -top-4 -right-12 z-20 opacity-50 scale-75">
            <CircularText
              text="NOVAL-FIRDAUS-NOVAL-FIRDAUS-"
              onHover="speedUp"
              spinDuration={30}
              radius={70}
            />
          </div>
        <ProfileCard
            name="Noval Firdaus"
            title="Developer Pemula"
            handle="opank"
            status="mahasiswa"
            contactText="Hubungi Saya"
            avatarUrl="/avatars/opank1.png"
            showUserInfo={true}
            enableTilt={true}
            onContactClick={() => window.location.href = 'mailto:opank2441@gmail.com'}
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
