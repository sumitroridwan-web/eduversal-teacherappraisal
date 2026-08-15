import React, { useState } from 'react';
import { X, Search, BookOpen, Filter, CheckCircle2, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';
import { PRIMARY_SECONDARY_F2_ITEMS, EARLY_YEARS_F2_ITEMS } from '../data/frameworkRubrics';
import { CareerLevel, AppraisalItem } from '../types';
import { EduversalLogo } from './EduversalLogo';

interface RubricReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLevel?: CareerLevel;
}

export const RubricReferenceModal: React.FC<RubricReferenceModalProps> = ({
  isOpen,
  onClose,
  currentLevel = 'Proficient',
}) => {
  const [selectedLevel, setSelectedLevel] = useState<CareerLevel>(currentLevel);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string>('All');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  if (!isOpen) return null;

  const rawItems = selectedLevel === 'EarlyYears' ? EARLY_YEARS_F2_ITEMS : PRIMARY_SECONDARY_F2_ITEMS;
  
  // Filter by level visibility
  const levelItems = selectedLevel === 'EarlyYears'
    ? rawItems
    : rawItems.filter((i) => i.visibleFrom.includes(selectedLevel));

  // Get unique domains
  const domains = ['All', ...Array.from(new Set(levelItems.map((i) => i.domainId)))];

  // Filter by query and domain
  const filteredItems = levelItems.filter((item) => {
    const matchesDomain = selectedDomain === 'All' || item.domainId === selectedDomain;
    const q = searchQuery.toLowerCase();
    const matchesQuery =
      !searchQuery ||
      item.id.toLowerCase().includes(q) ||
      item.title.toLowerCase().includes(q) ||
      item.coachingFocus.toLowerCase().includes(q) ||
      (item.theoryBasis && item.theoryBasis.toLowerCase().includes(q)) ||
      Object.values(item.descriptors).some((d) => d.toLowerCase().includes(q));

    return matchesDomain && matchesQuery;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border border-slate-200 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden my-6 max-h-[92vh] flex flex-col text-slate-800">
        {/* Header */}
        <div className="bg-slate-50 p-6 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="p-1 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <EduversalLogo variant="icon" size={32} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Framework 2 Rubric &amp; Descriptors Reference
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                  Eduversal v2.1
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Official 4-point rating scales (1: Unsatisfactory, 2: Basic, 3: Proficient, 4: Distinguished) and Glow/Grow/Go prompts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-700 flex items-center justify-center border border-slate-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters Bar */}
        <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          {/* Level Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            {(['Induction', 'Developing', 'Proficient', 'Lead', 'EarlyYears'] as CareerLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setSelectedLevel(lvl)}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  selectedLevel === lvl
                    ? 'bg-white text-indigo-600 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lvl === 'EarlyYears' ? 'Early Years (EY)' : lvl}
              </button>
            ))}
          </div>

          {/* Search & Domain Filter */}
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search indicator code, title, rubric text..."
                className="w-full bg-white text-slate-900 text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              />
            </div>
            <select
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
              className="bg-white text-slate-900 text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            >
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Indicators List */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="text-xs text-slate-500 mb-2">
            Showing <strong className="text-slate-800">{filteredItems.length}</strong> assessed indicators for{' '}
            <strong className="text-indigo-600">{selectedLevel} Level</strong>
          </div>

          {filteredItems.map((item) => {
            const isExpanded = expandedItemId === item.id;
            return (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden transition hover:border-slate-300 shadow-2xs"
              >
                {/* Header Row */}
                <div
                  onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                  className="p-4 flex items-center justify-between gap-4 cursor-pointer select-none hover:bg-slate-50/80"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
                      {item.id}
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        {item.title}
                        {item.theoryBasis && (
                          <span className="text-[10px] font-normal text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                            {item.theoryBasis}
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="text-slate-400">{item.domainId}</span> •{' '}
                        <span className="text-emerald-700 font-medium">Coaching: {item.coachingFocus}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 hidden sm:inline">
                      Section {item.section === 'A' ? 'A (Pre-Visit)' : item.section === 'B' ? 'B (Live Obs)' : 'C (Post-Lesson)'}
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Rubric Grid & Coaching Prompts */}
                {isExpanded && (
                  <div className="p-4 pt-0 border-t border-slate-100 mt-2 space-y-4">
                    {/* 4 Levels Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                      {/* Level 4 */}
                      <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-xs font-bold text-emerald-800 mb-1.5 pb-1 border-b border-emerald-200">
                            <span>4 — Distinguished</span>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed">{item.descriptors[4]}</p>
                        </div>
                      </div>

                      {/* Level 3 */}
                      <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-xs font-bold text-indigo-800 mb-1.5 pb-1 border-b border-indigo-200">
                            <span>3 — Proficient</span>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed">{item.descriptors[3]}</p>
                        </div>
                      </div>

                      {/* Level 2 */}
                      <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-xs font-bold text-amber-800 mb-1.5 pb-1 border-b border-amber-200">
                            <span>2 — Basic</span>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed">{item.descriptors[2]}</p>
                        </div>
                      </div>

                      {/* Level 1 */}
                      <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-xs font-bold text-rose-800 mb-1.5 pb-1 border-b border-rose-200">
                            <span>1 — Unsatisfactory</span>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed">{item.descriptors[1]}</p>
                        </div>
                      </div>
                    </div>

                    {/* Guided Grow / Go Coaching Prompts */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                      <div>
                        <span className="font-semibold text-amber-800 block mb-1">Grow Reflective Question:</span>
                        <p className="text-slate-700 italic">&ldquo;{item.growPrompt}&rdquo;</p>
                      </div>
                      <div>
                        <span className="font-semibold text-indigo-800 block mb-1">Go Concrete Action:</span>
                        <p className="text-slate-700">{item.goPrompt}</p>
                      </div>
                      <div>
                        <span className="font-semibold text-emerald-800 block mb-1">Follow-Up Observable Indicator:</span>
                        <p className="text-slate-700">{item.followUpIndicators}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Eduversal Teacher Appraisal Framework v2.1 • Charlotte Danielson FfT &amp; Robert Marzano</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium transition cursor-pointer shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
