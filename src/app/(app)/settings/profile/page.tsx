"use client";

import ProfileCard from '@/components/ui/ProfileCard';
import '@/components/ui/ProfileCard.css';
import CircularText from '@/components/ui/CircularText';
import '@/components/ui/CircularText.css';

export default function AboutMePage() {
  return (
    <div className="space-y-8 flex flex-col items-center">
      <div className="relative flex justify-center items-center pt-8">
         <div className="absolute -top-4 -right-12 z-10 opacity-50 scale-75">
            <CircularText
              text="NOVAL-FIRDAUS-NOVAL-FIRDAUS-"
              onHover="speedUp"
              spinDuration={30}
              radius={80}
            />
          </div>
        <ProfileCard
            name="Noval Firdaus"
            title="Developer Pemula"
            handle="opank"
            status="Online"
            contactText="Hubungi Saya"
            avatarUrl="/avatars/opank1.png"
            showUserInfo={true}
            enableTilt={true}
            onContactClick={() => window.location.href = 'mailto:opank2441@gmail.com'}
        />
      </div>
       <div className="text-center max-w-lg">
        <p className="text-sm">
          "Setiap baris kode adalah langkah kecil menuju perubahan besar dalam pendidikan."
        </p>
      </div>
    </div>
  );
}
