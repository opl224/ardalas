
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
        <p className="text-muted-foreground">Profil pengembang di balik aplikasi Ardalas.</p>
      </div>
      <div className="flex justify-center items-center py-8">
        <ProfileCard
            name="Nifsah Amalia"
            title="Full-Stack Developer"
            handle="nifsah"
            status="Online"
            contactText="Hubungi Saya"
            avatarUrl="/avatars/nifsah.png"
            showUserInfo={true}
            enableTilt={true}
            onContactClick={() => window.open('https://www.linkedin.com/in/nifsah-amalia/', '_blank')}
        />
      </div>
    </div>
  );
}
