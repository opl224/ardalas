"use client";

import ProfileCard from '@/components/ui/ProfileCard';
import '@/components/ui/ProfileCard.css';

export default function AboutMePage() {
  return (
    <div className="space-y-8 flex flex-col items-center">
      <div className="flex justify-center items-center pt-8">
        <ProfileCard
            name="Taufik Hidayat"
            title="Full-Stack Developer"
            handle="opank"
            status="Online"
            contactText="Hubungi Saya"
            avatarUrl="/avatars/opank1.png"
            showUserInfo={true}
            enableTilt={true}
            onContactClick={() => window.location.href = 'mailto:opank2441@gmail.com'}
        />
      </div>
      <div className="text-center text-muted-foreground max-w-lg">
        <p className="text-sm">
          Aplikasi ini dikembangkan dengan dedikasi untuk memajukan dunia pendidikan melalui teknologi.
          Setiap baris kode ditulis dengan harapan untuk memberikan dampak positif bagi para guru, siswa, dan orang tua.
        </p>
      </div>
    </div>
  );
}
