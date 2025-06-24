
"use client";

import ProfileCard from '@/components/ui/ProfileCard';
import '@/components/ui/ProfileCard.css';
import CircularText from '@/components/ui/CircularText';
import '@/components/ui/CircularText.css';
import ScrambledText from '@/components/ui/ScrambledText';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';


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

      <Dialog>
        <DialogTrigger asChild>
          <Button className="inline-flex items-center gap-4 rounded-full bg-secondary px-6 py-3 text-lg font-semibold text-secondary-foreground shadow-md transition-all hover:bg-secondary/90 hover:shadow-lg hover:scale-105 h-auto">
            <div className="flex items-center gap-3">
              <Link href="https://github.com/opl224" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                <Image
                  src="/logo-icon/github.png"
                  alt="GitHub Logo"
                  width={32}
                  height={32}
                  className="h-8 w-8 dark:invert"
                  data-ai-hint="github logo"
                />
              </Link>
            </div>
            <span>Projek</span>
            <ArrowRight className="h-5 w-5" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>Projek Saya</DialogTitle>
            <DialogDescription>
              Berikut adalah beberapa projek yang pernah saya kerjakan.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <Image
              src="https://placehold.co/400x300.png"
              alt="Placeholder Project 1"
              width={400}
              height={300}
              className="rounded-md object-cover w-full h-auto"
              data-ai-hint="project portfolio"
            />
            <Image
              src="https://placehold.co/400x300.png"
              alt="Placeholder Project 2"
              width={400}
              height={300}
              className="rounded-md object-cover w-full h-auto"
              data-ai-hint="website screenshot"
            />
          </div>
        </DialogContent>
      </Dialog>

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
