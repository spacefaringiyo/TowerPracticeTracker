import { useState, useMemo } from 'react';
import { getRecentRuns, getPbsMap } from '../db/queries';
import { loadConfig, saveConfig } from '../utils/config';
import RunChart from './shared/RunChart';

// Column indices matching SQL schema
const C = {
    id: 0, timestamp: 1, time_sec: 2, explosives: 3, total_explosives: 4,
    tower: 5, type: 6, height: 7, bed_time: 8, is_success: 9,
    fail_reason: 10, session_id: 11, split_tag: 12, fingerprint: 13
};

function formatDate(ts) {
    try {
        const dt = new Date(ts.replace(' ', 'T'));
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        const h = String(dt.getHours()).padStart(2, '0');
        const min = String(dt.getMinutes()).padStart(2, '0');
        return `${m}/${d} ${h}:${min}`;
    } catch { return ts || ''; }
}

function abbreviateFail(reason) {
    if (!reason) return 'Fail';
    if (reason === 'World Load') return 'WL';
    if (reason.startsWith('Reset')) return 'Rst';
    return reason;
}

export default function RecentRuns({ refreshKey, onRunClick, width }) {
    const cfg = loadConfig();
    const [chartMode, setChartMode] = useState(cfg.chart_mode || 'expl');
    const [hideFails, setHideFails] = useState(cfg.hide_fails || false);
    const [showTrend, setShowTrend] = useState(cfg.show_trend || false);
    const [groupSize, setGroupSize] = useState(1);

    const allRuns = useMemo(() => getRecentRuns(100), [refreshKey]);
    const pbMap = useMemo(() => getPbsMap(), [refreshKey]);

    // Visible rows (max 50)
    const tableRows = useMemo(() => {
        const rows = [];
        for (const run of allRuns) {
            if (rows.length >= 50) break;
            if (hideFails && !run[C.is_success]) continue;
            rows.push(run);
        }
        return rows;
    }, [allRuns, hideFails]);

    // Chart values (successes only, chronological order)
    const chartValues = useMemo(() => {
        const successes = [...allRuns].reverse().filter(r => r[C.is_success]);
        if (chartMode === 'expl') {
            return successes.map(r => r[C.total_explosives]).filter(v => v > 0);
        }
        return successes.map(r => r[C.time_sec]);
    }, [allRuns, chartMode]);

    const toggleChartMode = (mode) => {
        setChartMode(mode);
        saveConfig({ chart_mode: mode });
    };

    const toggleTrend = () => {
        setShowTrend(v => {
            saveConfig({ show_trend: !v });
            return !v;
        });
    };

    const toggleHideFails = () => {
        setHideFails(v => {
            saveConfig({ hide_fails: !v });
            return !v;
        });
    };

    const chartColor = chartMode === 'expl' ? '#22d3ee' : '#a78bfa';
    const chartTitle = chartMode === 'expl' ? 'Expl.' : 'Time';

    return (
        <div className="flex flex-col h-full gap-2">
            {/* Header */}
            <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold whitespace-nowrap">Recent History</h2>
                <div className="flex-1" />
                <button onClick={toggleTrend} title="Toggle Trend Line"
                    className={`p-2 rounded transition-all border ${showTrend ? 'bg-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-900/40' : 'bg-gray-800 border-gray-700/50 text-gray-500 hover:border-gray-600'}`}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                </button>
                <button onClick={toggleHideFails} title={hideFails ? "Showing Wins Only" : "Showing All Runs"}
                    className={`p-2 rounded transition-all border ${hideFails ? 'bg-red-700 border-red-500 text-white shadow-lg shadow-red-900/40' : 'bg-gray-800 border-gray-700/50 text-gray-500 hover:border-gray-600'}`}>
                    {hideFails ? (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                    ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.04m5.882-5.903A9.972 9.972 0 0112 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-1.124 0-2.193-.182-3.192-.518M11.332 11.332L15 15M9 15L12.668 11.332" />
                        </svg>
                    )}
                </button>
                <input
                    type="number" min="1" max="50" value={groupSize}
                    onChange={e => setGroupSize(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-center"
                    title="Group size"
                />
                <div className="flex bg-gray-800 rounded-lg overflow-hidden text-xs">
                    <button onClick={() => toggleChartMode('expl')}
                        className={`px-3 py-1.5 transition-colors ${chartMode === 'expl' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                        Explosives
                    </button>
                    <button onClick={() => toggleChartMode('time')}
                        className={`px-3 py-1.5 transition-colors ${chartMode === 'time' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                        Time
                    </button>
                </div>
            </div>

            {/* Chart */}
            <RunChart
                yValues={chartValues}
                chartColor={chartColor}
                title={chartTitle}
                groupSize={groupSize}
                showTrend={showTrend}
            />

            {/* Table */}
            <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-900">
                        <tr className="text-gray-400 text-left">
                            <th className="py-1.5 px-1 font-medium">Expl</th>
                            <th className="py-1.5 px-1 font-medium">Time</th>
                            {/* <th className="py-1.5 px-1 font-medium">Bed</th> */}
                            <th className="py-1.5 px-1 font-medium">Tower</th>
                            <th className="py-1.5 px-1 font-medium">Type</th>
                            <th className="py-1.5 px-1 font-medium">Y</th>
                            <th className="py-1.5 px-1 font-medium">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableRows.map((run, i) => {
                            const isSuccess = Boolean(run[C.is_success]);
                            const tower = run[C.tower];
                            const rType = run[C.type];
                            const totalExpl = run[C.total_explosives];
                            const isPB = isSuccess && pbMap[`${tower}_${rType}`] === totalExpl;

                            let rowColor = 'text-gray-200';
                            if (!isSuccess) rowColor = 'text-red-400';
                            else if (isPB) rowColor = 'text-yellow-400';

                            const expl = isSuccess ? run[C.explosives] : abbreviateFail(run[C.fail_reason]);
                            const timeVal = run[C.time_sec] || 0;
                            const time = isSuccess ? `${timeVal.toFixed(2)}s` : `${timeVal.toFixed(1)}s`;
                            const bedVal = run[C.bed_time];
                            const bed = isSuccess && bedVal ? `${bedVal.toFixed(2)}s` : '-';
                            const towerDisplay = (!isSuccess && tower === 'Unknown') ? '-' : tower;
                            const typeDisplay = (!isSuccess && rType === 'Unknown') ? '-' : rType;
                            const height = isSuccess && run[C.height] > 0 ? String(run[C.height]) : '-';

                            return (
                                <tr key={run[C.id] || i}
                                    className={`${rowColor} hover:bg-gray-800/50 cursor-pointer transition-colors border-b border-gray-800/30`}
                                    onClick={() => tower !== 'Unknown' && onRunClick?.(tower, rType)}>
                                    <td className="py-1.5 px-1 font-semibold whitespace-nowrap">{expl}</td>
                                    <td className="py-1.5 px-1 whitespace-nowrap">{time}</td>
                                    {/* <td className={`py-1.5 px-1 whitespace-nowrap ${isSuccess && run[C.bed_time] ? 'text-orange-300' : 'text-gray-500'}`}>{bed}</td> */}
                                    <td className="py-1.5 px-1 whitespace-nowrap">{towerDisplay}</td>
                                    <td className="py-1.5 px-1 whitespace-nowrap">{typeDisplay}</td>
                                    <td className="py-1.5 px-1 whitespace-nowrap">{height}</td>
                                    <td className="py-1.5 px-1 whitespace-nowrap text-gray-500">{formatDate(run[C.timestamp])}</td>
                                </tr>
                            );
                        })}
                        {tableRows.length === 0 && (
                            <tr><td colSpan={7} className="py-8 text-center text-gray-500">No runs yet. Import your log files!</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
