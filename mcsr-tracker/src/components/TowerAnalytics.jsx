import { useState, useMemo, useEffect } from 'react';
import { getTowerStats, getRunsByTower, getPbsMap } from '../db/queries';
import { loadConfig, saveConfig } from '../utils/config';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import RunChart from './shared/RunChart';
import DistChart from './shared/DistChart';
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
    const config = useMemo(() => loadConfig(), [refreshKey]);
    const [viewMode, setViewMode] = useState('grid');
    const [currentTower, setCurrentTower] = useState(null);
    const [gridSort, setGridSort] = useState('count');
    const [detailSort, setDetailSort] = useState('newest');
    const [chartMode, setChartMode] = useState('expl');
    const [showTrend, setShowTrend] = useState(false);
    const [groupSize, setGroupSize] = useState(1);
    const [activeTypes, setActiveTypes] = useState(new Set());
    const [showIndexChart, setShowIndexChart] = useState(config.show_tower_index_chart || false);
    const [showDist, setShowDist] = useState(config.show_tower_dist || false);

    // Type Stats State (Detail View)
    const [showTypeStats, setShowTypeStats] = useState(true);

    // Handle navigation from RecentRuns click
    useEffect(() => {
        if (detailRequest?.tower) {
            showDetail(detailRequest.tower, detailRequest.filterType);
        }
    }, [detailRequest?.key]);

    const towerStats = useMemo(() => getTowerStats(), [refreshKey]);
    const pbMap = useMemo(() => getPbsMap(), [refreshKey]);

    const sortedStats = useMemo(() => {
        // [tower, min_time, avg_time, min_expl, avg_expl, count]
        // Filter out 0.00s data
        let stats = towerStats.filter(s => s[1] > 0 && s[2] > 0);

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
        // Filter out 0.00s data
        return getRunsByTower(currentTower).filter(r => r[C.time_sec] > 0);
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
        else if (detailSort === 'y_high') runs = [...runs].sort((a, b) => b[C.height] - a[C.height]);
        else if (detailSort === 'y_low') runs = [...runs].sort((a, b) => a[C.height] - b[C.height]);
        return runs;
    }, [allRuns, activeTypes, detailSort]);

    const chartValues = useMemo(() => {
        const chronological = allRuns.filter(r => r[C.is_success] && activeTypes.has(r[C.type]));
        if (chartMode === 'expl') return chronological.map(r => r[C.total_explosives]).filter(v => v > 0);
        return chronological.map(r => r[C.time_sec]);
    }, [allRuns, activeTypes, chartMode]);

    const distData = useMemo(() => {
        const successes = allRuns.filter(r => r[C.is_success] && activeTypes.has(r[C.type]));
        if (successes.length === 0) return {};
        const counts = {};
        successes.forEach(r => {
            const expl = r[C.total_explosives] || 0;
            if (expl > 0) counts[expl] = (counts[expl] || 0) + 1;
        });
        const distribution = {};
        Object.keys(counts).forEach(expl => {
            distribution[expl] = (counts[expl] / successes.length) * 100;
        });
        return distribution;
    }, [allRuns, activeTypes]);

    const typeStats = useMemo(() => {
        const successes = allRuns.filter(r => r[C.is_success]);
        const stats = {};
        successes.forEach(r => {
            const type = r[C.type] || 'Unknown';
            if (!stats[type]) stats[type] = { samples: 0, best: 99, sum: 0 };
            stats[type].samples++;
            stats[type].best = Math.min(stats[type].best, r[C.total_explosives]);
            stats[type].sum += r[C.total_explosives];
        });
        return Object.keys(stats).map(type => ({
            name: type,
            best: stats[type].best,
            avg: Number((stats[type].sum / stats[type].samples).toFixed(1))
        })).sort((a, b) => b.name.localeCompare(a.name));
    }, [allRuns]);

    const toggleType = (t) => {
        setActiveTypes(prev => {
            const next = new Set(prev);
            if (next.has(t)) { if (next.size > 1) next.delete(t); }
            else next.add(t);
            return next;
        });
    };

    // ======== GRID VIEW ========
    const indexChartData = useMemo(() => {
        if (!showIndexChart) return [];
        // sortedStats: [tower, bestTime, avgTime, bestExpl, avgExpl, count]
        return [...sortedStats].sort((a, b) => a[0].localeCompare(b[0])).map(s => {
            const best = s[3];
            const avg = s[4];
            return {
                name: s[0],
                best,
                gap: Math.max(0, avg - best),
                _avg: Number(avg.toFixed(1)) // For tooltip
            };
        });
    }, [sortedStats, showIndexChart]);

    if (viewMode === 'grid') {
        return (
            <div className="flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between mb-4 shrink-0 pr-1">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-100 uppercase tracking-tight">Tower Analytics</h2>
                        <button
                            onClick={() => {
                                const next = !showIndexChart;
                                setShowIndexChart(next);
                                saveConfig({ show_tower_index_chart: next });
                            }}
                            className={`p-1.5 rounded-lg transition-all ${showIndexChart ? 'bg-blue-950/40 text-blue-400 ring-1 ring-blue-500/50' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                            title="Toggle Performance Chart"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Sort By</span>
                        <select value={gridSort} onChange={e => setGridSort(e.target.value)}
                            className="bg-gray-800 border border-gray-700/50 rounded px-2.5 py-1.5 text-[11px] text-gray-200 focus:outline-none focus:border-gray-500 hover:border-gray-600 transition-colors font-medium">
                            <option value="count">Most Runs</option>
                            <option value="best">Fastest Time</option>
                            <option value="name">Tower Name</option>
                        </select>
                    </div>
                </div>

                {showIndexChart && (
                    <div className="mb-4 shrink-0 transition-all animate-in fade-in slide-in-from-top-2">
                        <div className="h-[160px] bg-black/30 rounded-xl p-3 border border-gray-800/50 shadow-inner">
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
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pb-4">
                        {sortedStats.map(([tower, bestTime, avgTime, bestExpl, avgExpl, count]) => (
                            <button key={tower}
                                onClick={() => showDetail(tower)}
                                className="group bg-gray-800/40 hover:bg-gray-800/70 border border-gray-700/30 hover:border-blue-500/40 rounded-xl p-4 text-center transition-all flex flex-col items-center gap-3 relative overflow-hidden shadow-sm">

                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                <h3 className="text-xl font-bold text-gray-100 tracking-wide group-hover:text-blue-400 transition-colors uppercase">{tower}</h3>

                                <div className="grid grid-cols-2 gap-x-6 gap-y-4 w-full border-t border-gray-700/20 pt-4">
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">Explosives</span>
                                        <div className="flex flex-col items-center gap-1 leading-none">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] text-gray-500 font-bold uppercase">Best</span>
                                                <span className="text-xl font-black text-cyan-400">{bestExpl}</span>
                                            </div>
                                            <div className="flex items-center gap-2 opacity-80">
                                                <span className="text-[9px] text-gray-600 font-bold uppercase">Avg</span>
                                                <span className="text-lg font-bold text-gray-300">{avgExpl.toFixed(1)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-center border-l border-gray-700/20 pl-6">
                                        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">Time</span>
                                        <div className="flex flex-col items-center gap-1 leading-none">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] text-gray-500 font-bold uppercase">Best</span>
                                                <span className="text-xl font-black text-amber-400">{bestTime.toFixed(1)}s</span>
                                            </div>
                                            <div className="flex items-center gap-2 opacity-80">
                                                <span className="text-[9px] text-gray-600 font-bold uppercase">Avg</span>
                                                <span className="text-lg font-bold text-gray-300">{avgTime.toFixed(1)}s</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-2 text-[11px] font-black text-gray-400 bg-gray-950/60 border border-gray-700/30 px-5 py-2 rounded-full uppercase tracking-tight group-hover:bg-blue-900/30 group-hover:text-blue-300 group-hover:border-blue-500/30 transition-all shadow-sm">
                                    {count} Runs
                                </div>
                            </button>
                        ))}
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
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4 shrink-0 pr-1">
                <button onClick={() => setViewMode('grid')}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5 shadow-sm">
                    <span>←</span> Index
                </button>

                <div className="flex bg-gray-800 rounded-lg overflow-hidden border border-gray-700/50 shadow-sm">
                    <button onClick={() => prevTower && showDetail(prevTower)}
                        disabled={!prevTower}
                        className="px-4 py-1.5 hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-lg">
                        ◀
                    </button>
                    <div className="w-[1px] bg-gray-700/50" />
                    <button onClick={() => nextTower && showDetail(nextTower)}
                        disabled={!nextTower}
                        className="px-4 py-1.5 hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-lg">
                        ▶
                    </button>
                </div>

                <h2 className="text-sm font-bold truncate flex-1 leading-tight text-gray-300 uppercase tracking-tight">
                    {currentTower}
                </h2>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-3 shrink-0">
                <StatCard label="Total Success" value={successes.length} />
                <StatCard label="Best Expl" value={bestExpl > 0 ? bestExpl : '-'} color="text-cyan-400" />
                <StatCard label="Avg Expl" value={avgExpl > 0 ? avgExpl.toFixed(1) : '-'} color="text-blue-300" />
                <StatCard label="Best Time" value={bestTime > 0 ? `${bestTime.toFixed(2)}s` : '-'} color="text-yellow-400" />
                <StatCard label="Avg Time" value={successes.length > 0 ? `${(successes.reduce((s, r) => s + r[C.time_sec], 0) / successes.length).toFixed(1)}s` : '-'} color="text-gray-300" />
            </div>

            {/* Filters */}
            <div className="mb-2 shrink-0">
                <FilterChips items={allTypes} activeSet={activeTypes} onToggle={toggleType} label="Type Filter:" />
            </div>

            {/* Charts Section */}
            <div className="flex flex-col gap-2 mb-3 shrink-0">
                {/* Main Trend Chart */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
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
                            <option value="y_high">Highest Y</option>
                            <option value="y_low">Lowest Y</option>
                        </select>
                        <button
                            onClick={() => {
                                const next = !showDist;
                                setShowDist(next);
                                saveConfig({ show_tower_dist: next });
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
            </div>

            {/* Run List */}
            <div className="flex-1 overflow-auto min-h-0 custom-scrollbar rounded-lg border border-gray-800/50">
                <table className="text-xs border-separate border-spacing-0">
                    <thead className="sticky top-0 bg-gray-900 border-b border-gray-800 shadow-sm z-10">
                        <tr className="text-gray-500 text-left uppercase tracking-wider font-bold">
                            <th className="py-2.5 px-3 w-[60px]">Expl</th>
                            <th className="py-2.5 px-3 w-[100px] font-mono">Time</th>
                            <th className="py-2.5 px-3 w-[100px]">Bed</th>
                            <th className="py-2.5 px-3 w-[200px]">Type</th>
                            <th className="py-2.5 px-3 w-[60px] text-center">Y</th>
                            <th className="py-2.5 px-3 w-[120px] text-right">Date</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/20">
                        {successes.map((run, i) => {
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
                                    <td className="py-2 px-3 text-gray-400 group-hover:text-gray-200 transition-colors tracking-tight text-[11px]">{run[C.type]}</td>
                                    <td className="py-2 px-3 text-center font-mono text-gray-500 group-hover:text-gray-300">{run[C.height] > 0 ? run[C.height] : '-'}</td>
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
