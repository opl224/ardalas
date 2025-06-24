
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
import { ScrollArea } from '@/components/ui/scroll-area';


export default function AboutMePage() {
  return (
    <div className="space-y-8 flex flex-col items-center">
      <div className="pt-8">
        <div className="relative inline-block">
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
          <div className="absolute top-[-45px] right-[-45px] z-20 opacity-50 scale-75">
             <CircularText
               text="NOVAL-FIRDAUS-NOVAL-FIRDAUS-"
               onHover="speedUp"
               spinDuration={30}
               radius={60}
             />
           </div>
        </div>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <Button className="inline-flex items-center gap-4 rounded-full bg-secondary px-6 py-3 text-lg font-semibold text-secondary-foreground shadow-md transition-all hover:bg-secondary/90 hover:shadow-lg hover:scale-105 h-auto">
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
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>Projek Saya</DialogTitle>
            <DialogDescription>
              Berikut adalah beberapa projek yang pernah saya kerjakan.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
              <Link href="https://ngecet.vercel.app/" target="_blank" rel="noopener noreferrer">
                <Image
                  src="/project/ngecet.jpg"
                  alt="Project Ngecet"
                  width={400}
                  height={300}
                  className="rounded-md object-cover w-full h-auto"
                  data-ai-hint="painting app screenshot"
                />
              </Link>
              <Link href="https://ngeser.vercel.app" target="_blank" rel="noopener noreferrer">
                <Image
                  src="/project/ngeser.jpg"
                  alt="Project Ngeser"
                  width={400}
                  height={300}
                  className="rounded-md object-cover w-full h-auto"
                  data-ai-hint="game screenshot"
                />
              </Link>
            </div>
          </ScrollArea>
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
