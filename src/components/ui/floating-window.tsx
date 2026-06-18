
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, PanInfo, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface FloatingWindowProps {
  title: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  children: React.ReactNode;
  initialSize?: { width: number; height: number };
}

export function FloatingWindow({
  title,
  isOpen,
  onOpenChange,
  children,
  initialSize = { width: 500, height: 400 },
}: FloatingWindowProps) {
  const constraintsRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(initialSize.height);
  const dragControls = useDragControls();

  useEffect(() => {
    const viewportHeight = window.innerHeight;
    if (initialSize.height > viewportHeight - 40) {
      setHeight(viewportHeight - 40);
    }
  }, [initialSize.height]);

  if (!isOpen) return null;

  const handleResize = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const newHeight = height + info.delta.y;
    const minHeight = 200;
    const maxHeight = window.innerHeight - 40;
    setHeight(Math.max(minHeight, Math.min(newHeight, maxHeight)));
  };

  return (
    <div
      ref={constraintsRef}
      className="fixed inset-0 z-50 pointer-events-none"
    >
      <motion.div
        drag
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={constraintsRef}
        style={{ width: initialSize.width, height }}
        className="absolute top-1/4 left-1/4 bg-card rounded-lg border shadow-2xl flex flex-col pointer-events-auto"
      >
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="flex items-center justify-between p-3 border-b cursor-grab active:cursor-grabbing"
        >
          <h3 className="font-semibold text-sm">{title}</h3>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-grow p-0 overflow-hidden min-h-0">
            {children}
        </div>
        
        <motion.div
            onPan={handleResize}
            className="w-full h-2 cursor-ns-resize flex items-center justify-center"
        >
            <div className="w-8 h-1 bg-muted-foreground/50 rounded-full" />
        </motion.div>
      </motion.div>
    </div>
  );
}
