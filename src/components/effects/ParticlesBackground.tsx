
"use client";

import React, { useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

interface ParticlesBackgroundProps {
  className?: string;
  particleColor?: string;
  lineColor?: string;
  particleCount?: number;
  minSpeed?: number;
  maxSpeed?: number;
  minRadius?: number;
  maxRadius?: number;
  lineDistance?: number;
}

const ParticlesBackground: React.FC<ParticlesBackgroundProps> = ({
  className,
  particleColor = 'rgba(100, 149, 237, 0.6)', // Theme primary: CornflowerBlue with alpha
  lineColor = 'rgba(100, 149, 237, 0.25)',  // Lighter/more transparent for lines
  particleCount = 60,
  minSpeed = 0.05,
  maxSpeed = 0.3,
  minRadius = 0.5,
  maxRadius = 2.5,
  lineDistance = 130,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesArray = useRef<Particle[]>([]);
  const animationFrameId = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null); // Ref for the container div

  const createParticles = useCallback((currentCanvas: HTMLCanvasElement) => {
    particlesArray.current = [];
    const width = currentCanvas.width;
    const height = currentCanvas.height;

    for (let i = 0; i < particleCount; i++) {
      const radius = Math.random() * (maxRadius - minRadius) + minRadius;
      const x = Math.random() * (width - radius * 2) + radius;
      const y = Math.random() * (height - radius * 2) + radius;
      const speed = Math.random() * (maxSpeed - minSpeed) + minSpeed;
      const direction = Math.random() * Math.PI * 2;
      const vx = Math.cos(direction) * speed;
      const vy = Math.sin(direction) * speed;

      particlesArray.current.push({ x, y, vx, vy, radius, color: particleColor });
    }
  }, [particleCount, minRadius, maxRadius, minSpeed, maxSpeed, particleColor]);

  const drawParticles = useCallback((ctx: CanvasRenderingContext2D, currentCanvas: HTMLCanvasElement) => {
    ctx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);
    particlesArray.current.forEach(particle => {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2, false);
      ctx.fillStyle = particle.color;
      ctx.fill();
    });
  }, []);

  const connectParticles = useCallback((ctx: CanvasRenderingContext2D) => {
    for (let i = 0; i < particlesArray.current.length; i++) {
      for (let j = i + 1; j < particlesArray.current.length; j++) {
        const dx = particlesArray.current[i].x - particlesArray.current[j].x;
        const dy = particlesArray.current[i].y - particlesArray.current[j].y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < lineDistance) {
          ctx.beginPath();
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = 0.3;
          ctx.moveTo(particlesArray.current[i].x, particlesArray.current[i].y);
          ctx.lineTo(particlesArray.current[j].x, particlesArray.current[j].y);
          ctx.stroke();
          ctx.closePath();
        }
      }
    }
  }, [lineColor, lineDistance]);

  const updateParticles = useCallback((currentCanvas: HTMLCanvasElement) => {
    particlesArray.current.forEach(particle => {
      particle.x += particle.vx;
      particle.y += particle.vy;

      if (particle.x + particle.radius > currentCanvas.width || particle.x - particle.radius < 0) {
        particle.vx = -particle.vx;
      }
      if (particle.y + particle.radius > currentCanvas.height || particle.y - particle.radius < 0) {
        particle.vy = -particle.vy;
      }
    });
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawParticles(ctx, canvas);
    connectParticles(ctx);
    updateParticles(canvas);
    animationFrameId.current = requestAnimationFrame(animate);
  }, [drawParticles, connectParticles, updateParticles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const currentContainerRef = containerRef.current;

    if (!canvas || !currentContainerRef) return;

    const setCanvasSize = () => {
      // Use containerRef for dimensions
      canvas.width = currentContainerRef.clientWidth;
      canvas.height = currentContainerRef.clientHeight;
      // Re-create particles only if canvas size has actually changed
      if (particlesArray.current.length === 0 || 
          (particlesArray.current.length > 0 && 
           (particlesArray.current[0].x > canvas.width || particlesArray.current[0].y > canvas.height))) {
        createParticles(canvas);
      }
    };

    setCanvasSize();
    // createParticles is called within setCanvasSize if needed
    animationFrameId.current = requestAnimationFrame(animate);

    const resizeObserver = new ResizeObserver(setCanvasSize);
    resizeObserver.observe(currentContainerRef);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      resizeObserver.disconnect();
    };
  }, [createParticles, animate]);

  return (
    <div ref={containerRef} className={cn('w-full h-full', className)}>
      <canvas
        ref={canvasRef}
        className="w-full h-full" 
      />
    </div>
  );
};

export default ParticlesBackground;
