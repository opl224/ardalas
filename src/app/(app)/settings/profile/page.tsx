"use client";

import ProfileCard from '@/components/ui/ProfileCard';
import '@/components/ui/ProfileCard.css';

export default function AboutMePage() {
  return (
    <div className="space-y-8 flex flex-col items-center">
      <div className="flex justify-center items-center pt-8">
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
      <div className="text-center text-muted-foreground max-w-lg">
        <p className="text-sm">
          Aplikasi ini dikembangkan dengan dedikasi untuk memajukan dunia pendidikan melalui teknologi.
          Setiap baris kode ditulis dengan harapan untuk memberikan dampak positif bagi para guru, siswa, dan orang tua.
        </p>
      </div>
    </div>
  );
}
