import { useState, useMemo } from 'react';
import { getSessionIndex, getRunsBySession, calculateSessionDuration, getHistoryRuns } from '../db/queries';
import { loadConfig, saveConfig } from '../utils/config';
import RunChart from './shared/RunChart';
import DistChart from './shared/DistChart';
import StatCard from './shared/StatCard';

const C = {
    id: 0, timestamp: 1, time_sec: 2, explosives: 3, total_explosives: 4,
    tower: 5, type: 6, height: 7, bed_time: 8, is_success: 9,
    fail_reason: 10, session_id: 11, split_tag: 12
};

function formatDate(ts) {
    try {
        const dt = new Date(ts.replace(' ', 'T'));
        return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    } catch { return ts || ''; }
}

function formatDuration(sec) {
    if (!sec) return '-';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${s}s`;
    return `${s}s`;
}

export default function SessionAnalytics({ refreshKey }) {
    const config = useMemo(() => loadConfig(), [refreshKey]);
    const threshold = config.session_gap_threshold || 30;

    const [viewMode, setViewMode] = useState('list');
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [historyMode, setHistoryMode] = useState(config.history_mode || 'session');
    const [chartMode, setChartMode] = useState('expl');
    const [showTrend, setShowTrend] = useState(false);
    const [hideFails, setHideFails] = useState(false);
    const [hideWL, setHideWL] = useState(false);
    const [listSortMode, setListSortMode] = useState('newest');
    const [sortMode, setSortMode] = useState('newest');
    const [groupSize, setGroupSize] = useState(1);
    const [showDist, setShowDist] = useState(config.show_dist_chart || false);

    const [showIndexChart, setShowIndexChart] = useState(config.show_index_chart || false);
    const [indexChartMode, setIndexChartMode] = useState(config.index_chart_mode || 'session');
    const [indexChartMetric, setIndexChartMetric] = useState(config.index_chart_metric || 'expl');

    // Mode-specific state
    const [indexSessionMinRuns, setIndexSessionMinRuns] = useState(config.index_session_min_runs || 5);
    const [indexSessionGroup, setIndexSessionGroup] = useState(config.index_session_group || 1);
    const [indexRunGroup, setIndexRunGroup] = useState(config.index_run_group || 5);
    const [indexSplitMinRuns, setIndexSplitMinRuns] = useState(config.index_split_min_runs || 3);
    const [indexSplitGroup, setIndexSplitGroup] = useState(config.index_split_group || 1);

    // Anomaly filtering state
    const [runFilterAnomalies, setRunFilterAnomalies] = useState(config.index_run_filter_anomalies !== false);
    const [runMaxExpl, setRunMaxExpl] = useState(config.index_run_max_expl || 10);
    const [runMaxTime, setRunMaxTime] = useState(config.index_run_max_time || 300);

    const sessionList = useMemo(() => {
        const raw = getSessionIndex(threshold);
        return raw.filter(s => {
            if (historyMode === 'split') return s.type === 'split';
            return s.type === 'file';
        });
    }, [refreshKey, threshold, historyMode]);

    const filteredList = useMemo(() => {
        let list = [...sessionList];

        switch (listSortMode) {
            case 'newest': list.sort((a, b) => b.start_time.localeCompare(a.start_time)); break;
            case 'oldest': list.sort((a, b) => a.start_time.localeCompare(b.start_time)); break;
            case 'runs': list.sort((a, b) => b.count - a.count); break;
            case 'duration': list.sort((a, b) => b.duration_sec - a.duration_sec); break;
            case 'rate': list.sort((a, b) => (b.success_count / (b.count || 1)) - (a.success_count / (a.count || 1))); break;
            case 'wins': list.sort((a, b) => b.success_count - a.success_count); break;
            case 'avg_expl': list.sort((a, b) => (a.avg_expl || 99) - (b.avg_expl || 99)); break;
            case 'avg_time': list.sort((a, b) => (a.avg_time || 9999) - (b.avg_time || 9999)); break;
            default: break;
        }
        return list;
    }, [sessionList, listSortMode]);

    const loadDetail = (index) => {
        setCurrentIndex(index);
        setViewMode('detail');
        setChartMode('expl');
        setGroupSize(1);
    };

    const currentSession = currentIndex >= 0 && currentIndex < filteredList.length ? filteredList[currentIndex] : null;

    const sessionRuns = useMemo(() => {
        if (!currentSession) return [];
        return getRunsBySession(currentSession.id, currentSession.type);
    }, [currentSession?.id, currentSession?.type, refreshKey]);

    const displayRuns = useMemo(() => {
        let runs = [...sessionRuns];
        if (hideFails) runs = runs.filter(r => r[C.is_success]);
        if (hideWL) runs = runs.filter(r => r[C.fail_reason] !== 'World Load');

        if (sortMode === 'newest') {
            runs.sort((a, b) => b[C.timestamp].localeCompare(a[C.timestamp]));
        } else if (sortMode === 'oldest') {
            runs.sort((a, b) => a[C.timestamp].localeCompare(b[C.timestamp]));
        } else if (sortMode === 'fastest') {
            const succ = runs.filter(r => r[C.is_success]).sort((a, b) => a[C.time_sec] - b[C.time_sec]);
            const fail = runs.filter(r => !r[C.is_success]);
            runs = [...succ, ...fail];
        } else if (sortMode === 'least_expl') {
            const succ = runs.filter(r => r[C.is_success]).sort((a, b) => (a[C.total_explosives] || 99) - (b[C.total_explosives] || 99));
            const fail = runs.filter(r => !r[C.is_success]);
            runs = [...succ, ...fail];
        } else if (sortMode === 'highest_y') {
            runs.sort((a, b) => (b[C.height] || 0) - (a[C.height] || 0));
        } else if (sortMode === 'lowest_y') {
            const withY = runs.filter(r => (r[C.height] || 0) > 0).sort((a, b) => a[C.height] - b[C.height]);
            const noY = runs.filter(r => !((r[C.height] || 0) > 0));
            runs = [...withY, ...noY];
        }
        return runs;
    }, [sessionRuns, hideFails, hideWL, sortMode]);

    const chartValues = useMemo(() => {
        const successes = sessionRuns.filter(r => r[C.is_success]).reverse();
        if (chartMode === 'expl') return successes.map(r => r[C.total_explosives]).filter(v => v > 0);
        return successes.map(r => r[C.time_sec]);
    }, [sessionRuns, chartMode]);

    const distData = useMemo(() => {
        const successes = sessionRuns.filter(r => r[C.is_success]);
        if (successes.length === 0) return {};

        const counts = {};
        successes.forEach(r => {
            const expl = r[C.total_explosives] || 0;
            if (expl > 0) {
                counts[expl] = (counts[expl] || 0) + 1;
            }
        });

        const distribution = {};
        Object.keys(counts).forEach(expl => {
            distribution[expl] = (counts[expl] / successes.length) * 100;
        });

        return distribution;
    }, [sessionRuns]);

    const stats = useMemo(() => {
        const total = sessionRuns.length;
        const successes = sessionRuns.filter(r => r[C.is_success]);
        const wins = successes.length;
        const fails = total - wins;
        const rate = (wins / (total || 1)) * 100;

        const deaths = sessionRuns.filter(r => r[C.fail_reason] === 'Death').length;

        const runObjs = sessionRuns.map(r => ({ timestamp: r[C.timestamp], time_sec: r[C.time_sec] }));
        const { durationSec, playTimeSec } = calculateSessionDuration(runObjs, threshold);

        const expls = successes.map(r => r[C.total_explosives] || 0);
        const bestExpl = expls.length > 0 ? Math.min(...expls) : 0;
        const avgExpl = expls.length > 0 ? (expls.reduce((a, b) => a + b, 0) / expls.length) : 0;

        const times = successes.map(r => r[C.time_sec]);
        const bestTime = times.length > 0 ? Math.min(...times) : 0;
        const avgTime = times.length > 0 ? (times.reduce((a, b) => a + b, 0) / times.length) : 0;

        const playDensity = durationSec > 0 ? (playTimeSec / durationSec) * 100 : 0;

        return { total, wins, fails, rate, deaths, durationSec, playDensity, bestExpl, avgExpl, bestTime, avgTime };
    }, [sessionRuns, threshold]);

    const indexChartData = useMemo(() => {
        if (!showIndexChart) return [];

        if (indexChartMode === 'run') {
            let runs = getHistoryRuns();
            // indices: timestamp(0), time_sec(1), explosives(2)

            if (runFilterAnomalies) {
                if (indexChartMetric === 'expl') {
                    runs = runs.filter(r => r[2] <= runMaxExpl);
                } else {
                    runs = runs.filter(r => r[1] <= runMaxTime);
                }
            }

            if (indexChartMetric === 'expl') {
                return runs.map(r => r[2]).filter(v => v > 0);
            }
            return runs.map(r => r[1]);
        }

        // Aggregate from sessionList (already chronologically sorted would be better, but sessionList is from getSessionIndex)
        // getSessionIndex returns them in a specific order, let's sort them ASC by start_time for the chart
        const base = [...sessionList]
            .filter(s => {
                if (indexChartMode === 'session') return s.type === 'file' && s.count >= indexSessionMinRuns;
                if (indexChartMode === 'split') return s.type === 'split' && s.count >= indexSplitMinRuns;
                return false;
            })
            .sort((a, b) => a.start_time.localeCompare(b.start_time));

        if (indexChartMetric === 'expl') {
            return base.map(s => s.avg_expl).filter(v => v > 0);
        }
        return base.map(s => s.avg_time).filter(v => v > 0);
    }, [showIndexChart, indexChartMode, indexChartMetric, indexSessionMinRuns, indexSplitMinRuns, runFilterAnomalies, runMaxExpl, runMaxTime, sessionList, refreshKey]);

    const activeIndexChartGroup = useMemo(() => {
        if (indexChartMode === 'session') return indexSessionGroup;
        if (indexChartMode === 'run') return indexRunGroup;
        if (indexChartMode === 'split') return indexSplitGroup;
        return 1;
    }, [indexChartMode, indexSessionGroup, indexRunGroup, indexSplitGroup]);

    if (viewMode === 'list') {
        return (
            <div className="flex flex-col h-full overflow-hidden pt-1 px-1">
                <div className="flex items-center justify-between mb-4 shrink-0 pr-1">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-100">History</h2>
                        <div className="flex bg-gray-800 rounded-lg overflow-hidden border border-gray-700/50 p-0.5">
                            <button
                                onClick={() => { setHistoryMode('session'); saveConfig({ history_mode: 'session' }); }}
                                className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-tight transition-all ${historyMode === 'session' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Sessions
                            </button>
                            <button
                                onClick={() => { setHistoryMode('split'); saveConfig({ history_mode: 'split' }); }}
                                className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-tight transition-all ${historyMode === 'split' ? 'bg-orange-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Splits
                            </button>
                        </div>
                        <button
                            onClick={() => {
                                const next = !showIndexChart;
                                setShowIndexChart(next);
                                saveConfig({ show_index_chart: next });
                            }}
                            className={`p-1.5 rounded-lg transition-all ${showIndexChart ? 'bg-blue-950/40 text-blue-400 ring-1 ring-blue-500/50' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                            title="Toggle Performance Chart"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-[11px] text-gray-500">Sort By</span>
                        <select value={listSortMode} onChange={e => setListSortMode(e.target.value)}
                            className="bg-gray-800 border border-gray-700/50 rounded px-2.5 py-1.5 text-[11px] text-gray-200 focus:outline-none focus:border-gray-500 hover:border-gray-600 transition-colors">
                            <option value="newest">Newest</option>
                            <option value="oldest">Oldest</option>
                            <option value="runs">Most Runs</option>
                            <option value="duration">Longest Session</option>
                            <option value="rate">Highest Success %</option>
                            <option value="wins">Most Wins</option>
                            <option value="avg_expl">Avg Expl (Lowest)</option>
                            <option value="avg_time">Avg Time (Fastest)</option>
                        </select>
                    </div>
                </div>

                {showIndexChart && (
                    <div className="mb-4 shrink-0 transition-all animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-2 mb-2 flex-wrap bg-gray-900/40 p-2 rounded-lg border border-gray-800/50">
                            <div className="flex bg-gray-800 rounded-lg overflow-hidden text-[10px] border border-gray-700/50 font-bold uppercase">
                                <button onClick={() => { setIndexChartMode('session'); saveConfig({ index_chart_mode: 'session' }); }}
                                    className={`px-3 py-1.5 transition-colors ${indexChartMode === 'session' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>Session</button>
                                <button onClick={() => { setIndexChartMode('run'); saveConfig({ index_chart_mode: 'run' }); }}
                                    className={`px-3 py-1.5 transition-colors ${indexChartMode === 'run' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>Runs</button>
                                <button onClick={() => { setIndexChartMode('split'); saveConfig({ index_chart_mode: 'split' }); }}
                                    className={`px-3 py-1.5 transition-colors ${indexChartMode === 'split' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>Split</button>
                            </div>

                            <div className="flex bg-gray-800 rounded-lg overflow-hidden text-[10px] border border-gray-700/50 font-bold uppercase">
                                <button onClick={() => { setIndexChartMetric('expl'); saveConfig({ index_chart_metric: 'expl' }); }}
                                    className={`px-3 py-1.5 transition-colors ${indexChartMetric === 'expl' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>Expl</button>
                                <button onClick={() => { setIndexChartMetric('time'); saveConfig({ index_chart_metric: 'time' }); }}
                                    className={`px-3 py-1.5 transition-colors ${indexChartMetric === 'time' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>Time</button>
                            </div>

                            <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700/50 rounded px-2 py-1.5 h-[27px]">
                                <span className="text-[9px] text-gray-500 uppercase font-bold">Group</span>
                                <input type="number" min="1" value={activeIndexChartGroup}
                                    onChange={e => {
                                        const val = Math.max(1, parseInt(e.target.value) || 1);
                                        if (indexChartMode === 'session') { setIndexSessionGroup(val); saveConfig({ index_session_group: val }); }
                                        else if (indexChartMode === 'run') { setIndexRunGroup(val); saveConfig({ index_run_group: val }); }
                                        else if (indexChartMode === 'split') { setIndexSplitGroup(val); saveConfig({ index_split_group: val }); }
                                    }}
                                    className="w-8 bg-transparent border-none text-[10px] text-white text-center focus:outline-none font-bold" />
                            </div>

                            {(indexChartMode === 'session' || indexChartMode === 'split') && (
                                <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700/50 rounded px-2 py-1.5 h-[27px]">
                                    <span className="text-[9px] text-gray-500 uppercase font-bold">Min Runs</span>
                                    <input type="number" min="1" value={indexChartMode === 'session' ? indexSessionMinRuns : indexSplitMinRuns}
                                        onChange={e => {
                                            const val = Math.max(1, parseInt(e.target.value) || 1);
                                            if (indexChartMode === 'session') { setIndexSessionMinRuns(val); saveConfig({ index_session_min_runs: val }); }
                                            else { setIndexSplitMinRuns(val); saveConfig({ index_split_min_runs: val }); }
                                        }}
                                        className="w-8 bg-transparent border-none text-[10px] text-white text-center focus:outline-none font-bold" />
                                </div>
                            )}

                            {indexChartMode === 'run' && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            const next = !runFilterAnomalies;
                                            setRunFilterAnomalies(next);
                                            saveConfig({ index_run_filter_anomalies: next });
                                        }}
                                        className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all ${runFilterAnomalies ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}
                                        title="Filter Outliers"
                                    >
                                        Filter
                                    </button>
                                    {runFilterAnomalies && (
                                        <div className="flex items-center gap-1.5 bg-gray-800 border border-orange-500/30 rounded px-2 py-1.5 h-[27px] animate-in fade-in zoom-in-95 duration-200">
                                            <span className="text-[9px] text-orange-400 uppercase font-bold text-center">
                                                Max {indexChartMetric === 'expl' ? 'Expl' : 'Sec'}
                                            </span>
                                            <input type="number" min="1"
                                                value={indexChartMetric === 'expl' ? runMaxExpl : runMaxTime}
                                                onChange={e => {
                                                    const val = Math.max(1, parseInt(e.target.value) || 1);
                                                    if (indexChartMetric === 'expl') { setRunMaxExpl(val); saveConfig({ index_run_max_expl: val }); }
                                                    else { setRunMaxTime(val); saveConfig({ index_run_max_time: val }); }
                                                }}
                                                className="w-8 bg-transparent border-none text-[10px] text-white text-center focus:outline-none font-bold" />
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex-1" />
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider pr-1">
                                Progress Overview
                            </div>
                        </div>
                        <div className="h-[150px]">
                            <RunChart
                                yValues={indexChartData}
                                chartColor={indexChartMetric === 'expl' ? '#22d3ee' : '#a78bfa'}
                                title={indexChartMetric === 'expl' ? (indexChartMode === 'run' ? 'Expl' : 'Avg Expl') : (indexChartMode === 'run' ? 'Time' : 'Avg Time')}
                                groupSize={activeIndexChartGroup}
                                showTrend={true}
                            />
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1 custom-scrollbar">
                    {filteredList.map((row, idx) => {
                        const winRate = row.count > 0 ? (row.success_count / row.count * 100).toFixed(1) : '0';
                        const density = row.duration_sec > 0 ? (row.play_time_sec / row.duration_sec * 100).toFixed(0) : '0';

                        return (
                            <div key={`${row.type}-${row.id}`}
                                className="group flex flex-col p-3 rounded-lg bg-gray-800/40 hover:bg-gray-800/70 border border-gray-700/30 hover:border-gray-600/50 transition-all cursor-pointer"
                                onClick={() => loadDetail(sessionList.findIndex(s => s.id === row.id && s.type === row.type))}>
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`p-2 rounded-lg shrink-0 ${row.type === 'file' ? 'bg-blue-500/10 text-blue-400' : 'bg-orange-500/10 text-orange-400'}`}>
                                            {row.type === 'file' ? (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9l-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            )}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <div className="text-sm font-bold text-gray-100 truncate lg:w-[240px] w-[180px]">
                                                {row.id}
                                            </div>
                                            <div className="text-[11px] text-gray-500">
                                                {formatDate(row.start_time)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6 shrink-0 ml-4">
                                        <div className="flex flex-col w-12 text-center">
                                            <div className="text-[13px] text-gray-200 font-medium tracking-tight">{row.count}</div>
                                            <div className="text-[10px] text-gray-500 uppercase font-medium">Runs</div>
                                        </div>

                                        <div className="flex flex-col min-w-[75px]">
                                            <div className="text-[13px] text-gray-200 font-medium whitespace-nowrap">{formatDuration(row.duration_sec)}</div>
                                            <div className="text-[10px] text-gray-500 font-medium uppercase flex items-center gap-1 group/density cursor-help"
                                                title={`Play Density: ${density}%\nPercentage of run time vs session duration.\nHigher % means more active practice and less idle time.`}>
                                                Time
                                                {row.play_time_sec > 0 && (
                                                    <span className="text-blue-500/70">• {density}%</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-col min-w-[65px]">
                                            <div className={`text-[13px] font-bold ${row.success_count > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                                                {winRate}%
                                            </div>
                                            <div className="text-[10px] text-gray-500 uppercase font-medium">Success</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-1 pt-2 border-t border-gray-700/20">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-gray-500 uppercase">Win / Fail</span>
                                        <span className="text-[11px] font-bold text-gray-300">
                                            <span className="text-green-400/90">{row.success_count}</span>
                                            <span className="mx-1 text-gray-600">/</span>
                                            <span className="text-red-400/90">{row.count - row.success_count}</span>
                                        </span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-gray-500 uppercase truncate">Best/Avg Expl</span>
                                        <span className={`text-[11px] font-bold ${row.best_expl ? 'text-cyan-400' : 'text-gray-500'}`}>
                                            {row.best_expl || '-'} / {row.avg_expl ? row.avg_expl.toFixed(1) : '-'}
                                        </span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-gray-500 uppercase truncate">Best/Avg Time</span>
                                        <span className={`text-[11px] font-bold ${row.best_time ? 'text-yellow-400' : 'text-gray-500'}`}>
                                            {row.best_time ? `${row.best_time.toFixed(1)}s` : '-'} / {row.avg_time ? `${row.avg_time.toFixed(1)}s` : '-'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {filteredList.length === 0 && (
                        <div className="text-center py-20 bg-gray-900/40 rounded-xl border border-dashed border-gray-800">
                            <p className="text-gray-500 text-sm">No sessions found.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden pt-1 px-1">
            <div className="flex items-center gap-3 mb-3 shrink-0">
                <button onClick={() => setViewMode('list')}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5">
                    <span>←</span> Index
                </button>

                <div className="flex bg-gray-800 rounded-lg overflow-hidden border border-gray-700/50">
                    <button onClick={() => currentIndex > 0 && loadDetail(currentIndex - 1)}
                        disabled={currentIndex <= 0}
                        className="px-4 py-1.5 hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-lg flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="w-[1px] bg-gray-700/50" />
                    <button onClick={() => currentIndex < filteredList.length - 1 && loadDetail(currentIndex + 1)}
                        disabled={currentIndex >= filteredList.length - 1}
                        className="px-4 py-1.5 hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-lg flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>

                <h2 className="text-sm font-bold truncate flex-1 leading-tight text-gray-300">
                    {currentSession?.id}
                </h2>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold uppercase tracking-wider">
                    {currentSession?.type === 'split' ? 'Split' : 'Log'}
                </span>
            </div>

            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-3 shrink-0">
                <StatCard label="Total Runs" value={stats.total} />
                <StatCard label="Time Est" value={formatDuration(stats.durationSec)} color="text-gray-200" />
                <StatCard
                    label="Density"
                    value={`${stats.playDensity.toFixed(1)}%`}
                    color="text-blue-400"
                    tooltip="Play Density: Percentage of actual run time against total session duration. Higher % means a higher concentration of practice and less idle time."
                />
                <StatCard label="Success %" value={`${stats.rate.toFixed(1)}%`} color={stats.rate > 20 ? 'text-green-400' : 'text-orange-400'} />
                <StatCard label="Win / Fail" value={stats.wins} equalValue={stats.fails} color="text-green-400" equalColor="text-red-400" />
                <StatCard label="Deaths" value={stats.deaths} color="text-red-500" />
                <StatCard label="Best/Avg Expl"
                    value={stats.bestExpl > 0 ? `${stats.bestExpl} Best` : '-'}
                    equalValue={stats.avgExpl > 0 ? `${stats.avgExpl.toFixed(1)} Avg` : ''}
                    color="text-cyan-400" />
                <StatCard label="Best/Avg Time"
                    value={stats.bestTime > 0 ? `${stats.bestTime.toFixed(2)}s PB` : '-'}
                    equalValue={stats.avgTime > 0 ? `${stats.avgTime.toFixed(1)}s Avg` : ''}
                    color="text-yellow-400" />
            </div>

            <div className="flex items-center gap-2 mb-2 flex-wrap shrink-0 pr-1">
                <div className="flex bg-gray-800 rounded-lg overflow-hidden text-sm border border-gray-700/50">
                    <button onClick={() => setChartMode('expl')}
                        className={`px-3 py-1.5 transition-colors ${chartMode === 'expl' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>Expl</button>
                    <button onClick={() => setChartMode('time')}
                        className={`px-3 py-1.5 transition-colors ${chartMode === 'time' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>Time</button>
                </div>
                <button onClick={() => setShowTrend(v => !v)}
                    title="Toggle Trend Line"
                    className={`p-2 rounded transition-all border ${showTrend ? 'bg-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-900/40' : 'bg-gray-800 border-gray-700/50 text-gray-500 hover:border-gray-600'}`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                </button>
                <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700/50 rounded px-2 py-1.5 leading-none">
                    <span className="text-[9px] text-gray-500 uppercase font-black">Group</span>
                    <input type="number" min="1" value={groupSize}
                        onChange={e => setGroupSize(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-8 bg-transparent border-none text-[11px] text-white text-center focus:outline-none font-black" />
                </div>

                <div className="flex-1" />

                <button onClick={() => setHideFails(v => !v)}
                    title={hideFails ? "Showing Wins Only" : "Showing All Runs"}
                    className={`p-2 rounded transition-all border ${hideFails ? 'bg-red-700 border-red-500 text-white shadow-lg shadow-red-900/40' : 'bg-gray-800 border-gray-700/50 text-gray-500 hover:border-gray-600'}`}>
                    {hideFails ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                    ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.04m5.882-5.903A9.972 9.972 0 0112 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-1.124 0-2.193-.182-3.192-.518M11.332 11.332L15 15M9 15L12.668 11.332" />
                        </svg>
                    )}
                </button>
                <button onClick={() => !hideFails && setHideWL(v => !v)}
                    disabled={hideFails}
                    className={`p-2 rounded transition-all border ${hideWL ? 'bg-orange-700 border-orange-500 text-white shadow-lg shadow-orange-900/40' : 'bg-gray-800 border-gray-700/50 text-gray-500 hover:border-gray-600'} ${hideFails ? 'opacity-30 cursor-not-allowed grayscale' : ''}`}
                    title={hideFails ? "Redundant when Hide Fails is active" : "Hide World Loads"}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                </button>

                <select value={sortMode} onChange={e => setSortMode(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-gray-500 hover:border-gray-600 transition-colors">
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="fastest">Fastest Time</option>
                    <option value="least_expl">Least Expl</option>
                    <option value="highest_y">Highest Y</option>
                    <option value="lowest_y">Lowest Y</option>
                </select>

                <button
                    onClick={() => {
                        const next = !showDist;
                        setShowDist(next);
                        saveConfig({ show_dist_chart: next });
                    }}
                    title="Toggle Explosive Distribution Chart"
                    className={`text-[11px] font-bold px-2.5 py-1.5 rounded transition-all border ${showDist ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-900/40' : 'bg-gray-800 border-gray-700/50 text-gray-500 hover:border-gray-600'}`}>
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    EXPL DIST
                </button>
            </div>

            <div className={`shrink-0 flex gap-2 mb-2 ${showDist ? 'h-[160px]' : 'h-[200px]'}`}>
                <div className="flex-1 min-w-0">
                    <RunChart
                        yValues={chartValues}
                        chartColor={chartMode === 'expl' ? '#22d3ee' : '#a78bfa'}
                        title={chartMode === 'expl' ? 'Expl.' : 'Time'}
                        groupSize={groupSize}
                        showTrend={showTrend}
                    />
                </div>
                {showDist && (
                    <div className="w-[200px] shrink-0">
                        <DistChart data={distData} />
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-auto min-h-0 custom-scrollbar">
                <table className="text-xs border-separate border-spacing-0">
                    <thead className="sticky top-0 bg-gray-900 border-b border-gray-800 shadow-sm z-10">
                        <tr className="text-gray-500 text-left uppercase tracking-wider font-bold">
                            <th className="py-2.5 px-2 w-[80px]">Expl</th>
                            <th className="py-2.5 px-2 w-[100px]">Time</th>
                            <th className="py-2.5 px-2 w-[100px]">Bed</th>
                            <th className="py-2.5 px-2 w-[120px]">Tower</th>
                            <th className="py-2.5 px-2 w-[200px]">Type</th>
                            <th className="py-2.5 px-2 text-center w-[60px]">Y</th>
                            <th className="py-2.5 px-2 text-right w-[120px]">Date</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/20">
                        {displayRuns.map((run, i) => {
                            const isSuccess = Boolean(run[C.is_success]);
                            const rowColor = isSuccess ? 'text-gray-200' : 'text-red-400/80';
                            return (
                                <tr key={run[C.id] || i} className={`${rowColor} hover:bg-gray-800/30 transition-colors group`}>
                                    <td className="py-2 px-2 font-bold">{isSuccess ? (run[C.explosives] || '-') : (run[C.fail_reason] || 'Fail')}</td>
                                    <td className="py-2 px-2 font-mono">{(run[C.time_sec] || 0).toFixed(isSuccess ? 2 : 1)}s</td>
                                    <td className={`py-2 px-2 ${run[C.bed_time] ? 'text-orange-300' : 'text-gray-600'}`}>
                                        {run[C.bed_time] ? `${run[C.bed_time].toFixed(2)}s` : '-'}
                                    </td>
                                    <td className="py-2 px-2 text-gray-400">{run[C.tower] || '-'}</td>
                                    <td className="py-2 px-2 text-gray-400">{run[C.type] !== 'Unknown' ? run[C.type] : '-'}</td>
                                    <td className="py-2 px-2 text-center font-mono text-gray-500 group-hover:text-gray-300 transition-colors">{run[C.height] > 0 ? run[C.height] : '-'}</td>
                                    <td className="py-2 px-2 text-right text-gray-500 font-mono text-[10px]">{formatDate(run[C.timestamp])}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
