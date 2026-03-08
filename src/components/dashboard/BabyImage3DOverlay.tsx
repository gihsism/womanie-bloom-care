import { useRef, useCallback, useState, useEffect } from 'react';

interface BabyImage3DOverlayProps {
  src: string;
  week: number;
  onClose: () => void;
}

const BabyImage3DOverlay = ({ src, week, onClose }: BabyImage3DOverlayProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const autoRotateRef = useRef(true);
  const animFrameRef = useRef<number>(0);
  const angleRef = useRef(0);

  // Auto-rotate gently on mount
  useEffect(() => {
    const animate = () => {
      if (autoRotateRef.current) {
        angleRef.current += 0.3;
        setRotation({
          x: Math.sin(angleRef.current * 0.02) * 8,
          y: Math.cos(angleRef.current * 0.01) * 15,
        });
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    autoRotateRef.current = false;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setRotation(prev => ({
      x: Math.max(-40, Math.min(40, prev.x - dy * 0.4)),
      y: Math.max(-40, Math.min(40, prev.y + dx * 0.4)),
    }));
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-6"
      onClick={onClose}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ perspective: '1000px' }}
    >
      <div
        ref={cardRef}
        className="relative max-w-xs w-full"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        style={{
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
          transformStyle: 'preserve-3d',
          transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        {/* Card with 3D depth */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            boxShadow: `
              ${-rotation.y * 0.8}px ${rotation.x * 0.8}px 30px rgba(0,0,0,0.4),
              0 0 60px rgba(var(--primary), 0.15)
            `,
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Glossy surface */}
          <div
            className="absolute inset-0 z-10 pointer-events-none rounded-2xl"
            style={{
              background: `radial-gradient(circle at ${50 + rotation.y * 1.5}% ${50 - rotation.x * 1.5}%, rgba(255,255,255,0.25) 0%, transparent 60%)`,
            }}
          />

          {/* Image */}
          <img
            src={src}
            alt={`Baby at week ${week}`}
            className="w-full h-auto object-contain select-none"
            draggable={false}
            style={{ transform: 'translateZ(20px)' }}
          />
        </div>

        {/* Floating label */}
        <div
          className="text-center mt-4 text-white font-semibold text-lg drop-shadow-lg select-none"
          style={{ transform: 'translateZ(30px)' }}
        >
          Baby at Week {week}
        </div>

        {/* Drag hint */}
        <div className="text-center mt-1 text-white/50 text-xs select-none">
          Drag to rotate
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-background text-foreground flex items-center justify-center shadow-lg text-sm font-bold z-20"
          style={{ transform: 'translateZ(40px)' }}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default BabyImage3DOverlay;
