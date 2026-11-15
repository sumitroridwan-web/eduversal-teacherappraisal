import React from 'react';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  /** Omitted for the page being shown. */
  href?: string;
}

/** Where this page sits, with every step back one tap away. */
export const Breadcrumbs: React.FC<{ items: Crumb[] }> = ({ items }) => (
  <nav aria-label="Breadcrumb" className="mb-4 print:hidden">
    <ol className="flex flex-wrap items-center gap-1 text-sm">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <li key={i} className="flex items-center gap-1 min-w-0">
            {item.href && !last ? (
              <a href={item.href} className="font-semibold text-indigo-700 hover:text-indigo-900 hover:underline truncate max-w-[16rem]">
                {item.label}
              </a>
            ) : (
              <span className={`truncate max-w-[16rem] ${last ? 'font-semibold text-slate-900' : 'text-slate-600'}`} aria-current={last ? 'page' : undefined}>
                {item.label}
              </span>
            )}
            {!last && <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
          </li>
        );
      })}
    </ol>
  </nav>
);
