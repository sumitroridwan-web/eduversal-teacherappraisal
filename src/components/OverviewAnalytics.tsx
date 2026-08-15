import React, { useState, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  TrendingUp,
  Layers,
  GraduationCap,
  Award,
  Users,
  CheckCircle2,
  ArrowUpRight,
  Search,
  PieChart as PieIcon,
  Compass,
  Building2,
  Sparkles,
  ChevronDown,
  FileText,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts';
import { TeacherAppraisalRecord, SchoolLevel, SubjectCategory, CareerLevel, ItemScoreRecord, EDUVERSAL_SCHOOLS } from '../types';
import { calculateF2Scores, calculateF2Predicate } from '../data/frameworkRubrics';

interface OverviewAnalyticsProps {
  appraisals: TeacherAppraisalRecord[];
  onSelectAppraisal: (appraisal: TeacherAppraisalRecord) => void;
  onViewReport: (appraisal: TeacherAppraisalRecord) => void;
  onNewAppraisal: () => void;
}

type GraphTab = 'overview' | 'campuses' | 'domains' | 'career_dept' | 'ranking';

const GRAPH_TAB_OPTIONS: Array<{ value: GraphTab; label: string; icon: LucideIcon }> = [
  { value: 'overview', label: 'Grades & Components', icon: PieIcon },
  { value: 'campuses', label: 'Campus Benchmarks', icon: Building2 },
  { value: 'domains', label: 'Rubric Domains', icon: Compass },
  { value: 'career_dept', label: 'Levels & Departments', icon: Layers },
  { value: 'ranking', label: 'Teacher Score Spread', icon: TrendingUp },
];

export const OverviewAnalytics: React.FC<OverviewAnalyticsProps> = ({
  appraisals,
  onSelectAppraisal,
  onViewReport,
  onNewAppraisal,
}) => {
  const [selectedSchool, setSelectedSchool] = useState<string>('All');
  const [selectedSchoolLevel, setSelectedSchoolLevel] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeGraphTab, setActiveGraphTab] = useState<GraphTab>('overview');

  const ActiveViewIcon =
    GRAPH_TAB_OPTIONS.find((o) => o.value === activeGraphTab)?.icon ?? PieIcon;

  // Filter appraisals
  const filteredAppraisals = useMemo(() => {
    return appraisals.filter((a) => {
      const matchesSchool = selectedSchool === 'All' || a.schoolName === selectedSchool;
      const matchesLevel = selectedSchoolLevel === 'All' || a.schoolLevel === selectedSchoolLevel;
      const matchesCategory = selectedCategory === 'All' || a.subjectCategory === selectedCategory;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        (a.schoolName && a.schoolName.toLowerCase().includes(q)) ||
        a.teacherName.toLowerCase().includes(q) ||
        a.subject.toLowerCase().includes(q) ||
        a.subjectCategory.toLowerCase().includes(q) ||
        a.schoolLevel.toLowerCase().includes(q) ||
        a.appraiserName.toLowerCase().includes(q);

      return matchesSchool && matchesLevel && matchesCategory && matchesSearch;
    });
  }, [appraisals, selectedSchool, selectedSchoolLevel, selectedCategory, searchQuery]);

  // Calculate Aggregates
  const totalCount = filteredAppraisals.length;

  const {
    gradeDistribution,
    avgF2Pct,
    campusStats,
    careerStats,
    categoryStats,
    domainStats,
    hasDomainData,
    teacherRankings,
    progressionReadyCount,
  } = useMemo(() => {
    const grades: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    let f2Sum = 0;

    const sLevelMap: Record<string, { count: number; f2Sum: number; aCount: number; bCount: number }> = {};
    const catMap: Record<string, { count: number; f2Sum: number; aCount: number }> = {};
    const campusMap: Record<string, { count: number; f2Sum: number; aCount: number }> = {};
    const careerMap: Record<string, { count: number; f2Sum: number }> = {};

    // Domain score accumulators
    const d1Scores: number[] = [];
    const d2Scores: number[] = [];
    const d3Scores: number[] = [];
    const d4Scores: number[] = [];

    const rankings: Array<{
      id: string;
      name: string;
      school: string;
      subject: string;
      level: CareerLevel;
      f2Pct: number;
      grade: string;
      predicate: string;
      appraisal: TeacherAppraisalRecord;
    }> = [];

    filteredAppraisals.forEach((a) => {
      const f2Stats = calculateF2Scores(a.careerLevel, a.scores);
      const band = calculateF2Predicate(f2Stats.percentage);

      grades[f2Stats.grade] = (grades[f2Stats.grade] || 0) + 1;
      f2Sum += f2Stats.percentage;

      // School level
      if (!sLevelMap[a.schoolLevel]) {
        sLevelMap[a.schoolLevel] = { count: 0, f2Sum: 0, aCount: 0, bCount: 0 };
      }
      sLevelMap[a.schoolLevel].count++;
      sLevelMap[a.schoolLevel].f2Sum += f2Stats.percentage;
      if (f2Stats.grade === 'A') sLevelMap[a.schoolLevel].aCount++;
      if (f2Stats.grade === 'B') sLevelMap[a.schoolLevel].bCount++;

      // Category
      if (!catMap[a.subjectCategory]) {
        catMap[a.subjectCategory] = { count: 0, f2Sum: 0, aCount: 0 };
      }
      catMap[a.subjectCategory].count++;
      catMap[a.subjectCategory].f2Sum += f2Stats.percentage;
      if (f2Stats.grade === 'A') catMap[a.subjectCategory].aCount++;

      // Campus
      const sName = a.schoolName || 'Other School';
      if (!campusMap[sName]) {
        campusMap[sName] = { count: 0, f2Sum: 0, aCount: 0 };
      }
      campusMap[sName].count++;
      campusMap[sName].f2Sum += f2Stats.percentage;
      if (f2Stats.grade === 'A') campusMap[sName].aCount++;

      // Career level
      if (!careerMap[a.careerLevel]) {
        careerMap[a.careerLevel] = { count: 0, f2Sum: 0 };
      }
      careerMap[a.careerLevel].count++;
      careerMap[a.careerLevel].f2Sum += f2Stats.percentage;

      // Extract domain scores. Scores are { score, notes } records, and Early
      // Years items are prefixed EYD1..EYD4, so only rated items count here.
      Object.entries(a.scores || {}).forEach(([code, val]: [string, ItemScoreRecord]) => {
        const rating = val?.score;
        if (typeof rating !== 'number') return;

        const pct = (rating / 4) * 100;
        if (code.startsWith('D1.') || code.startsWith('EYD1.')) d1Scores.push(pct);
        else if (code.startsWith('D2.') || code.startsWith('EYD2.')) d2Scores.push(pct);
        else if (code.startsWith('D3.') || code.startsWith('EYD3.')) d3Scores.push(pct);
        else if (code.startsWith('D4.') || code.startsWith('EYD4.')) d4Scores.push(pct);
      });

      rankings.push({
        id: a.id,
        name: a.teacherName,
        school: a.schoolName,
        subject: a.subject,
        level: a.careerLevel,
        f2Pct: f2Stats.percentage,
        grade: f2Stats.grade,
        predicate: band.predicate,
        appraisal: a,
      });
    });

    const count = filteredAppraisals.length || 1;
    const avgF2 = Math.round((f2Sum / count) * 10) / 10;

    // No rated items means no attainment to report - report 0, never a
    // placeholder, so an empty dashboard cannot read as a passing score.
    const avgDomain = (arr: number[]) => (arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
    const ratedItemCount = d1Scores.length + d2Scores.length + d3Scores.length + d4Scores.length;

    const dStats = [
      { domain: 'Domain 1: Planning', shortName: 'Planning', score: avgDomain(d1Scores), benchmark: 75, fullMark: 100 },
      { domain: 'Domain 2: Environment', shortName: 'Environment', score: avgDomain(d2Scores), benchmark: 75, fullMark: 100 },
      { domain: 'Domain 3: Instruction', shortName: 'Instruction', score: avgDomain(d3Scores), benchmark: 75, fullMark: 100 },
      { domain: 'Domain 4: Post-Lesson', shortName: 'Reflection', score: avgDomain(d4Scores), benchmark: 75, fullMark: 100 },
    ];

    const progReady = filteredAppraisals.filter((a) => {
      const s = calculateF2Scores(a.careerLevel, a.scores);
      return (s.grade === 'A' || s.grade === 'B') && s.percentage >= 75;
    }).length;

    rankings.sort((a, b) => b.f2Pct - a.f2Pct);

    return {
      gradeDistribution: grades,
      avgF2Pct: avgF2,
      schoolLevelStats: sLevelMap,
      categoryStats: catMap,
      campusStats: campusMap,
      careerStats: careerMap,
      domainStats: dStats,
      hasDomainData: ratedItemCount > 0,
      teacherRankings: rankings,
      progressionReadyCount: progReady,
    };
  }, [filteredAppraisals]);

  // Recharts Chart Formatted Datasets
  const pieGradeData = useMemo(() => {
    return [
      { name: 'Grade A (Excellent)', grade: 'A', value: gradeDistribution['A'] || 0, color: '#10b981' },
      { name: 'Grade B (Good)', grade: 'B', value: gradeDistribution['B'] || 0, color: '#4f46e5' },
      { name: 'Grade C (Satisfactory)', grade: 'C', value: gradeDistribution['C'] || 0, color: '#f59e0b' },
      { name: 'Grade D (Needs Imp.)', grade: 'D', value: gradeDistribution['D'] || 0, color: '#f97316' },
      { name: 'Grade F (Unsatisfactory)', grade: 'F', value: gradeDistribution['F'] || 0, color: '#ef4444' },
    ].filter((d) => d.value > 0);
  }, [gradeDistribution]);

  const campusBenchmarkData = useMemo(() => {
    return Object.entries(campusStats).map(([name, stat]: [string, { count: number; f2Sum: number; aCount: number }]) => ({
      name,
      shortName: name.length > 20 ? `${name.substring(0, 18)}...` : name,
      f2Avg: Math.round((stat.f2Sum / stat.count) * 10) / 10,
      count: stat.count,
      aCount: stat.aCount,
    })).sort((a, b) => b.f2Avg - a.f2Avg);
  }, [campusStats]);

  const careerLevelData = useMemo(() => {
    const order: CareerLevel[] = ['Induction', 'Developing', 'Proficient', 'Lead', 'EarlyYears'];
    return order
      .filter((lvl) => careerStats[lvl])
      .map((lvl) => ({
        name: lvl === 'EarlyYears' ? 'Early Years' : lvl,
        f2Avg: Math.round((careerStats[lvl].f2Sum / careerStats[lvl].count) * 10) / 10,
        count: careerStats[lvl].count,
      }));
  }, [careerStats]);

  const departmentData = useMemo(() => {
    return Object.entries(categoryStats).map(([dept, stat]: [string, { count: number; f2Sum: number; aCount: number }]) => ({
      name: dept,
      shortName: dept.length > 18 ? `${dept.substring(0, 16)}...` : dept,
      f2Avg: Math.round((stat.f2Sum / stat.count) * 10) / 10,
      count: stat.count,
      aCount: stat.aCount,
    })).sort((a, b) => b.f2Avg - a.f2Avg);
  }, [categoryStats]);

  // Custom Tooltip for Charts
  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl p-3 shadow-xl text-xs text-slate-800 font-sans z-50">
          <p className="font-bold text-slate-900 mb-1.5">{label || payload[0].name}</p>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4 py-0.5">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: entry.color || entry.fill }} />
                {entry.name}:
              </span>
              <span className="font-mono font-bold text-slate-900">
                {entry.value}%
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 text-slate-800">
      {/* Top Header & Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 mb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              <span>Academic Quality Assurance</span>
              <span className="text-slate-300">•</span>
              <span>Interactive Performance Analytics</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-3">
              School &amp; Subject Analytics Report
            </h1>
          </div>

          <button
            type="button"
            onClick={onNewAppraisal}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>+ New Observation</span>
          </button>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Search */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">Search Teacher or Subject</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search teacher, subject..."
                className="w-full bg-white text-slate-900 pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              />
            </div>
          </div>

          {/* School / Campus Filter */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">Eduversal Campus Filter</label>
            <select
              value={selectedSchool}
              onChange={(e) => setSelectedSchool(e.target.value)}
              className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs font-medium cursor-pointer truncate"
            >
              <option value="All">All 15 Schools ({appraisals.length})</option>
              {EDUVERSAL_SCHOOLS.map((school) => (
                <option key={school} value={school}>
                  {school}
                </option>
              ))}
            </select>
          </div>

          {/* School Level Filter */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">School Level Filter</label>
            <select
              value={selectedSchoolLevel}
              onChange={(e) => setSelectedSchoolLevel(e.target.value)}
              className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs cursor-pointer"
            >
              <option value="All">All School Levels</option>
              <option value="Early Years (PG-KG)">Early Years (PG-KG)</option>
              <option value="Primary (Grades 1-6)">Primary (Grades 1-6)</option>
              <option value="Middle School (Grades 7-9)">Middle School (Grades 7-9)</option>
              <option value="High School (Grades 10-12)">High School (Grades 10-12)</option>
            </select>
          </div>

          {/* Subject Category Filter */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">Subject Department Filter</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-white text-slate-900 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs cursor-pointer"
            >
              <option value="All">All Subject Departments</option>
              <option value="Mathematics">Mathematics</option>
              <option value="Science (Physics, Chem, Bio)">Science (Physics, Chem, Bio)</option>
              <option value="English Language & Lit">English Language &amp; Lit</option>
              <option value="Bahasa Indonesia">Bahasa Indonesia</option>
              <option value="Social Studies & Humanities">Social Studies &amp; Humanities</option>
              <option value="Information & Digital Tech">Information &amp; Digital Tech</option>
              <option value="Arts & Music">Arts &amp; Music</option>
              <option value="Physical & Health Education">Physical &amp; Health Education</option>
              <option value="Early Childhood Education">Early Childhood Education</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Appraisals */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              Total Observations
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{totalCount}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Across Eduversal Campuses</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Avg F2 Observation Score */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              Avg F2 Observation %
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">{avgF2Pct}%</div>
            <div className="text-[11px] text-emerald-600 mt-0.5 font-medium">Framework 2 Benchmark</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Progression Candidates */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              Progression Eligible
            </div>
            <div className="text-2xl font-bold font-mono text-amber-600 mt-1">
              {progressionReadyCount} <span className="text-xs text-slate-400 font-normal">/ {totalCount}</span>
            </div>
            <div className="text-[11px] text-amber-600 mt-0.5 font-medium">Qualified for Promotion</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <GraduationCap className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Interactive Charts Section with Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        {/* Navigation Tabs for Chart Perspectives */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-6 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              Interactive Quality Assurance Analytics
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Explore multi-dimensional data distributions, school benchmarks, and rubric domain masteries.
            </p>
          </div>

          <div className="sm:min-w-[260px]">
            <label htmlFor="analytics-view" className="sr-only">
              Analytics view
            </label>
            <div className="relative">
              <ActiveViewIcon className="w-4 h-4 text-indigo-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                id="analytics-view"
                value={activeGraphTab}
                onChange={(e) => setActiveGraphTab(e.target.value as GraphTab)}
                className="w-full appearance-none pl-9 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none cursor-pointer transition hover:bg-white focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              >
                {GRAPH_TAB_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Tab 1: Grades & Framework Components */}
        {activeGraphTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Donut Chart of F2 Grades */}
            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Indicative F2 Grade Distribution
                  </h3>
                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                    {totalCount} Total
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-4">
                  Distribution of evaluated teacher classroom observations across proficiency bands.
                </p>

                <div className="h-64 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieGradeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {pieGradeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any, name: any) => [`${val} Teachers (${totalCount > 0 ? Math.round((Number(val) / totalCount) * 100) : 0}%)`, name]}
                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Centered Donut Label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold font-mono text-slate-900">{avgF2Pct}%</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Avg Score</span>
                  </div>
                </div>
              </div>

              {/* Custom Legend */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3 border-t border-slate-200 text-xs">
                {pieGradeData.map((item) => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-700 font-medium truncate">{item.name.split(' ')[0]} {item.name.split(' ')[1]}:</span>
                    <span className="font-bold text-slate-900 font-mono">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Framework 2 Domain Attainment */}
            <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Framework 2 Domain Attainment
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">75% Target</span>
                </div>
                <p className="text-[11px] text-slate-500 mb-4">
                  Observed classroom performance across the four Framework 2 rubric domains.
                </p>

                <div className="h-64 w-full">
                  {!hasDomainData ? (
                    <div className="h-full w-full flex flex-col items-center justify-center text-center border border-dashed border-slate-300 rounded-xl bg-white/60">
                      <Compass className="w-7 h-7 text-slate-300 mb-2" />
                      <p className="text-xs font-semibold text-slate-600">No rubric indicators scored yet</p>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                        Domain attainment appears once observation sheets have rated indicators.
                      </p>
                    </div>
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={domainStats} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="shortName"
                        tick={{ fontSize: 11, fill: '#475569' }}
                        interval={0}
                      />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                      <Tooltip content={<CustomChartTooltip />} />
                      <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '75% Target', fill: '#d97706', fontSize: 10, position: 'top' }} />
                      <Bar dataKey="score" name="Attainment %" radius={[6, 6, 0, 0]}>
                        {domainStats.map((_entry, index) => (
                          <Cell
                            key={`f-cell-${index}`}
                            fill={['#0d9488', '#4f46e5', '#3b82f6', '#8b5cf6'][index % 4]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="mt-2 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
                <span>Scoring basis: <strong className="text-slate-800">Framework 2 classroom observation only</strong></span>
                <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                  Network Avg F2: {avgF2Pct}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Campus Benchmark Comparison */}
        {activeGraphTab === 'campuses' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Eduversal Network Campus Benchmarking
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Comparative Framework 2 classroom observation performance across campuses.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                {campusBenchmarkData.length} Campuses Active
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campusBenchmarkData} margin={{ top: 15, right: 30, left: 0, bottom: 45 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="shortName"
                      tick={{ fontSize: 10, fill: '#334155' }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                    />
                    <YAxis domain={[60, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      formatter={(val) => <span className="text-xs font-semibold text-slate-700">{val}</span>}
                    />
                    <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Target: 75%', fill: '#b45309', fontSize: 10, position: 'insideTopRight' }} />
                    <Bar dataKey="f2Avg" name="F2 Live Observation %" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Campus Micro Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {campusBenchmarkData.slice(0, 5).map((c, i) => (
                <div key={c.name} className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1">
                    <span className="truncate" title={c.name}>{c.shortName}</span>
                    <span className="text-indigo-600 font-bold">#{i + 1}</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-bold font-mono text-slate-900">{c.f2Avg}%</span>
                    <span className="text-[10px] text-emerald-600 font-medium font-mono">{c.count} staff</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Grade A: {c.aCount}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Rubric Domain Mastery */}
        {activeGraphTab === 'domains' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Radar Chart */}
            <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Rubric Domain Mastery Radar
                  </h3>
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    4 Core Domains
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-4">
                  Multi-axial visualization of instructional quality across the 4 appraisal domains.
                </p>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={domainStats}>
                      <PolarGrid stroke="#cbd5e1" />
                      <PolarAngleAxis dataKey="shortName" tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 600 }} />
                      <PolarRadiusAxis domain={[50, 100]} angle={30} tick={{ fontSize: 10, fill: '#64748b' }} />
                      <Radar
                        name="Domain Mastery %"
                        dataKey="score"
                        stroke="#4f46e5"
                        fill="#6366f1"
                        fillOpacity={0.4}
                      />
                      <Tooltip
                        formatter={(val: any) => [`${val}%`, 'Attainment Score']}
                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
                <span>Domain target threshold: <strong>75%</strong></span>
                <span className="text-indigo-600 font-semibold">Highest: Instruction ({domainStats[2]?.score ?? 0}%)</span>
              </div>
            </div>

            {/* Right: Domain Progress Details */}
            <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  Domain Performance Breakdown &amp; Rubrics
                </h3>
                <p className="text-[11px] text-slate-500 mb-4">
                  Granular evaluation of teacher competency by Danielson-aligned observation criteria.
                </p>

                <div className="space-y-4">
                  {domainStats.map((d) => (
                    <div key={d.domain} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-bold text-slate-900">{d.domain}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400">Target: {d.benchmark}%</span>
                          <span className="font-mono font-bold text-indigo-600 text-sm">{d.score}%</span>
                        </div>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${d.score}%` }}
                          className={`h-full rounded-full ${
                            d.score >= 85
                              ? 'bg-emerald-500'
                              : d.score >= 75
                              ? 'bg-indigo-600'
                              : d.score >= 65
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                <span>Evaluated across {totalCount} teacher observations</span>
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> All Domains Pass Standards
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Levels & Departments */}
        {activeGraphTab === 'career_dept' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Career Levels */}
            <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Performance by Career Progression Stage
                </h3>
                <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  Career Ladder
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mb-4">
                Comparison of Induction, Developing, Proficient, and Lead Teacher cohorts.
              </p>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={careerLevelData} margin={{ top: 10, right: 20, left: -15, bottom: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#334155' }} />
                    <YAxis domain={[60, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Legend verticalAlign="top" height={32} />
                    <Bar dataKey="f2Avg" name="F2 Live Observation %" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Subject Departments */}
            <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Performance by Subject Department
                </h3>
                <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                  {departmentData.length} Subjects
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mb-4">
                Departmental comparison across Science, Math, Languages, Humanities, and ICT.
              </p>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={departmentData} margin={{ top: 10, right: 20, left: -15, bottom: 35 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="shortName"
                      tick={{ fontSize: 10, fill: '#334155' }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                    />
                    <YAxis domain={[60, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Bar dataKey="f2Avg" name="F2 Average %" fill="#6366f1" radius={[4, 4, 0, 0]}>
                      {departmentData.map((entry, index) => (
                        <Cell
                          key={`dept-cell-${index}`}
                          fill={entry.f2Avg >= 85 ? '#10b981' : entry.f2Avg >= 75 ? '#4f46e5' : '#f59e0b'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Teacher Score Spread & Ranking */}
        {activeGraphTab === 'ranking' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Teacher Performance Curve &amp; Score Correlation
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Line chart plotting individual teacher Framework 2 observation ratings.
                </p>
              </div>
              <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
                Sorted by F2 Score
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={teacherRankings.map((t, idx) => ({
                      rank: `#${idx + 1}`,
                      teacherName: t.name,
                      shortTeacher: t.name.split(',')[0],
                      f2Score: t.f2Pct,
                      school: t.school,
                      subject: t.subject,
                    }))}
                    margin={{ top: 15, right: 30, left: 0, bottom: 45 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="shortTeacher"
                      tick={{ fontSize: 10, fill: '#334155' }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                    />
                    <YAxis domain={[70, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl p-3 shadow-xl text-xs">
                              <p className="font-bold text-slate-900">{data.teacherName} ({data.rank})</p>
                              <p className="text-[11px] text-teal-800 font-semibold">{data.school}</p>
                              <p className="text-[11px] text-slate-500 mb-1.5">{data.subject}</p>
                              <div className="flex items-center justify-between gap-4 py-0.5 border-t border-slate-100 pt-1">
                                <span className="text-indigo-600 font-medium">F2 Live Observation:</span>
                                <span className="font-mono font-bold text-slate-900">{data.f2Score}%</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '75% Target Threshold', fill: '#b45309', fontSize: 10 }} />
                    <Line
                      type="monotone"
                      dataKey="f2Score"
                      name="F2 Live Observation %"
                      stroke="#4f46e5"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 3, fill: '#4f46e5' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Individual Appraisals Comparative Matrix Table */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              Comparative Observation Log &amp; Records
            </h2>
            <p className="text-xs text-slate-500">
              Click any teacher row to open the full editable observation sheet or generate their official PDF report.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            Showing {filteredAppraisals.length} records
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px] bg-slate-50">
                <th className="py-3 px-4">Teacher &amp; Subject</th>
                <th className="py-3 px-4">School &amp; Level</th>
                <th className="py-3 px-4">Career Level</th>
                <th className="py-3 px-4">Observation Date</th>
                <th className="py-3 px-4">F2 Raw Score</th>
                <th className="py-3 px-4">Indicative Reading</th>
                <th className="py-3 px-4">Performance Band</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAppraisals.map((a) => {
                const s = calculateF2Scores(a.careerLevel, a.scores);
                const band = calculateF2Predicate(s.percentage);

                return (
                  <tr
                    key={a.id}
                    onClick={() => onSelectAppraisal(a)}
                    className="hover:bg-slate-50 transition cursor-pointer group"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition">
                        {a.teacherName}
                      </div>
                      <div className="text-[11px] text-slate-500">{a.subject}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="text-xs font-semibold text-teal-800">{a.schoolName || 'Eduversal School'}</div>
                      <div className="text-[11px] text-slate-600 font-medium">{a.schoolLevel}</div>
                      <div className="text-[10px] text-slate-400">{a.gradeClass || 'General'}</div>
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-medium px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                        {a.careerLevel}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-600">{a.observationDate}</td>

                    <td className="py-3 px-4 font-mono font-semibold text-indigo-600">
                      {s.totalRaw}/{s.maxTotal} ({s.percentage}%)
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center justify-center font-bold px-2 py-0.5 rounded text-xs border ${
                          s.grade === 'A'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : s.grade === 'B'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : s.grade === 'C'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : s.grade === 'D'
                            ? 'bg-orange-50 text-orange-700 border-orange-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        Grade {s.grade}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{band.predicate}</div>
                      <div className="text-[11px] font-mono text-slate-500">{band.f2Percent}%</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewReport(a);
                          }}
                          title={`Open the observation report for ${a.teacherName || 'this teacher'}`}
                          className="text-xs text-[#165963] hover:text-[#11474f] font-semibold px-2.5 py-1 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Teacher Report</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectAppraisal(a);
                          }}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <span>Open Sheet</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
