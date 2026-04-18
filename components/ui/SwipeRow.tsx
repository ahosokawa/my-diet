"use client";

import { animate, motion, useMotionValue, type PanInfo } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

const REVEAL = 88;

type Props = {
  children: ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
  className?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SwipeRow({
  children,
  onDelete,
  deleteLabel = "Delete",
  className = "",
  open,
  onOpenChange,
}: Props) {
  const x = useMotionValue(0);
  const dragging = useRef(false);

  useEffect(() => {
    animate(x, open ? -REVEAL : 0, { type: "spring", stiffness: 400, damping: 40 });
  }, [open, x]);

  function handleDragEnd(_: unknown, info: PanInfo) {
    dragging.current = false;
    const shouldOpen =
      info.offset.x < -REVEAL / 2 || info.velocity.x < -300;
    onOpenChange(shouldOpen);
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-danger text-sm font-semibold text-white active:bg-danger-strong"
        style={{ width: REVEAL }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
      >
        {deleteLabel}
      </button>
      <motion.div
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -REVEAL, right: 0 }}
        dragElastic={{ left: 0.08, right: 0 }}
        onDragStart={() => {
          dragging.current = true;
        }}
        onDragEnd={handleDragEnd}
        onClickCapture={(e) => {
          if (dragging.current) {
            e.stopPropagation();
            e.preventDefault();
            return;
          }
          if (open) {
            e.stopPropagation();
            e.preventDefault();
            onOpenChange(false);
          }
        }}
        className="relative bg-surface-2"
      >
        {children}
      </motion.div>
    </div>
  );
}
