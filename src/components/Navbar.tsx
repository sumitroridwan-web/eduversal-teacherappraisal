import React from 'react';
import {
  FileSpreadsheet,
  BarChart3,
  BookOpen,
  Plus,
  ShieldCheck,
  Award,
  Lock,
  FileText,
  ClipboardCheck,
} from 'lucide-react';
import { EduversalLogo } from './EduversalLogo';

interface NavbarProps {
  currentView: 'FORM' | 'LIST' | 'ANALYTICS' | 'REPORT' | 'SCHOOL_REPORT' | 'WALKTHROUGH';
  onChangeView: (view: 'FORM' | 'LIST' | 'ANALYTICS' | 'SCHOOL_REPORT' | 'WALKTHROUGH') => void;
  onNewAppraisal: () => void;
  onOpenRubrics: () => void;
  hasActiveRecord: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onChangeView,
  onNewAppraisal,
  onOpenRubrics,
  hasActiveRecord,
}) => {
  // Ends the server session and returns to the password screen.
  const handleLock = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.reload();
    }
  };

  return (
    <>
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 text-slate-800 shadow-xs print:hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">
            {/* Logo & School Branding */}
            <div
              onClick={() => onChangeView('LIST')}
              className="flex items-center gap-2.5 sm:gap-3.5 cursor-pointer select-none group min-w-0"
            >
              <div className="p-1 rounded-xl bg-slate-50 border border-slate-200/80 shadow-2xs group-hover:border-teal-300 transition shrink-0">
                <EduversalLogo variant="icon" size={30} className="sm:w-[34px] sm:h-[34px]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight group-hover:text-[#165963] transition truncate flex items-center gap-1">
                    <span>EDUVERSAL</span>
                    <span className="text-slate-400 font-normal text-[11px] sm:text-xs hidden xs:inline">| F2 Appraisal</span>
                  </h1>
                  <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200 shrink-0">
                    v2.1
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 leading-none truncate hidden sm:block">
                  Teacher Appraisal &amp; AI Pedagogical Coaching
                </p>
              </div>
            </div>

            {/* Desktop / Tablet Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                id="nav-btn-list"
                type="button"
                onClick={() => onChangeView('LIST')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  currentView === 'LIST'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Observations Portfolio</span>
              </button>

              <button
                id="nav-btn-form"
                type="button"
                onClick={() => onChangeView('FORM')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  currentView === 'FORM' || currentView === 'REPORT'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Active Observation Sheet</span>
              </button>

              <button
                id="nav-btn-analytics"
                type="button"
                onClick={() => onChangeView('ANALYTICS')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  currentView === 'ANALYTICS'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Overview &amp; School Levels</span>
              </button>

              <button
                id="nav-btn-school-report"
                type="button"
                onClick={() => onChangeView('SCHOOL_REPORT')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  currentView === 'SCHOOL_REPORT'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>School Report</span>
              </button>

              <button
                id="nav-btn-walkthrough"
                type="button"
                onClick={() => onChangeView('WALKTHROUGH')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  currentView === 'WALKTHROUGH'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>Walkthrough</span>
              </button>
            </nav>

            {/* Right Action Tools & CTAs */}
            <div className="flex items-center gap-1.5 sm:gap-2.5">
              <button
                id="nav-btn-rubrics"
                type="button"
                onClick={onOpenRubrics}
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition cursor-pointer shadow-2xs"
                title="Official Framework 2 Rubrics Handbook & Descriptors"
              >
                <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Rubrics</span>
              </button>

              <button
                id="nav-btn-new"
                type="button"
                onClick={onNewAppraisal}
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden xs:inline">New Observation</span>
                <span className="xs:hidden">New</span>
              </button>

              {/* Lock the platform again (ends the session) */}
              <button
                id="nav-btn-lock"
                type="button"
                onClick={handleLock}
                className="flex items-center justify-center p-1.5 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 rounded-lg border border-slate-200 transition cursor-pointer shadow-2xs"
                title="Lock platform and sign out"
                aria-label="Lock platform and sign out"
              >
                <Lock className="w-3.5 h-3.5" />
              </button>

              {/* Appraiser Avatar */}
              <div className="hidden lg:flex items-center gap-2.5 border-l pl-3 border-slate-200">
                <div className="text-right leading-tight">
                  <p className="text-xs font-semibold text-slate-800">QA Appraiser</p>
                  <p className="text-[10px] text-slate-400 font-medium">EDUVERSAL</p>
                </div>
                <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs border border-indigo-200">
                  QA
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Floating Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 shadow-lg flex items-center justify-around text-[10px] print:hidden">
        <button
          type="button"
          onClick={() => onChangeView('LIST')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl font-medium transition cursor-pointer min-h-[44px] min-w-[60px] ${
            currentView === 'LIST'
              ? 'text-indigo-600 font-bold bg-indigo-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <FileSpreadsheet className="w-5 h-5 mb-0.5" />
          <span>Portfolio</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeView('FORM')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl font-medium transition cursor-pointer min-h-[44px] min-w-[60px] ${
            currentView === 'FORM' || currentView === 'REPORT'
              ? 'text-indigo-600 font-bold bg-indigo-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-5 h-5 mb-0.5" />
          <span>Observe</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeView('ANALYTICS')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl font-medium transition cursor-pointer min-h-[44px] min-w-[60px] ${
            currentView === 'ANALYTICS'
              ? 'text-indigo-600 font-bold bg-indigo-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="w-5 h-5 mb-0.5" />
          <span>Analytics</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeView('SCHOOL_REPORT')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl font-medium transition cursor-pointer min-h-[44px] min-w-[60px] ${
            currentView === 'SCHOOL_REPORT'
              ? 'text-indigo-600 font-bold bg-indigo-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <FileText className="w-5 h-5 mb-0.5" />
          <span>Report</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeView('WALKTHROUGH')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl font-medium transition cursor-pointer min-h-[44px] min-w-[60px] ${
            currentView === 'WALKTHROUGH'
              ? 'text-indigo-600 font-bold bg-indigo-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <ClipboardCheck className="w-5 h-5 mb-0.5" />
          <span>Walk</span>
        </button>

        <button
          type="button"
          onClick={onOpenRubrics}
          className="flex flex-col items-center justify-center py-1 px-3 rounded-xl font-medium text-slate-500 hover:text-slate-900 transition cursor-pointer min-h-[44px] min-w-[60px]"
        >
          <BookOpen className="w-5 h-5 mb-0.5 text-indigo-600" />
          <span>Rubrics</span>
        </button>
      </nav>
    </>
  );
};

