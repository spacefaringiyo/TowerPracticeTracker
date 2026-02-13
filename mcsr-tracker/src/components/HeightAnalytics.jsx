import { useState, useMemo } from 'react';
import { getHeightStats, getRunsByHeight, getPbsMap } from '../db/queries';
import RunChart from './shared/RunChart';
import FilterChips from './shared/FilterChips';
import StatCard from './shared/StatCard';

const C = {
    id: 0, timestamp: 1, time_sec: 2, explosives: 3, total_explosives: 4,
    tower: 5, type: 6, height: 7, bed_time: 8, is_success: 9,
    fail_reason: 10
};

function formatDate(ts) {
    try {
        const dt = new Date(ts.replace(' ', 'T'));
        return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    } catch { return ts || ''; }
}

export default function HeightAnalytics({ refreshKey }) {
    const [viewMode, setViewMode] = useState('list');
    const [currentHeight, setCurrentHeight] = useState(null);
    const [listSort, setListSort] = useState('height');
    const [listSortDir, setListSortDir] = useState('asc');
    const [detailSort, setDetailSort] = useState('newest');
    const [chartMode, setChartMode] = useState('expl');
    const [showTrend, setShowTrend] = useState(false);
    const [groupSize, setGroupSize] = useState(1);
    const [activeTypes, setActiveTypes] = useState(new Set());
    const [activeTowers, setActiveTowers] = useState(new Set());

    const heightStats = useMemo(() => getHeightStats(), [refreshKey]);
    const pbMap = useMemo(() => getPbsMap(), [refreshKey]);

    const sortedStats = useMemo(() => {
        const stats = [...heightStats];
        // 0:height, 1:count, 2:bestTime, 3:avgTime, 4:bestExpl, 5:avgExpl
        const dir = listSortDir === 'asc' ? 1 : -1;
        if (listSort === 'height') stats.sort((a, b) => (a[0] - b[0]) * dir);
        else if (listSort === 'count') stats.sort((a, b) => (a[1] - b[1]) * dir);
        else if (listSort === 'time') stats.sort((a, b) => (a[2] - b[2]) * dir);
        else if (listSort === 'expl') stats.sort((a, b) => (a[4] - b[4]) * dir);
        return stats;
    }, [heightStats, listSort, listSortDir]);

    const showDetail = (height) => {
        setCurrentHeight(height);
        setViewMode('detail');

        const runs = getRunsByHeight(height);
        const types = [...new Set(runs.map(r => r[C.type]))];
        const towers = [...new Set(runs.map(r => r[C.tower]))];
        setActiveTypes(new Set(types));
        setActiveTowers(new Set(towers));
    };

    // Detail data
    const allRuns = useMemo(() => {
        if (viewMode !== 'detail' || currentHeight === null) return [];
        return getRunsByHeight(currentHeight);
    }, [viewMode, currentHeight, refreshKey]);

    const allTypes = useMemo(() => [...new Set(allRuns.map(r => r[C.type]))], [allRuns]);
    const allTowers = useMemo(() => [...new Set(allRuns.map(r => r[C.tower]))], [allRuns]);

    const filteredRuns = useMemo(() => {
        let runs = allRuns.filter(r => activeTypes.has(r[C.type]) && activeTowers.has(r[C.tower]));
        if (detailSort === 'newest') runs.sort((a, b) => b[C.timestamp].localeCompare(a[C.timestamp]));
        else if (detailSort === 'oldest') runs.sort((a, b) => a[C.timestamp].localeCompare(b[C.timestamp]));
        else if (detailSort === 'fastest') runs.sort((a, b) => a[C.time_sec] - b[C.time_sec]);
        else if (detailSort === 'expl') runs.sort((a, b) => a[C.total_explosives] - b[C.total_explosives]);
        return runs;
    }, [allRuns, activeTypes, activeTowers, detailSort]);

    const chartValues = useMemo(() => {
        const filtered = allRuns.filter(r => activeTypes.has(r[C.type]) && activeTowers.has(r[C.tower]));
        if (chartMode === 'expl') return filtered.map(r => r[C.total_explosives]).filter(v => v > 0);
        return filtered.map(r => r[C.time_sec]);
    }, [allRuns, activeTypes, activeTowers, chartMode]);

    // Build relationship maps
    const { towerToTypes, typeToTowers } = useMemo(() => {
        const t2type = {};
        const type2t = {};
        for (const r of allRuns) {
            const tower = r[C.tower];
            const type = r[C.type];
            if (!tower || !type) continue;

            if (!t2type[tower]) t2type[tower] = new Set();
            t2type[tower].add(type);

            if (!type2t[type]) type2t[type] = new Set();
            type2t[type].add(tower);
        }
        return { towerToTypes: t2type, typeToTowers: type2t };
    }, [allRuns]);

    const toggleType = (t) => {
        const nextTypes = new Set(activeTypes);
        const nextTowers = new Set(activeTowers);

        if (nextTypes.has(t)) {
            nextTypes.delete(t);
            // If removing type, check if associated towers have any remaining active types
            const assocTowers = typeToTowers[t] || new Set();
            for (const tower of assocTowers) {
                if (nextTowers.has(tower)) {
                    const towerTypes = towerToTypes[tower] || new Set();
                    let hasOtherActive = false;
                    for (const tt of towerTypes) {
                        if (nextTypes.has(tt)) { hasOtherActive = true; break; }
                    }
                    if (!hasOtherActive) nextTowers.delete(tower);
                }
            }
        } else {
            nextTypes.add(t);
            // Add all associated towers
            const assocTowers = typeToTowers[t] || new Set();
            for (const tower of assocTowers) nextTowers.add(tower);
        }
        setActiveTypes(nextTypes);
        setActiveTowers(nextTowers);
    };

    const toggleTower = (t) => {
        const nextTowers = new Set(activeTowers);
        const nextTypes = new Set(activeTypes);

        if (nextTowers.has(t)) {
            nextTowers.delete(t);
            // If removing tower, check if associated types have any remaining active towers
            const assocTypes = towerToTypes[t] || new Set();
            for (const type of assocTypes) {
                if (nextTypes.has(type)) {
                    const typeTowers = typeToTowers[type] || new Set();
                    let hasOtherActive = false;
                    for (const tt of typeTowers) {
                        if (nextTowers.has(tt)) { hasOtherActive = true; break; }
                    }
                    if (!hasOtherActive) nextTypes.delete(type);
                }
            }
        } else {
            nextTowers.add(t);
            // Add all associated types
            const assocTypes = towerToTypes[t] || new Set();
            for (const type of assocTypes) nextTypes.add(type);
        }
        setActiveTowers(nextTowers);
        setActiveTypes(nextTypes);
    };

    const toggleSortDir = () => setListSortDir(d => d === 'asc' ? 'desc' : 'asc');

    // ======== LIST VIEW ========
    if (viewMode === 'list') {
        return (
            <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-lg font-bold">Heights</h2>
                    <div className="flex-1" />
                    <select value={listSort} onChange={e => setListSort(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
                        <option value="height">Sort: Height</option>
                        <option value="count">Sort: Count</option>
                        <option value="time">Sort: Best Time</option>
                        <option value="expl">Sort: Best Expl</option>
                    </select>
                    <button onClick={toggleSortDir}
                        className="text-gray-400 hover:text-white text-xs px-2 py-1 bg-gray-800 rounded">
                        {listSortDir === 'asc' ? '↑' : '↓'}
                    </button>
                </div>
                <div className="flex-1 overflow-auto min-h-0">
                    <div className="space-y-1">
                        {sortedStats.map(([height, count, bestTime, avgTime, bestExpl, avgExpl]) => (
                            <button key={height}
                                onClick={() => showDetail(height)}
                                className="w-full bg-gray-800/40 hover:bg-gray-800 rounded-lg p-3 text-left transition-colors border border-gray-700/30 hover:border-gray-600">
                                <div className="flex items-center">
                                    <span className="text-base font-bold text-white w-16">Y{height}</span>

                                    <div className="flex-1 grid grid-cols-5 gap-2 items-center text-xs text-gray-400">
                                        <span className="col-span-1">{count} runs</span>

                                        {/* Explosives */}
                                        <div className="col-span-1 flex flex-col items-start pl-2 border-l border-gray-700/50">
                                            <span className="text-[10px] text-gray-500 uppercase">Best</span>
                                            <span className="text-cyan-400 font-bold text-sm">{bestExpl}</span>
                                        </div>
                                        <div className="col-span-1 flex flex-col items-start">
                                            <span className="text-[10px] text-gray-500 uppercase">Avg</span>
                                            <span className="text-blue-200 font-bold text-sm">{avgExpl.toFixed(1)}</span>
                                        </div>

                                        {/* Time */}
                                        <div className="col-span-1 flex flex-col items-start pl-2 border-l border-gray-700/50">
                                            <span className="text-[10px] text-gray-500 uppercase">Best</span>
                                            <span className="text-amber-400 font-bold text-sm">{bestTime.toFixed(1)}s</span>
                                        </div>
                                        <div className="col-span-1 flex flex-col items-start">
                                            <span className="text-[10px] text-gray-500 uppercase">Avg</span>
                                            <span className="text-yellow-200 font-bold text-sm">{avgTime.toFixed(1)}s</span>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                        {sortedStats.length === 0 && (
                            <p className="text-gray-500 text-sm text-center py-8">No height data yet</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ======== DETAIL VIEW ========
    const currentIndex = sortedStats.findIndex(s => s[0] === currentHeight);
    const prevHeight = currentIndex > 0 ? sortedStats[currentIndex - 1][0] : null;
    const nextHeight = currentIndex < sortedStats.length - 1 ? sortedStats[currentIndex + 1][0] : null;

    const successes = filteredRuns;
    const bestTime = successes.length > 0 ? Math.min(...successes.map(r => r[C.time_sec])) : 0;
    const avgTime = successes.length > 0 ? successes.reduce((s, r) => s + r[C.time_sec], 0) / successes.length : 0;
    const bestExpl = successes.length > 0 ? Math.min(...successes.map(r => r[C.total_explosives])) : 0;
    const avgExpl = successes.length > 0 ? successes.reduce((s, r) => s + r[C.total_explosives], 0) / successes.length : 0;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
                <button onClick={() => setViewMode('list')} className="text-gray-400 hover:text-white text-sm font-medium mr-2">← Back</button>

                <button onClick={() => prevHeight !== null && showDetail(prevHeight)} disabled={prevHeight === null}
                    className="text-gray-400 hover:text-white disabled:text-gray-700 text-lg px-2">◀</button>

                <button onClick={() => nextHeight !== null && showDetail(nextHeight)} disabled={nextHeight === null}
                    className="text-gray-400 hover:text-white disabled:text-gray-700 text-lg px-2">▶</button>

                <h2 className="text-lg font-bold">Height Y{currentHeight}</h2>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-6 gap-2 mb-3">
                <StatCard label="Total Runs" value={filteredRuns.length} />
                <StatCard label="Best Expl" value={bestExpl > 0 ? bestExpl : '-'} color="text-cyan-400" />
                <StatCard label="Avg Expl" value={avgExpl > 0 ? avgExpl.toFixed(1) : '-'} color="text-blue-300" />
                <StatCard label="Best Time" value={bestTime > 0 ? `${bestTime.toFixed(2)}s` : '-'} color="text-yellow-400" />
                <StatCard label="Avg Time" value={avgTime > 0 ? `${avgTime.toFixed(1)}s` : '-'} color="text-yellow-200" />
            </div>

            {/* Filters */}
            <div className="space-y-1.5 mb-2">
                <FilterChips items={allTypes} activeSet={activeTypes} onToggle={toggleType} label="Type:" />
                {allTowers.length > 1 && (
                    <FilterChips items={allTowers} activeSet={activeTowers} onToggle={toggleTower} label="Tower:" />
                )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
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
                    className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-center" />
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
                            <th className="py-2 px-2">Tower</th>
                            <th className="py-2 px-2">Type</th>
                            <th className="py-2 px-2">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRuns.map((run, i) => {
                            const isPB = pbMap[`${run[C.tower]}_${run[C.type]}`] === run[C.total_explosives];
                            return (
                                <tr key={run[C.id] || i}
                                    className={`${isPB ? 'text-yellow-400' : 'text-gray-200'} border-b border-gray-800/30 hover:bg-gray-800/20`}>
                                    <td className="py-2 px-2 font-semibold">{run[C.explosives]}</td>
                                    <td className="py-2 px-2">{(run[C.time_sec] || 0).toFixed(2)}s</td>
                                    <td className={`py-2 px-2 ${run[C.bed_time] ? 'text-orange-300' : 'text-gray-500'}`}>
                                        {run[C.bed_time] ? `${run[C.bed_time].toFixed(2)}s` : '-'}
                                    </td>
                                    <td className="py-2 px-2">{run[C.tower]}</td>
                                    <td className="py-2 px-2">{run[C.type]}</td>
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
