import { useState, useMemo, useEffect } from 'react';
import { getTowerStats, getRunsByTower, getPbsMap } from '../db/queries';
import { loadConfig, saveConfig } from '../utils/config';
import RunChart from './shared/RunChart';
import FilterChips from './shared/FilterChips';
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

export default function TowerAnalytics({ refreshKey, detailRequest }) {
    const [viewMode, setViewMode] = useState('grid');
    const [currentTower, setCurrentTower] = useState(null);
    const [gridSort, setGridSort] = useState('count');
    const [detailSort, setDetailSort] = useState('newest');
    const [chartMode, setChartMode] = useState('expl');
    const [showTrend, setShowTrend] = useState(false);
    const [groupSize, setGroupSize] = useState(1);
    const [activeTypes, setActiveTypes] = useState(new Set());

    // Handle navigation from RecentRuns click
    useEffect(() => {
        if (detailRequest?.tower) {
            showDetail(detailRequest.tower, detailRequest.filterType);
        }
    }, [detailRequest?.key]);

    const towerStats = useMemo(() => getTowerStats(), [refreshKey]);
    const pbMap = useMemo(() => getPbsMap(), [refreshKey]);

    const sortedStats = useMemo(() => {
        const stats = [...towerStats];
        // 0:tower, 1:min_time, 2:avg_time, 3:min_expl, 4:avg_expl, 5:count
        if (gridSort === 'name') stats.sort((a, b) => a[0].localeCompare(b[0]));
        else if (gridSort === 'best') stats.sort((a, b) => a[1] - b[1]);
        else stats.sort((a, b) => b[5] - a[5]); // count desc (index 5)
        return stats;
    }, [towerStats, gridSort]);

    const showDetail = (towerName, filterType = null) => {
        setCurrentTower(towerName);
        setViewMode('detail');
        setDetailSort('newest');
        setChartMode('expl');
        setGroupSize(1);

        const runs = getRunsByTower(towerName);
        const types = [...new Set(runs.filter(r => r[C.is_success]).map(r => r[C.type]))];
        if (filterType && types.includes(filterType)) {
            setActiveTypes(new Set([filterType]));
        } else {
            setActiveTypes(new Set(types));
        }
    };

    // Detail view data
    const allRuns = useMemo(() => {
        if (viewMode !== 'detail' || !currentTower) return [];
        return getRunsByTower(currentTower);
    }, [viewMode, currentTower, refreshKey]);

    const allTypes = useMemo(() => {
        return [...new Set(allRuns.filter(r => r[C.is_success]).map(r => r[C.type]))];
    }, [allRuns]);

    const filteredRuns = useMemo(() => {
        let runs = allRuns.filter(r => r[C.is_success] && activeTypes.has(r[C.type]));
        if (detailSort === 'newest') runs = [...runs].sort((a, b) => b[C.timestamp].localeCompare(a[C.timestamp]));
        else if (detailSort === 'oldest') runs = [...runs].sort((a, b) => a[C.timestamp].localeCompare(b[C.timestamp]));
        else if (detailSort === 'fastest') runs = [...runs].sort((a, b) => a[C.time_sec] - b[C.time_sec]);
        else if (detailSort === 'expl') runs = [...runs].sort((a, b) => a[C.total_explosives] - b[C.total_explosives]);
        return runs;
    }, [allRuns, activeTypes, detailSort]);

    const chartValues = useMemo(() => {
        const chronological = allRuns.filter(r => r[C.is_success] && activeTypes.has(r[C.type]));
        if (chartMode === 'expl') return chronological.map(r => r[C.total_explosives]).filter(v => v > 0);
        return chronological.map(r => r[C.time_sec]);
    }, [allRuns, activeTypes, chartMode]);

    const toggleType = (t) => {
        setActiveTypes(prev => {
            const next = new Set(prev);
            if (next.has(t)) { if (next.size > 1) next.delete(t); }
            else next.add(t);
            return next;
        });
    };

    // ======== GRID VIEW ========
    if (viewMode === 'grid') {
        return (
            <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-lg font-bold">Towers</h2>
                    <div className="flex-1" />
                    <select value={gridSort} onChange={e => setGridSort(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
                        <option value="count">Sort: Count</option>
                        <option value="best">Sort: Best Time</option>
                        <option value="name">Sort: Name</option>
                    </select>
                </div>
                <div className="flex-1 overflow-auto min-h-0">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 p-2">
                        {sortedStats.map(([tower, bestTime, avgTime, bestExpl, avgExpl, count]) => (
                            <button key={tower}
                                onClick={() => showDetail(tower)}
                                className="bg-gray-800/80 hover:bg-gray-800 rounded-xl p-4 text-center transition-all border border-gray-700/50 hover:border-blue-500/50 flex flex-col items-center gap-2 group relative overflow-hidden">

                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                <h3 className="text-xl font-bold text-gray-100 tracking-wide mb-1">{tower}</h3>

                                <div className="grid grid-cols-2 gap-x-8 gap-y-2 w-full max-w-[240px]">
                                    {/* Explosives Column */}
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Best Expl</span>
                                        <span className="text-xl font-bold text-cyan-400 leading-none">{bestExpl}</span>
                                        <div className="h-1" />
                                        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Avg Expl</span>
                                        <span className="text-lg font-bold text-gray-300 leading-none">{avgExpl.toFixed(1)}</span>
                                    </div>

                                    {/* Time Column */}
                                    <div className="flex flex-col items-center border-l border-gray-700/50 pl-8">
                                        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Best Time</span>
                                        <span className="text-xl font-bold text-amber-400 leading-none">{bestTime.toFixed(1)}s</span>
                                        <div className="h-1" />
                                        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Avg Time</span>
                                        <span className="text-lg font-bold text-gray-300 leading-none">{avgTime.toFixed(1)}s</span>
                                    </div>
                                </div>

                                <div className="flex-1" />
                                <div className="mt-2 text-xs font-medium text-gray-500 bg-gray-900/50 px-3 py-1 rounded-full">
                                    {count} Successful Runs
                                </div>
                            </button>
                        ))}
                        {sortedStats.length === 0 && (
                            <p className="text-gray-500 text-sm col-span-3 text-center py-8">No tower data yet</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ======== DETAIL VIEW ========
    const successes = filteredRuns;
    const totalRuns = allRuns.filter(r => activeTypes.has(r[C.type]) || !r[C.is_success]).length;
    const bestTime = successes.length > 0 ? Math.min(...successes.map(r => r[C.time_sec])) : 0;
    const bestExpl = successes.length > 0 ? Math.min(...successes.map(r => r[C.total_explosives])) : 0;
    const avgExpl = successes.length > 0 ? successes.reduce((s, r) => s + r[C.total_explosives], 0) / successes.length : 0;

    // Navigation Logic
    const currentIndex = sortedStats.findIndex(s => s[0] === currentTower);
    const prevTower = currentIndex > 0 ? sortedStats[currentIndex - 1][0] : null;
    const nextTower = currentIndex < sortedStats.length - 1 ? sortedStats[currentIndex + 1][0] : null;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
                <button onClick={() => setViewMode('grid')}
                    className="text-gray-400 hover:text-white transition-colors text-sm font-medium mr-2">← Back</button>

                <button onClick={() => prevTower && showDetail(prevTower)} disabled={!prevTower}
                    className="text-gray-400 hover:text-white disabled:text-gray-700 text-lg px-2">◀</button>

                <button onClick={() => nextTower && showDetail(nextTower)} disabled={!nextTower}
                    className="text-gray-400 hover:text-white disabled:text-gray-700 text-lg px-2">▶</button>

                <h2 className="text-xl font-bold">{currentTower}</h2>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
                <StatCard label="Total Runs" value={successes.length} />
                <StatCard label="Best Expl" value={bestExpl > 0 ? bestExpl : '-'} color="text-cyan-400" />
                <StatCard label="Avg Expl" value={avgExpl > 0 ? avgExpl.toFixed(1) : '-'} color="text-blue-300" />
                <StatCard label="Best Time" value={bestTime > 0 ? `${bestTime.toFixed(2)}s` : '-'} color="text-yellow-400" />
            </div>

            {/* Filters */}
            <FilterChips items={allTypes} activeSet={activeTypes} onToggle={toggleType} label="Type:" />

            {/* Controls */}
            <div className="flex items-center gap-2 my-2 flex-wrap">
                <div className="flex bg-gray-800 rounded-lg overflow-hidden text-sm">
                    <button onClick={() => setChartMode('expl')}
                        className={`px-3 py-1 ${chartMode === 'expl' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Expl</button>
                    <button onClick={() => setChartMode('time')}
                        className={`px-3 py-1 ${chartMode === 'time' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Time</button>
                </div>
                <button onClick={() => setShowTrend(v => !v)}
                    className={`text-sm px-2 py-1 rounded ${showTrend ? 'text-cyan-400' : 'text-gray-400'}`}>📈</button>
                <input type="number" min="1" value={groupSize}
                    onChange={e => setGroupSize(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-center" title="Group" />
                <div className="flex-1" />
                <select value={detailSort} onChange={e => setDetailSort(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm">
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="fastest">Fastest</option>
                    <option value="expl">Best Expl</option>
                </select>
            </div>

            {/* Chart */}
            <RunChart yValues={chartValues} chartColor={chartMode === 'expl' ? '#22d3ee' : '#a78bfa'}
                title={chartMode === 'expl' ? 'Expl.' : 'Time'} groupSize={groupSize} showTrend={showTrend} />

            {/* Run List */}
            <div className="flex-1 overflow-auto min-h-0 mt-2">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-900">
                        <tr className="text-gray-400 text-left">
                            <th className="py-2 px-2">Expl</th>
                            <th className="py-2 px-2">Time</th>
                            <th className="py-2 px-2">Bed</th>
                            <th className="py-2 px-2">Type</th>
                            <th className="py-2 px-2">Y</th>
                            <th className="py-2 px-2">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {successes.map((run, i) => {
                            const isPB = pbMap[`${run[C.tower]}_${run[C.type]}`] === run[C.total_explosives];
                            return (
                                <tr key={run[C.id] || i}
                                    className={`${isPB ? 'text-yellow-400' : 'text-gray-200'} border-b border-gray-800/30 hover:bg-gray-800/20`}>
                                    <td className="py-2 px-2 font-semibold">{run[C.explosives]}</td>
                                    <td className="py-2 px-2">{(run[C.time_sec] || 0).toFixed(2)}s</td>
                                    <td className={`py-2 px-2 ${run[C.bed_time] ? 'text-orange-300' : 'text-gray-500'}`}>
                                        {run[C.bed_time] ? `${run[C.bed_time].toFixed(2)}s` : '-'}
                                    </td>
                                    <td className="py-2 px-2">{run[C.type]}</td>
                                    <td className="py-2 px-2">{run[C.height] > 0 ? run[C.height] : '-'}</td>
                                    <td className="py-2 px-2 text-gray-500">{formatDate(run[C.timestamp])}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
