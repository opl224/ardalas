
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCircle } from "lucide-react";
import ProfileCard from '@/components/ui/ProfileCard';
import '@/components/ui/ProfileCard.css';

export default function AboutMePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Tentang Pengembang</h1>
        <p className="text-muted-foreground">Profil tim pengembang di balik aplikasi Ardalas.</p>
      </div>
      <div className="flex justify-center items-center py-8">
        <ProfileCard
            name="Tim Ardalas"
            title="Pengembang Aplikasi"
            handle="ardalasdev"
            status="Online"
            contactText="Hubungi Kami"
            avatarUrl="https://placehold.co/512x512.png"
            data-ai-hint="developer avatar"
            showUserInfo={true}
            enableTilt={true}
            onContactClick={() => console.log('Contact clicked')}
        />
      </div>
    </div>
  );
}
