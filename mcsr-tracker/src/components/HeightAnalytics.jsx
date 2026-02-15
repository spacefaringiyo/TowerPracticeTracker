import { useState, useMemo, useEffect } from 'react';
import { getHeightStats, getRunsByHeight, getPbsMap } from '../db/queries';
import { loadConfig, saveConfig } from '../utils/config';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import RunChart from './shared/RunChart';
import DistChart from './shared/DistChart';
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

export default function HeightAnalytics({ refreshKey, detailRequest }) {
    const config = useMemo(() => loadConfig(), [refreshKey]);
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
    const [showIndexChart, setShowIndexChart] = useState(config.show_height_index_chart || false);
    const [showDist, setShowDist] = useState(config.show_height_dist || false);

    // Handle navigation from run clicks
    useEffect(() => {
        if (detailRequest?.height) {
            showDetail(detailRequest.height);
        }
    }, [detailRequest?.key]);

    const heightStats = useMemo(() => getHeightStats(), [refreshKey]);
    const pbMap = useMemo(() => getPbsMap(), [refreshKey]);

    const sortedStats = useMemo(() => {
        // [height, count, bestTime, avgTime, bestExpl, avgExpl]
        // Filter out 0.00s data
        let stats = heightStats.filter(s => s[2] > 0 && s[3] > 0);

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
        // Filter out 0.00s data
        return getRunsByHeight(currentHeight).filter(r => r[C.time_sec] > 0);
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

    const distData = useMemo(() => {
        const successes = allRuns.filter(r => activeTypes.has(r[C.type]) && activeTowers.has(r[C.tower]));
        if (successes.length === 0) return {};
        const counts = {};
        successes.forEach(r => {
            const expl = r[C.total_explosives] || 0;
            if (expl > 0) counts[expl] = (counts[expl] || 0) + 1;
        });
        const distribution = {};
        Object.keys(counts).forEach(expl => {
            distribution[expl] = {
                percentage: (counts[expl] / successes.length) * 100,
                runCount: counts[expl]
            };
        });
        return distribution;
    }, [allRuns, activeTypes, activeTowers]);

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
    const indexChartData = useMemo(() => {
        if (!showIndexChart) return [];
        // sortedStats: [height, count, bestTime, avgTime, bestExpl, avgExpl]
        return [...sortedStats].sort((a, b) => a[0] - b[0]).map(s => {
            const best = s[4];
            const avg = s[5];
            return {
                name: `Y${s[0]}`,
                best,
                gap: Math.max(0, avg - best),
                _avg: Number(avg.toFixed(1))
            };
        });
    }, [sortedStats, showIndexChart]);

    if (viewMode === 'list') {
        return (
            <div className="flex flex-col h-full overflow-hidden pt-1 px-1">
                <div className="flex items-center justify-between mb-4 shrink-0 pr-1">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-100">Heights Overview</h2>
                        <button
                            onClick={() => {
                                const next = !showIndexChart;
                                setShowIndexChart(next);
                                saveConfig({ show_height_index_chart: next });
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
                        <span className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Sort By</span>
                        <div className="flex bg-gray-800 border border-gray-700/50 rounded overflow-hidden">
                            <select value={listSort} onChange={e => setListSort(e.target.value)}
                                className="bg-transparent border-none px-2.5 py-1.5 text-[11px] text-gray-200 focus:outline-none hover:bg-gray-700 transition-colors font-medium cursor-pointer">
                                <option value="height">Height</option>
                                <option value="count">Most Runs</option>
                                <option value="time">Fastest Time</option>
                                <option value="expl">Best Expl</option>
                            </select>
                            <button onClick={toggleSortDir}
                                className="px-2 py-1.5 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors border-l border-gray-700/50 text-[10px]">
                                {listSortDir === 'asc' ? '↑' : '↓'}
                            </button>
                        </div>
                    </div>
                </div>

                {showIndexChart && (
                    <div className="mb-4 shrink-0 transition-all animate-in fade-in slide-in-from-top-2">
                        <div className="h-[150px] bg-black/30 rounded-xl p-3 border border-gray-800/50 shadow-inner">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={indexChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                                    <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '11px' }}
                                        formatter={(val, name, props) => {
                                            if (name === 'best') return [val, 'Best'];
                                            if (name === 'gap') return [props.payload._avg, 'Avg'];
                                            return [val, name];
                                        }}
                                    />
                                    <Bar dataKey="best" stackId="a" fill="#3167d9" radius={[0, 0, 0, 0]} barSize={16} animationDuration={500} />
                                    <Bar dataKey="gap" stackId="a" fill="#22d3ee" radius={[2, 2, 0, 0]} barSize={16} animationDuration={500} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto min-h-0 pr-1 custom-scrollbar">
                    <div className="space-y-1.5 pb-4">
                        {sortedStats.map(([height, count, bestTime, avgTime, bestExpl, avgExpl]) => (
                            <button key={height}
                                onClick={() => showDetail(height)}
                                className="group w-full bg-gray-800/40 hover:bg-gray-800/70 border border-gray-700/30 hover:border-gray-600/60 rounded-xl p-3 text-left transition-all relative overflow-hidden shadow-sm">

                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500/0 group-hover:bg-blue-500/40 transition-all" />

                                <div className="flex items-center gap-4">
                                    <div className="w-16 shrink-0 flex flex-col items-center justify-center p-2 rounded-lg bg-gray-900/50 group-hover:bg-blue-950/20 transition-colors">
                                        <span className="text-xl font-black text-white leading-none">Y{height}</span>
                                        <span className="text-[10px] font-black text-gray-400 uppercase mt-1 tracking-tight group-hover:text-blue-300 transition-colors">{count} runs</span>
                                    </div>

                                    <div className="flex-1 grid grid-cols-4 gap-4 items-center">
                                        {/* Explosives */}
                                        <div className="flex flex-col border-l border-gray-700/30 pl-4 leading-tight">
                                            <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Best Expl</span>
                                            <span className="text-base font-black text-cyan-400 leading-none">{bestExpl}</span>
                                        </div>
                                        <div className="flex flex-col border-l border-gray-700/30 pl-4 leading-tight opacity-80">
                                            <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Avg Expl</span>
                                            <span className="text-base font-bold text-gray-300 leading-none">{avgExpl.toFixed(1)}</span>
                                        </div>

                                        {/* Time */}
                                        <div className="flex flex-col border-l border-gray-700/30 pl-4 leading-tight">
                                            <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Best Time</span>
                                            <span className="text-base font-black text-amber-400 leading-none">{bestTime.toFixed(1)}s</span>
                                        </div>
                                        <div className="flex flex-col border-l border-gray-700/30 pl-4 leading-tight opacity-80">
                                            <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Avg Time</span>
                                            <span className="text-base font-bold text-gray-300 leading-none">{avgTime.toFixed(1)}s</span>
                                        </div>
                                    </div>

                                    <div className="text-gray-600 group-hover:text-blue-400 transition-colors pr-2">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </div>
                            </button>
                        ))}
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
        <div className="flex flex-col h-full overflow-hidden pt-1 px-1">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4 shrink-0 pr-1">
                <button onClick={() => setViewMode('list')}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5 shadow-sm">
                    <span>←</span> Index
                </button>

                <div className="flex bg-gray-800 rounded-lg overflow-hidden border border-gray-700/50 shadow-sm transition-all hover:border-gray-600">
                    <button onClick={() => prevHeight !== null && showDetail(prevHeight)}
                        disabled={prevHeight === null}
                        className="px-4 py-1.5 hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-lg flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="w-[1px] bg-gray-700/50" />
                    <button onClick={() => nextHeight !== null && showDetail(nextHeight)}
                        disabled={nextHeight === null}
                        className="px-4 py-1.5 hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-lg flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>

                <h2 className="text-sm font-bold truncate flex-1 leading-tight text-gray-300 uppercase tracking-tight">
                    Height Y{currentHeight}
                </h2>
            </div>

            {/* Stat Cards */}
            <div className="flex flex-wrap gap-2 mb-3 shrink-0 justify-start">
                <StatCard label="Best/Avg Expl"
                    value={bestExpl > 0 ? `${bestExpl} Best` : '-'}
                    equalValue={avgExpl > 0 ? `${avgExpl.toFixed(1)} Avg` : ''}
                    color="text-cyan-400" />
                <StatCard label="Total Success" value={filteredRuns.length} />
                <StatCard label="Best/Avg Time"
                    value={bestTime > 0 ? `${bestTime.toFixed(2)}s PB` : '-'}
                    equalValue={avgTime > 0 ? `${avgTime.toFixed(1)}s Avg` : ''}
                    color="text-yellow-400" />
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-1.5 mb-2 shrink-0">
                <FilterChips items={allTypes} activeSet={activeTypes} onToggle={toggleType} label="Type Filter:" />
                {allTowers.length > 1 && (
                    <FilterChips items={allTowers} activeSet={activeTowers} onToggle={toggleTower} label="Tower Filter:" />
                )}
            </div>

            {/* Charts Section */}
            <div className="flex flex-col gap-2 mb-3 shrink-0">
                <div className="flex items-center gap-2 flex-wrap pr-1">
                    <div className="flex bg-gray-800 rounded-lg overflow-hidden text-[10px] font-bold uppercase border border-gray-700/50">
                        <button onClick={() => setChartMode('expl')}
                            className={`px-3 py-1.5 transition-colors ${chartMode === 'expl' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>Expl</button>
                        <button onClick={() => setChartMode('time')}
                            className={`px-3 py-1.5 transition-colors ${chartMode === 'time' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>Time</button>
                    </div>
                    <button onClick={() => setShowTrend(v => !v)}
                        title="Toggle Trend Line"
                        className={`p-1.5 rounded-lg transition-all border ${showTrend ? 'bg-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-900/40' : 'bg-gray-800 border-gray-700/50 text-gray-500 hover:border-gray-600'}`}>
                        📈
                    </button>
                    <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700/50 rounded px-2 py-1.5 h-[27px]">
                        <span className="text-[9px] text-gray-500 uppercase font-bold">Group</span>
                        <input type="number" min="1" value={groupSize}
                            onChange={e => setGroupSize(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-8 bg-transparent border-none text-[10px] text-white text-center focus:outline-none font-bold" />
                    </div>
                    <div className="flex-1" />
                    <select value={detailSort} onChange={e => setDetailSort(e.target.value)}
                        className="bg-gray-800 border border-gray-700/50 rounded px-2.5 py-1.5 text-[11px] text-gray-200 focus:outline-none focus:border-gray-500 hover:border-gray-600 transition-colors">
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                        <option value="fastest">Fastest</option>
                        <option value="expl">Best Expl</option>
                    </select>
                    <button
                        onClick={() => {
                            const next = !showDist;
                            setShowDist(next);
                            saveConfig({ show_height_dist: next });
                        }}
                        className={`p-1.5 rounded-lg transition-all ${showDist ? 'bg-cyan-950/40 text-cyan-400 ring-1 ring-cyan-500/50' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                        title="Toggle Explosive Distribution"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </button>
                </div>

                <div className={`flex gap-2 transition-all ${showDist ? 'h-[160px]' : 'h-[200px]'}`}>
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
                        <div className="w-[240px] shrink-0 animate-in fade-in slide-in-from-right-2">
                            <DistChart data={distData} />
                        </div>
                    )}
                </div>
            </div>

            {/* Run List */}
            <div className="flex-1 overflow-auto min-h-0 custom-scrollbar rounded-lg border border-gray-800/50">
                <table className="text-xs border-separate border-spacing-0">
                    <thead className="sticky top-0 bg-gray-900 border-b border-gray-800 shadow-sm z-10">
                        <tr className="text-gray-500 text-left uppercase tracking-wider font-bold">
                            <th className="py-2.5 px-3 w-[60px]">Expl</th>
                            <th className="py-2.5 px-3 w-[100px] font-mono">Time</th>
                            <th className="py-2.5 px-3 w-[100px]">Bed</th>
                            <th className="py-2.5 px-3 w-[120px]">Tower</th>
                            <th className="py-2.5 px-3 w-[200px]">Type</th>
                            <th className="py-2.5 px-3 w-[120px] text-right">Date</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/20">
                        {filteredRuns.map((run, i) => {
                            const isPB = pbMap[`${run[C.tower]}_${run[C.type]}`] === run[C.total_explosives];
                            return (
                                <tr key={run[C.id] || i}
                                    className={`${isPB ? 'bg-yellow-500/5 text-yellow-200 shadow-inner' : 'text-gray-300'} hover:bg-gray-800/40 transition-colors group`}>
                                    <td className="py-2 px-3">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm">{run[C.explosives]}</span>
                                            {isPB && <span className="text-[9px] px-1 bg-yellow-500/20 text-yellow-500 rounded font-black border border-yellow-500/30">PB</span>}
                                        </div>
                                    </td>
                                    <td className="py-2 px-3 font-mono">{(run[C.time_sec] || 0).toFixed(2)}s</td>
                                    <td className={`py-2 px-3 ${run[C.bed_time] ? 'text-orange-300' : 'text-gray-600'}`}>
                                        {run[C.bed_time] ? `${run[C.bed_time].toFixed(2)}s` : '-'}
                                    </td>
                                    <td className="py-2 px-3 text-gray-400 group-hover:text-gray-200 transition-colors tracking-tight text-[11px]">{run[C.tower]}</td>
                                    <td className="py-2 px-3 text-gray-400 group-hover:text-gray-200 transition-colors tracking-tight text-[11px]">{run[C.type]}</td>
                                    <td className="py-2 px-3 text-right text-gray-500 font-mono text-[10px]">{formatDate(run[C.timestamp])}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
