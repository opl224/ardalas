
import type { ReactNode } from 'react';
import ParticlesBackground from '@/components/effects/ParticlesBackground';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background p-4 overflow-hidden">
      <ParticlesBackground className="absolute inset-0 z-0 pointer-events-none opacity-50" />
      <div className="relative z-10 w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
