import React from 'react';
import { scrollToSection } from '../hooks/useScrollSpy';

export interface JumpLink {
  id: string;
  label: string;
}

interface ReportJumpBarProps {
  links: JumpLink[];
  activeId: string | null;
  /** Actions shown at the start of the bar, before the links. */
  leading?: React.ReactNode;
  /** Actions shown at the end of the bar. */
  trailing?: React.ReactNode;
}

/**
 * The bar that stays at the top of a report while it is read: its actions,
 * and a link to every section with the one on screen highlighted. Hidden when
 * printing, so it never reaches paper or the PDF.
 */
export const ReportJumpBar: React.FC<ReportJumpBarProps> = ({ links, activeId, leading, trailing }) => (
  <div className="sticky top-14 sm:top-16 z-20 print:hidden">
    <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-sm px-2 py-2 flex flex-col lg:flex-row lg:items-center gap-2">
      {leading && <div className="flex items-center gap-2 shrink-0">{leading}</div>}

      <nav aria-label="Report sections" className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
        <ol className="flex items-center gap-1 whitespace-nowrap">
          {links.map((link) => {
            // Before the reader has scrolled, the first section is the one on screen.
            const active = (activeId ?? links[0]?.id) === link.id;
            return (
              <li key={link.id}>
                <a
                  href={`#${link.id}`}
                  onClick={(e) => {
                    // The app routes on the hash, so the link must not change it.
                    e.preventDefault();
                    scrollToSection(link.id);
                  }}
                  aria-current={active ? 'location' : undefined}
                  className={`inline-block px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    active ? 'bg-[#165963] text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {link.label}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      {trailing && <div className="flex items-center gap-2 shrink-0">{trailing}</div>}
    </div>
  </div>
);
