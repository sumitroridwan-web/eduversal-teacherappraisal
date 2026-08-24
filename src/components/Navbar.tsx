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
import { useLanguage } from '../i18n/LanguageContext';
import { LANGUAGES } from '../i18n/translations';
import { routeToHash, NEW_OBSERVATION } from '../services/routing';

interface NavbarProps {
  currentView: 'FORM' | 'LIST' | 'ANALYTICS' | 'REPORT' | 'SCHOOL_REPORT' | 'WALKTHROUGH';
  /**
   * Which observation the Active Sheet link opens. Every destination in this
   * bar is a real address so the browser can open it in a tab of its own -
   * an appraiser reading a report beside the sheet they are filling in - and
   * this is the one that needs to know which record it is pointing at.
   */
  activeAppraisalId?: string;
  onOpenRubrics: () => void;
  hasActiveRecord: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  activeAppraisalId,
  onOpenRubrics,
  hasActiveRecord,
}) => {
  const { language, setLanguage, t } = useLanguage();

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
            <a
              href={routeToHash({ view: 'LIST' })}
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
                  {t('nav.tagline')}
                </p>
              </div>
            </a>

            {/* Desktop / Tablet Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200 text-xs">
              <a
                id="nav-btn-list"
                href={routeToHash({ view: 'LIST' })}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  currentView === 'LIST'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{t('nav.portfolio')}</span>
              </a>

              <a
                id="nav-btn-form"
                href={routeToHash({ view: 'FORM', appraisalId: activeAppraisalId })}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  currentView === 'FORM' || currentView === 'REPORT'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('nav.activeSheet')}</span>
              </a>

              <a
                id="nav-btn-analytics"
                href={routeToHash({ view: 'ANALYTICS' })}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  currentView === 'ANALYTICS'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>{t('nav.overview')}</span>
              </a>

              <a
                id="nav-btn-school-report"
                href={routeToHash({ view: 'SCHOOL_REPORT' })}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  currentView === 'SCHOOL_REPORT'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{t('nav.schoolReport')}</span>
              </a>

              <a
                id="nav-btn-walkthrough"
                href={routeToHash({ view: 'WALKTHROUGH' })}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  currentView === 'WALKTHROUGH'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>{t('nav.walkthrough')}</span>
              </a>
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
                <span className="hidden sm:inline">{t('nav.rubrics')}</span>
              </button>

              <a
                id="nav-btn-new"
                href={routeToHash({ view: 'FORM', appraisalId: NEW_OBSERVATION })}
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden xs:inline">{t('nav.new')}</span>
                <span className="xs:hidden">{t('nav.newShort')}</span>
              </a>

              {/* Language switcher */}
              <div
                className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs"
                role="group"
                aria-label={t('nav.language')}
              >
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => setLanguage(lang.code)}
                    title={lang.label}
                    aria-pressed={language === lang.code}
                    className={`px-2 py-1.5 text-[11px] font-bold transition cursor-pointer ${
                      language === lang.code
                        ? 'bg-[#165963] text-white'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    {lang.short}
                  </button>
                ))}
              </div>

              {/* Lock the platform again (ends the session) */}
              <button
                id="nav-btn-lock"
                type="button"
                onClick={handleLock}
                className="flex items-center justify-center p-1.5 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 rounded-lg border border-slate-200 transition cursor-pointer shadow-2xs"
                title={t('nav.lock')}
                aria-label={t('nav.lock')}
              >
                <Lock className="w-3.5 h-3.5" />
              </button>

              {/* Appraiser Avatar */}
              <div className="hidden lg:flex items-center gap-2.5 border-l pl-3 border-slate-200">
                <div className="text-right leading-tight">
                  <p className="text-xs font-semibold text-slate-800">{t('nav.appraiser')}</p>
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
        <a
          href={routeToHash({ view: 'LIST' })}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl font-medium transition cursor-pointer min-h-[44px] min-w-[60px] ${
            currentView === 'LIST'
              ? 'text-indigo-600 font-bold bg-indigo-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <FileSpreadsheet className="w-5 h-5 mb-0.5" />
          <span>{t('nav.mobile.portfolio')}</span>
        </a>

        <a
          href={routeToHash({ view: 'FORM', appraisalId: activeAppraisalId })}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl font-medium transition cursor-pointer min-h-[44px] min-w-[60px] ${
            currentView === 'FORM' || currentView === 'REPORT'
              ? 'text-indigo-600 font-bold bg-indigo-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-5 h-5 mb-0.5" />
          <span>{t('nav.mobile.observe')}</span>
        </a>

        <a
          href={routeToHash({ view: 'ANALYTICS' })}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl font-medium transition cursor-pointer min-h-[44px] min-w-[60px] ${
            currentView === 'ANALYTICS'
              ? 'text-indigo-600 font-bold bg-indigo-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="w-5 h-5 mb-0.5" />
          <span>{t('nav.mobile.analytics')}</span>
        </a>

        <a
          href={routeToHash({ view: 'SCHOOL_REPORT' })}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl font-medium transition cursor-pointer min-h-[44px] min-w-[60px] ${
            currentView === 'SCHOOL_REPORT'
              ? 'text-indigo-600 font-bold bg-indigo-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <FileText className="w-5 h-5 mb-0.5" />
          <span>{t('nav.mobile.report')}</span>
        </a>

        <a
          href={routeToHash({ view: 'WALKTHROUGH' })}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl font-medium transition cursor-pointer min-h-[44px] min-w-[60px] ${
            currentView === 'WALKTHROUGH'
              ? 'text-indigo-600 font-bold bg-indigo-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <ClipboardCheck className="w-5 h-5 mb-0.5" />
          <span>{t('nav.mobile.walkthrough')}</span>
        </a>

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

