import { useEffect, useState } from 'react';

/**
 * Which of the given sections is being read: of those crossing the upper part
 * of the screen, the one that starts highest. Returns null until the browser
 * reports, and stays null where IntersectionObserver is unavailable (tests).
 */
export function useScrollSpy(ids: string[], topOffset = 140): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('|');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<HTMLElement>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) =>
          entry.isIntersecting
            ? visible.add(entry.target as HTMLElement)
            : visible.delete(entry.target as HTMLElement)
        );
        let best: HTMLElement | null = null;
        visible.forEach((el) => {
          if (!best || el.getBoundingClientRect().top < best.getBoundingClientRect().top) best = el;
        });
        if (best) setActive((best as HTMLElement).id);
      },
      { rootMargin: `-${topOffset}px 0px -55% 0px` }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [key, topOffset]);

  return active;
}

/** Scrolls a section into view below the sticky bars. */
export function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
