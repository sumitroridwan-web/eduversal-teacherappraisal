import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  loadAppraisals,
  saveAppraisals,
  saveOrUpdateAppraisal,
  deleteAppraisal,
  createBlankAppraisal,
  hydrateMedia,
  hydrateAllMedia,
} from './services/storage';
import { TeacherAppraisalRecord, CareerLevel } from './types';
import { flushQueue, pullAndMerge, onSyncConflict, resolveConflict } from './services/sync';
import { carryContext } from './services/observationSheet';
import { Route, parseRoute, routeToHash, NEW_OBSERVATION } from './services/routing';
import { Navbar } from './components/Navbar';
import { AppraisalForm } from './components/AppraisalForm';
import { AppraisalList } from './components/AppraisalList';
import { OverviewAnalytics } from './components/OverviewAnalytics';
import { ReportView } from './components/ReportView';
import { SchoolReportView } from './components/SchoolReportView';
import { WalkthroughView } from './components/WalkthroughView';
import { SyncStatusBar } from './components/SyncStatusBar';
import { RubricReferenceModal } from './components/RubricReferenceModal';

export default function App() {
  const [appraisals, setAppraisals] = useState<TeacherAppraisalRecord[]>([]);
  /**
   * An observation that has been started but never saved.
   *
   * It is held here rather than in storage so that opening a new sheet and
   * thinking better of it leaves nothing behind in the portfolio. It is held
   * here rather than inside the form so that walking off to the portfolio and
   * back does not lose what has been typed. Nothing writes it to the device
   * until the appraiser presses Save Draft or Save.
   */
  const [draft, setDraft] = useState<TeacherAppraisalRecord | null>(null);
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [isRubricModalOpen, setIsRubricModalOpen] = useState(false);
  const [rubricLevel, setRubricLevel] = useState<CareerLevel>('Proficient');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  // Load initial appraisals on startup. Which one is open comes from the
  // address, not from whichever happened to be first.
  useEffect(() => {
    setAppraisals(loadAppraisals());
  }, []);

  // Follow the address bar: the Back button, a bookmark and a link opened in
  // a second tab all arrive here.
  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  /**
   * Go to a screen.
   *
   * Every navigation goes through the address so that the view, the Back
   * button and anything the appraiser opened in another tab cannot disagree.
   * `replace` is for corrections that should not become a step of their own -
   * a saved observation taking its real id, which nobody wants to go Back to.
   */
  const navigate = useCallback((next: Route, replace = false) => {
    const hash = routeToHash(next);
    if (replace) {
      window.history.replaceState(null, '', hash);
    } else if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    setRoute(parseRoute(hash));
  }, []);

  const isDraftRoute = route.appraisalId === NEW_OBSERVATION;

  /** The observation on screen: the unsaved draft, or one from the portfolio. */
  const currentAppraisal = useMemo(() => {
    if (!route.appraisalId) return null;
    if (isDraftRoute) return draft;
    return appraisals.find((a) => a.id === route.appraisalId) || null;
  }, [route.appraisalId, isDraftRoute, draft, appraisals]);

  // Opening the address of a new observation is what starts one, so that a
  // link to it works in a second tab as well as from the button.
  useEffect(() => {
    if (route.view !== 'FORM' || !isDraftRoute) return;
    setDraft((prev) => prev || createBlankAppraisal('Proficient'));
  }, [route.view, isDraftRoute]);

  /**
   * What the Active Sheet link points at when nothing is open: the first
   * observation in the portfolio, so the link is never dead.
   */
  const activeAppraisalId = route.appraisalId || appraisals[0]?.id;
  const currentView = route.view;

  /**
   * Snapshots are stored on the device rather than inside the record, so an
   * observation arrives from storage with references and no images. Fill them
   * back in whenever one is opened - the sheet, the report and the PDF export
   * all embed the image itself.
   *
   * hydrateMedia hands back the same record when there is nothing to restore,
   * so this settles after one pass instead of feeding itself.
   */
  useEffect(() => {
    if (!currentAppraisal) return;
    let cancelled = false;

    void (async () => {
      const hydrated = await hydrateMedia(currentAppraisal);
      if (cancelled || hydrated === currentAppraisal) return;
      if (isDraftRoute) {
        setDraft(hydrated);
      } else {
        setAppraisals((prev) => prev.map((a) => (a.id === hydrated.id ? hydrated : a)));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentAppraisal, isDraftRoute]);

  // The school report prints best practice from across the portfolio, so it
  // needs the images of every record rather than just the open one.
  useEffect(() => {
    if (currentView !== 'SCHOOL_REPORT' || appraisals.length === 0) return;
    let cancelled = false;

    void (async () => {
      const hydrated = await hydrateAllMedia(appraisals);
      const changed = hydrated.some((record, i) => record !== appraisals[i]);
      if (!cancelled && changed) setAppraisals(hydrated);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentView, appraisals]);

  // Pull anything other devices have saved, then keep checking while the tab
  // is open. Sixty seconds is frequent enough for an appraisal period and
  // light enough not to interrupt an observation in progress.
  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      await flushQueue();
      const { merged, changed } = await pullAndMerge('appraisals', loadAppraisals());
      if (cancelled || !changed) return;

      saveAppraisals(merged as TeacherAppraisalRecord[]);
      setAppraisals(merged as TeacherAppraisalRecord[]);
      setLastSyncAt(new Date().toISOString());
    };

    void sync();
    const timer = setInterval(sync, 60_000);
    window.addEventListener('online', sync);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('online', sync);
    };
  }, []);

  // A record changed on two devices at once: ask which version to keep.
  useEffect(
    () =>
      onSyncConflict(async (conflict) => {
        if (conflict.collection !== 'appraisals') return;

        const keepMine = window.confirm(
          `"${conflict.localRecord.teacherName || 'This observation'}" was also changed on ` +
            'another device.\n\nOK — keep the version on THIS device and overwrite the other.\n' +
            'Cancel — discard your change and load the other device\'s version.'
        );

        const resolved = await resolveConflict(conflict, keepMine ? 'mine' : 'theirs');
        const refreshed = loadAppraisals().map((a) => (a.id === resolved.id ? resolved : a));
        saveAppraisals(refreshed);
        setAppraisals(refreshed);
      }),
    []
  );

  /**
   * Write an observation to the device. This is the only thing that does.
   *
   * A sheet that was never saved is living at the address of a new
   * observation; once it is on the device it has an identity of its own and
   * the address is corrected to match, in place, so that Back does not lead
   * to a blank sheet that no longer exists.
   */
  const handleSaveAppraisal = (record: TeacherAppraisalRecord) => {
    try {
      const saved = saveOrUpdateAppraisal(record);
      setAppraisals(loadAppraisals());
      if (isDraftRoute) {
        setDraft(null);
        navigate({ view: 'FORM', appraisalId: saved.id }, true);
      }
    } catch (e: any) {
      // Surface it rather than letting the success toast lie about the save.
      window.alert(e?.message || 'The observation could not be saved.');
    }
  };

  /**
   * Starts the next observation of a teacher already in the portfolio.
   *
   * Everything describing the posting is carried over - school, level, subject,
   * class, appraiser, academic year - and nothing describing the lesson is.
   * Retyping all of that for each visit is most of the setup an appraiser does,
   * and it is also where a teacher's name drifts between spellings and their
   * history quietly splits in two.
   */
  const handleNewFollowUp = (previous: TeacherAppraisalRecord) => {
    // Seeding replaces whatever unsaved sheet is already open, which is the
    // one way this can cost an appraiser work, so it is the one that asks.
    if (
      draft &&
      !window.confirm(
        'You have an observation that has not been saved yet. Starting a follow-up will ' +
          'discard it. Continue?'
      )
    ) {
      return;
    }

    const blank = createBlankAppraisal(
      previous.careerLevel,
      previous.schoolLevel,
      previous.subjectCategory,
      previous.schoolName
    );

    // Held in memory, not written to the device: a follow-up nobody fills in
    // should leave the teacher's history as it was.
    setDraft({ ...blank, ...carryContext(previous) });
    navigate({ view: 'FORM', appraisalId: NEW_OBSERVATION });
  };

  // Handle Delete
  const handleDeleteAppraisal = (id: string) => {
    if (window.confirm('Are you sure you want to delete this observation record?')) {
      deleteAppraisal(id);
      const updatedAll = loadAppraisals();
      setAppraisals(updatedAll);
      if (route.appraisalId === id) navigate({ view: 'LIST' });
    }
  };

  // Handle Clear All Appraisals
  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to erase all observation records? This will clear your portfolio.')) {
      saveAppraisals([]);
      setAppraisals([]);
      navigate({ view: 'LIST' });
    }
  };

  // Handle View Selection
  const handleSelectAppraisal = (appraisal: TeacherAppraisalRecord) => {
    navigate({ view: 'FORM', appraisalId: appraisal.id });
  };

  // Handle Report View
  const handleViewReport = (appraisal: TeacherAppraisalRecord) => {
    navigate({ view: 'REPORT', appraisalId: appraisal.id });
  };

  // Open Rubric Reference
  const handleOpenRubrics = (level: CareerLevel = 'Proficient') => {
    setRubricLevel(level);
    setIsRubricModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        currentView={currentView}
        activeAppraisalId={activeAppraisalId}
        onOpenRubrics={() => handleOpenRubrics(currentAppraisal?.careerLevel || 'Proficient')}
        hasActiveRecord={!!currentAppraisal}
      />

      <SyncStatusBar lastSyncAt={lastSyncAt} />

      {/* Main App Content View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 md:pb-8">
        {currentView === 'LIST' && (
          <AppraisalList
            appraisals={appraisals}
            onDeleteAppraisal={handleDeleteAppraisal}
            onNewFollowUp={handleNewFollowUp}
            onClearAll={handleClearAll}
            onOpenRubrics={handleOpenRubrics}
          />
        )}

        {currentView === 'FORM' && (
          currentAppraisal ? (
            <AppraisalForm
              key={currentAppraisal.id}
              initialRecord={currentAppraisal}
              onSave={handleSaveAppraisal}
              onViewReport={handleViewReport}
              onOpenRubrics={handleOpenRubrics}
              // An observation that has never been saved autosaves nowhere.
              // Its edits are handed back up instead, so they survive a walk
              // to the portfolio and back without reaching the device.
              isUnsaved={isDraftRoute}
              onDraftChange={isDraftRoute ? setDraft : undefined}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm max-w-md mx-auto my-8">
              <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 mx-auto mb-3">
                <span className="font-bold text-lg">+</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">No Observation Selected</h3>
              <p className="text-xs text-slate-500 mt-1 mb-5">
                Start a new classroom observation sheet or pick an existing record from the portfolio.
              </p>
              <a
                href={routeToHash({ view: 'FORM', appraisalId: NEW_OBSERVATION })}
                className="inline-block px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-sm"
              >
                + Create New Observation
              </a>
            </div>
          )
        )}

        {currentView === 'SCHOOL_REPORT' && <SchoolReportView appraisals={appraisals} />}

        {currentView === 'WALKTHROUGH' && <WalkthroughView />}

        {currentView === 'ANALYTICS' && (
          <OverviewAnalytics
            appraisals={appraisals}
            onSelectAppraisal={handleSelectAppraisal}
          />
        )}

        {currentView === 'REPORT' && (
          currentAppraisal ? (
            <ReportView
              record={currentAppraisal}
              onBack={() => navigate({ view: 'FORM', appraisalId: currentAppraisal.id })}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm max-w-md mx-auto my-8">
              <h3 className="text-base font-bold text-slate-900">No Appraisal Record Selected</h3>
              <p className="text-xs text-slate-500 mt-1 mb-5">
                Select an observation record from the directory to generate its official quality assurance report.
              </p>
              <a
                href={routeToHash({ view: 'LIST' })}
                className="inline-block px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-sm"
              >
                Go to Observations List
              </a>
            </div>
          )
        )}
      </main>

      {/* Global Rubric Handbook Modal */}
      <RubricReferenceModal
        isOpen={isRubricModalOpen}
        onClose={() => setIsRubricModalOpen(false)}
        currentLevel={rubricLevel}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500 print:hidden shadow-xs">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-medium text-slate-600">Eduversal Teacher Appraisal Platform v2.1 • Framework 2 Quality Assurance</span>
          <span className="text-slate-400">Charlotte Danielson Framework for Teaching &amp; Robert Marzano Domain Alignment</span>
        </div>
      </footer>
    </div>
  );
}
