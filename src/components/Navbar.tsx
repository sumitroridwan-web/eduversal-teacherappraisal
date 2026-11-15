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
                  <span className="text-[11px] sm:text-[11px] font-bold px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200 shrink-0">
                    v2.1
                  </span>
                </div>
                <p className="text-[11px] sm:text-[11px] text-slate-500 leading-none truncate hidden sm:block">
                  {t('nav.tagline')}
                </p>
              </div>
            </a>

            {/* Desktop / Tablet Navigation Links */}
            {/* Tablet only: on wider screens these move to the sidebar. */}
            <nav className="hidden md:flex lg:hidden items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200 text-xs">
              <a
                href={routeToHash({ view: 'LIST' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                  currentView === 'LIST'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <span>{t('nav.mobile.portfolio')}</span>
              </a>

              <a
                href={routeToHash({ view: 'FORM', appraisalId: activeAppraisalId })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                  currentView === 'FORM' || currentView === 'REPORT'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <span>{t('nav.mobile.observe')}</span>
              </a>

              <a
                href={routeToHash({ view: 'ANALYTICS' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                  currentView === 'ANALYTICS'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <span>{t('nav.mobile.analytics')}</span>
              </a>

              <a
                href={routeToHash({ view: 'SCHOOL_REPORT' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                  currentView === 'SCHOOL_REPORT'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <span>{t('nav.schoolReport')}</span>
              </a>

              <a
                href={routeToHash({ view: 'WALKTHROUGH' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                  currentView === 'WALKTHROUGH'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
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
                <span className="hidden sm:inline md:hidden lg:inline">{t('nav.rubrics')}</span>
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
                  <p className="text-[11px] text-slate-400 font-medium">EDUVERSAL</p>
                </div>
                <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs border border-indigo-200">
                  QA
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar on wide screens, in two groups: the work of observing, and
          what the observations add up to. Compact icons up to 1536px, with
          labels beside them above that. */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-16 bottom-0 z-20 w-24 2xl:w-60 bg-white border-r border-slate-200 py-4 overflow-y-auto print:hidden">
        <SidebarGroup label={t('nav.group.work')} />
        <SidebarLink
          id="nav-btn-list"
          href={routeToHash({ view: 'LIST' })}
          active={currentView === 'LIST'}
          icon={FileSpreadsheet}
          short={t('nav.mobile.portfolio')}
          full={t('nav.portfolio')}
        />
        <SidebarLink
          id="nav-btn-form"
          href={routeToHash({ view: 'FORM', appraisalId: activeAppraisalId })}
          active={currentView === 'FORM' || currentView === 'REPORT'}
          icon={ShieldCheck}
          short={t('nav.mobile.observe')}
          full={t('nav.activeSheet')}
        />
        <SidebarLink
          href={routeToHash({ view: 'FORM', appraisalId: NEW_OBSERVATION })}
          active={false}
          icon={Plus}
          short={t('nav.newShort')}
          full={t('nav.new')}
        />
        <SidebarLink
          id="nav-btn-walkthrough"
          href={routeToHash({ view: 'WALKTHROUGH' })}
          active={currentView === 'WALKTHROUGH'}
          icon={ClipboardCheck}
          short={t('nav.walkthrough')}
          full={t('nav.walkthrough')}
        />

        <SidebarGroup label={t('nav.group.insights')} />
        <SidebarLink
          id="nav-btn-analytics"
          href={routeToHash({ view: 'ANALYTICS' })}
          active={currentView === 'ANALYTICS'}
          icon={BarChart3}
          short={t('nav.mobile.analytics')}
          full={t('nav.overview')}
        />
        <SidebarLink
          id="nav-btn-school-report"
          href={routeToHash({ view: 'SCHOOL_REPORT' })}
          active={currentView === 'SCHOOL_REPORT'}
          icon={FileText}
          short={t('nav.schoolReport')}
          full={t('nav.schoolReport')}
        />
      </aside>

      {/* Mobile Bottom Floating Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 shadow-lg flex items-center justify-around text-[11px] print:hidden">
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


function SidebarGroup({ label }: { label: string }) {
  return (
    <div className="px-3 pt-3 pb-1 first:pt-0">
      <p className="hidden 2xl:block px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="2xl:hidden text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function SidebarLink({
  id,
  href,
  active,
  icon: Icon,
  short,
  full,
}: {
  id?: string;
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  short: string;
  full: string;
}) {
  return (
    <a
      id={id}
      href={href}
      title={full}
      aria-current={active ? 'page' : undefined}
      className={`mx-2 my-0.5 flex flex-col 2xl:flex-row items-center gap-1 2xl:gap-3 px-2 2xl:px-3 py-2.5 rounded-xl transition cursor-pointer ${
        active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span className="2xl:hidden text-xs font-semibold text-center leading-tight">{short}</span>
      <span className="hidden 2xl:inline text-sm font-semibold">{full}</span>
    </a>
  );
}
