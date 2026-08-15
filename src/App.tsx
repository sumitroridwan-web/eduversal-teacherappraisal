import React, { useState, useEffect } from 'react';
import {
  loadAppraisals,
  saveAppraisals,
  saveOrUpdateAppraisal,
  deleteAppraisal,
  createBlankAppraisal,
} from './services/storage';
import { TeacherAppraisalRecord, CareerLevel } from './types';
import { Navbar } from './components/Navbar';
import { AppraisalForm } from './components/AppraisalForm';
import { AppraisalList } from './components/AppraisalList';
import { OverviewAnalytics } from './components/OverviewAnalytics';
import { ReportView } from './components/ReportView';
import { SchoolReportView } from './components/SchoolReportView';
import { WalkthroughView } from './components/WalkthroughView';
import { RubricReferenceModal } from './components/RubricReferenceModal';

export default function App() {
  const [appraisals, setAppraisals] = useState<TeacherAppraisalRecord[]>([]);
  const [currentAppraisal, setCurrentAppraisal] = useState<TeacherAppraisalRecord | null>(null);
  const [currentView, setCurrentView] = useState<'FORM' | 'LIST' | 'ANALYTICS' | 'REPORT' | 'SCHOOL_REPORT' | 'WALKTHROUGH'>('LIST');
  const [isRubricModalOpen, setIsRubricModalOpen] = useState(false);
  const [rubricLevel, setRubricLevel] = useState<CareerLevel>('Proficient');

  // Load initial appraisals on startup
  useEffect(() => {
    const loaded = loadAppraisals();
    setAppraisals(loaded);
    if (loaded.length > 0) {
      setCurrentAppraisal(loaded[0]);
    } else {
      setCurrentAppraisal(null);
    }
  }, []);

  // Handle Save
  const handleSaveAppraisal = (record: TeacherAppraisalRecord) => {
    try {
      const saved = saveOrUpdateAppraisal(record);
      setCurrentAppraisal(saved);
      const updatedAll = loadAppraisals();
      setAppraisals(updatedAll);
    } catch (e: any) {
      // Surface it rather than letting the success toast lie about the save.
      window.alert(e?.message || 'The observation could not be saved.');
    }
  };

  // Handle Create New Appraisal
  const handleNewAppraisal = () => {
    const newBlank = createBlankAppraisal('Proficient');
    const saved = saveOrUpdateAppraisal(newBlank);
    setCurrentAppraisal(saved);
    const updatedAll = loadAppraisals();
    setAppraisals(updatedAll);
    setCurrentView('FORM');
  };

  // Handle Delete
  const handleDeleteAppraisal = (id: string) => {
    if (window.confirm('Are you sure you want to delete this observation record?')) {
      deleteAppraisal(id);
      const updatedAll = loadAppraisals();
      setAppraisals(updatedAll);
      if (currentAppraisal?.id === id) {
        if (updatedAll.length > 0) {
          setCurrentAppraisal(updatedAll[0]);
        } else {
          setCurrentAppraisal(null);
          setCurrentView('LIST');
        }
      }
    }
  };

  // Handle Clear All Appraisals
  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to erase all observation records? This will clear your portfolio.')) {
      saveAppraisals([]);
      setAppraisals([]);
      setCurrentAppraisal(null);
      setCurrentView('LIST');
    }
  };

  // Handle View Selection
  const handleSelectAppraisal = (appraisal: TeacherAppraisalRecord) => {
    setCurrentAppraisal(appraisal);
    setCurrentView('FORM');
  };

  // Handle Report View
  const handleViewReport = (appraisal: TeacherAppraisalRecord) => {
    setCurrentAppraisal(appraisal);
    setCurrentView('REPORT');
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
        onChangeView={(view) => setCurrentView(view)}
        onNewAppraisal={handleNewAppraisal}
        onOpenRubrics={() => handleOpenRubrics(currentAppraisal?.careerLevel || 'Proficient')}
        hasActiveRecord={!!currentAppraisal}
      />

      {/* Main App Content View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 md:pb-8">
        {currentView === 'LIST' && (
          <AppraisalList
            appraisals={appraisals}
            onSelectAppraisal={handleSelectAppraisal}
            onNewAppraisal={handleNewAppraisal}
            onDeleteAppraisal={handleDeleteAppraisal}
            onClearAll={handleClearAll}
            onViewReport={handleViewReport}
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
              <button
                type="button"
                onClick={handleNewAppraisal}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-sm"
              >
                + Create New Observation
              </button>
            </div>
          )
        )}

        {currentView === 'SCHOOL_REPORT' && <SchoolReportView appraisals={appraisals} />}

        {currentView === 'WALKTHROUGH' && <WalkthroughView />}

        {currentView === 'ANALYTICS' && (
          <OverviewAnalytics
            appraisals={appraisals}
            onSelectAppraisal={handleSelectAppraisal}
            onNewAppraisal={handleNewAppraisal}
          />
        )}

        {currentView === 'REPORT' && (
          currentAppraisal ? (
            <ReportView
              record={currentAppraisal}
              onBack={() => setCurrentView('FORM')}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm max-w-md mx-auto my-8">
              <h3 className="text-base font-bold text-slate-900">No Appraisal Record Selected</h3>
              <p className="text-xs text-slate-500 mt-1 mb-5">
                Select an observation record from the directory to generate its official quality assurance report.
              </p>
              <button
                type="button"
                onClick={() => setCurrentView('LIST')}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-sm"
              >
                Go to Observations List
              </button>
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
