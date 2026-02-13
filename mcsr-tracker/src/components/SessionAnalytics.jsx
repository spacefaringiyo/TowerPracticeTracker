import { useState, useMemo } from 'react';
import { getSessionIndex, getRunsBySession } from '../db/queries';
import RunChart from './shared/RunChart';

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

function StatCard({ label, value, color = 'text-white' }) {
    return (
        <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
            <p className={`text-sm font-bold ${color}`}>{value}</p>
        </div>
    );
}

export default function SessionAnalytics({ refreshKey }) {
    const [viewMode, setViewMode] = useState('list');
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [showSplitsOnly, setShowSplitsOnly] = useState(false);
    const [chartMode, setChartMode] = useState('expl');
    const [showTrend, setShowTrend] = useState(false);
    const [hideFails, setHideFails] = useState(false);
    const [hideWL, setHideWL] = useState(false);
    const [sortMode, setSortMode] = useState('newest');
    const [groupSize, setGroupSize] = useState(1);

    const sessionList = useMemo(() => getSessionIndex(), [refreshKey]);

    const filteredList = useMemo(() => {
        if (showSplitsOnly) return sessionList.filter(s => s.type === 'split');
        return sessionList;
    }, [sessionList, showSplitsOnly]);

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

    // Apply filters and sort
    const displayRuns = useMemo(() => {
        let runs = [...sessionRuns];
        if (hideFails) runs = runs.filter(r => r[C.is_success]);
        if (hideWL) runs = runs.filter(r => r[C.fail_reason] !== 'World Load');
        if (sortMode === 'newest') runs.sort((a, b) => b[C.timestamp].localeCompare(a[C.timestamp]));
        else if (sortMode === 'oldest') runs.sort((a, b) => a[C.timestamp].localeCompare(b[C.timestamp]));
        else if (sortMode === 'fastest') {
            const succ = runs.filter(r => r[C.is_success]).sort((a, b) => a[C.time_sec] - b[C.time_sec]);
            const fail = runs.filter(r => !r[C.is_success]);
            runs = [...succ, ...fail];
        }
        return runs;
    }, [sessionRuns, hideFails, hideWL, sortMode]);

    const chartValues = useMemo(() => {
        const successes = sessionRuns.filter(r => r[C.is_success]).reverse();
        if (chartMode === 'expl') return successes.map(r => r[C.total_explosives]).filter(v => v > 0);
        return successes.map(r => r[C.time_sec]);
    }, [sessionRuns, chartMode]);

    // Stats
    const stats = useMemo(() => {
        const successes = sessionRuns.filter(r => r[C.is_success]);
        const fails = sessionRuns.filter(r => !r[C.is_success]);
        return {
            total: sessionRuns.length,
            successes: successes.length,
            fails: fails.length,
            bestTime: successes.length > 0 ? Math.min(...successes.map(r => r[C.time_sec])) : 0,
            avgTime: successes.length > 0 ? successes.reduce((s, r) => s + r[C.time_sec], 0) / successes.length : 0,
            bestExpl: successes.length > 0 ? Math.min(...successes.map(r => r[C.total_explosives])) : 0,
        };
    }, [sessionRuns]);

    // ======== LIST VIEW ========
    if (viewMode === 'list') {
        return (
            <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-lg font-bold">Sessions</h2>
                    <div className="flex-1" />
                    <button onClick={() => setShowSplitsOnly(v => !v)}
                        className={`text-xs px-3 py-1 rounded-full ${showSplitsOnly ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                        Splits Only
                    </button>
                </div>
                <div className="flex-1 overflow-auto min-h-0">
                    <div className="space-y-1">
                        {filteredList.map((session, i) => (
                            <button key={`${session.type}-${session.id}`}
                                onClick={() => loadDetail(i)}
                                className="w-full bg-gray-800/40 hover:bg-gray-800 rounded-lg p-3 text-left transition-colors border border-gray-700/30 hover:border-gray-600">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
                                        {session.type === 'split' ? '✂️ Split' : '📄 Log'}
                                    </span>
                                    <span className="text-xs text-gray-200 font-medium truncate flex-1">{session.id}</span>
                                </div>
                                <div className="flex gap-3 text-[11px] text-gray-400">
                                    <span>{session.count} runs</span>
                                    <span className="text-green-400">{session.success_count} wins</span>
                                    <span>{formatDate(session.start_time)}</span>
                                </div>
                            </button>
                        ))}
                        {filteredList.length === 0 && (
                            <p className="text-gray-500 text-sm text-center py-8">No sessions yet</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ======== DETAIL VIEW ========
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setViewMode('list')} className="text-gray-400 hover:text-white text-sm">← Back</button>
                <button onClick={() => currentIndex > 0 && loadDetail(currentIndex - 1)}
                    disabled={currentIndex <= 0} className="text-gray-400 hover:text-white disabled:text-gray-700 text-xs">◀</button>
                <button onClick={() => currentIndex < filteredList.length - 1 && loadDetail(currentIndex + 1)}
                    disabled={currentIndex >= filteredList.length - 1} className="text-gray-400 hover:text-white disabled:text-gray-700 text-xs">▶</button>
                <h2 className="text-sm font-bold truncate flex-1">{currentSession?.id}</h2>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
                    {currentSession?.type === 'split' ? '✂️ Split' : '📄 Log'}
                </span>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-1.5 mb-2">
                <StatCard label="Total" value={stats.total} />
                <StatCard label="Wins" value={stats.successes} color="text-green-400" />
                <StatCard label="Fails" value={stats.fails} color="text-red-400" />
                <StatCard label="Best Time" value={stats.bestTime > 0 ? `${stats.bestTime.toFixed(2)}s` : '-'} color="text-cyan-400" />
                <StatCard label="Avg Time" value={stats.avgTime > 0 ? `${stats.avgTime.toFixed(1)}s` : '-'} />
                <StatCard label="Best Expl" value={stats.bestExpl > 0 ? stats.bestExpl : '-'} color="text-yellow-400" />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                <div className="flex bg-gray-800 rounded-lg overflow-hidden text-xs">
                    <button onClick={() => setChartMode('expl')}
                        className={`px-3 py-1 ${chartMode === 'expl' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Expl</button>
                    <button onClick={() => setChartMode('time')}
                        className={`px-3 py-1 ${chartMode === 'time' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Time</button>
                </div>
                <button onClick={() => setShowTrend(v => !v)}
                    className={`text-xs px-2 py-1 rounded ${showTrend ? 'text-cyan-400' : 'text-gray-400'}`}>📈</button>
                <button onClick={() => setHideFails(v => !v)}
                    className={`text-xs px-2 py-1 rounded ${hideFails ? 'text-red-400' : 'text-gray-400'}`}>
                    {hideFails ? '🔍' : '👁️'}
                </button>
                <button onClick={() => setHideWL(v => !v)}
                    className={`text-xs px-2 py-1 rounded ${hideWL ? 'text-orange-400' : 'text-gray-400'}`}
                    title="Hide World Loads">🌍</button>
                <input type="number" min="1" value={groupSize}
                    onChange={e => setGroupSize(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-center" />
                <div className="flex-1" />
                <select value={sortMode} onChange={e => setSortMode(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="fastest">Fastest</option>
                </select>
            </div>

            {/* Chart */}
            <RunChart yValues={chartValues} chartColor={chartMode === 'expl' ? '#22d3ee' : '#a78bfa'}
                title={chartMode === 'expl' ? 'Expl.' : 'Time'} groupSize={groupSize} showTrend={showTrend} />

            {/* Run List */}
            <div className="flex-1 overflow-auto min-h-0 mt-2">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-900">
                        <tr className="text-gray-400 text-left">
                            <th className="py-1.5 px-1">Expl</th>
                            <th className="py-1.5 px-1">Time</th>
                            <th className="py-1.5 px-1">Bed</th>
                            <th className="py-1.5 px-1">Tower</th>
                            <th className="py-1.5 px-1">Type</th>
                            <th className="py-1.5 px-1">Y</th>
                            <th className="py-1.5 px-1">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayRuns.map((run, i) => {
                            const isSuccess = Boolean(run[C.is_success]);
                            const rowColor = isSuccess ? 'text-gray-200' : 'text-red-400';
                            return (
                                <tr key={run[C.id] || i} className={`${rowColor} border-b border-gray-800/30`}>
                                    <td className="py-1.5 px-1 font-semibold">{isSuccess ? run[C.explosives] : (run[C.fail_reason] || 'Fail')}</td>
                                    <td className="py-1.5 px-1">{(run[C.time_sec] || 0).toFixed(isSuccess ? 2 : 1)}s</td>
                                    <td className={`py-1.5 px-1 ${run[C.bed_time] ? 'text-orange-300' : 'text-gray-500'}`}>
                                        {run[C.bed_time] ? `${run[C.bed_time].toFixed(2)}s` : '-'}
                                    </td>
                                    <td className="py-1.5 px-1">{run[C.tower] !== 'Unknown' ? run[C.tower] : '-'}</td>
                                    <td className="py-1.5 px-1">{run[C.type] !== 'Unknown' ? run[C.type] : '-'}</td>
                                    <td className="py-1.5 px-1">{run[C.height] > 0 ? run[C.height] : '-'}</td>
                                    <td className="py-1.5 px-1 text-gray-500">{formatDate(run[C.timestamp])}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
