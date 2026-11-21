"use client";

import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Detent = "auto" | "medium" | "large";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  detent?: Detent;
};

const DETENT_CLASS: Record<Detent, string> = {
  auto: "h-auto",
  medium: "h-[55dvh]",
  large: "h-[88dvh]",
};

export function Sheet({ open, onClose, title, children, footer, detent = "large" }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const frame = viewportRef.current;
    const body = bodyRef.current;
    if (!open || !viewport || !frame || !body) return;

    let animationFrame = 0;
    const update = () => {
      animationFrame = 0;

      // The keyboard can shrink and pan the visible area without changing dvh.
      // Let the browser handle pinch zoom without resizing the sheet itself.
      const zoomed = viewport.scale !== 1;
      frame.style.top = zoomed ? "" : `${viewport.offsetTop}px`;
      frame.style.height = zoomed ? "" : `${viewport.height}px`;
      if (zoomed) return;

      const focused = document.activeElement;
      if (!focused || !body.contains(focused)) return;

      // Reveal the focused control by scrolling only the sheet body.
      const field = focused.getBoundingClientRect();
      const visible = body.getBoundingClientRect();
      if (field.top < visible.top) {
        body.scrollTop += field.top - visible.top;
      } else if (field.bottom > visible.bottom) {
        body.scrollTop += field.bottom - visible.bottom;
      }
    };

    function scheduleUpdate() {
      if (!animationFrame) animationFrame = requestAnimationFrame(update);
    }

    update();
    viewport.addEventListener("resize", scheduleUpdate);
    viewport.addEventListener("scroll", scheduleUpdate);
    body.addEventListener("focusin", scheduleUpdate);
    return () => {
      cancelAnimationFrame(animationFrame);
      viewport.removeEventListener("resize", scheduleUpdate);
      viewport.removeEventListener("scroll", scheduleUpdate);
      body.removeEventListener("focusin", scheduleUpdate);
    };
  }, [open]);

  // Keep the latest onClose in a ref so the focus-management effect below only
  // re-runs on open/close transitions. Inline onClose props change identity on
  // every parent render; with onClose in the deps the cleanup would run per
  // keystroke and yank focus out of whichever input is being typed into.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab") {
        // Keep Tab cycling within the sheet while it's modal.
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!active || !panel.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);

    // Move focus into the sheet on open; restore it to the opener on close.
    // Focus the panel itself (not the first control) so text inputs don't pop
    // the on-screen keyboard uninvited; autoFocus children still win.
    const opener = document.activeElement as HTMLElement | null;
    const focusTimer = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      panel.focus({ preventScroll: true });
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(focusTimer);
      opener?.focus({ preventScroll: true });
    };
  }, [open]);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 80 || info.velocity.y > 500) onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={viewportRef}
          className="fixed inset-x-0 top-0 z-40 mx-auto flex h-full max-w-md flex-col justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            aria-label="Close"
            tabIndex={-1}
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={`relative flex ${DETENT_CLASS[detent]} max-h-[min(88dvh,calc(100%_-_env(safe-area-inset-top)))] flex-col rounded-t-3xl bg-surface-2 shadow-[0_-8px_32px_rgba(0,0,0,0.18)] outline-none`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={onDragEnd}
          >
            <div className="flex shrink-0 justify-center pt-2">
              <div className="h-1.5 w-10 rounded-full bg-fg-3/40" />
            </div>
            {title ? (
              <div className="shrink-0 px-5 pb-2 pt-3">
                <h2 className="text-lg font-semibold">{title}</h2>
              </div>
            ) : (
              <div className="shrink-0 pt-3" />
            )}
            <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
              {children}
            </div>
            {footer ? (
              <div
                className="shrink-0 border-t border-hairline bg-surface-2 px-5 pt-3"
                style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
              >
                {footer}
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
