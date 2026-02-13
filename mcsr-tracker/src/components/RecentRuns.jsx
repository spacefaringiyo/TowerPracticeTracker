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
                    className={`p-1.5 rounded transition-colors ${showTrend ? 'text-cyan-400' : 'text-gray-400 hover:text-white'}`}>
                    📈
                </button>
                <button onClick={toggleHideFails} title="Hide Fails"
                    className={`p-1.5 rounded transition-colors ${hideFails ? 'text-red-400' : 'text-gray-400 hover:text-white'}`}>
                    {hideFails ? '🔍' : '👁️'}
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
                            <th className="py-1.5 px-1 font-medium">Bed</th>
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

                            const expl = isSuccess ? run[C.explosives] : (run[C.fail_reason] || 'Fail');
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
                                    <td className={`py-1.5 px-1 whitespace-nowrap ${isSuccess && run[C.bed_time] ? 'text-orange-300' : 'text-gray-500'}`}>{bed}</td>
                                    <td className="py-1.5 px-1 whitespace-nowrap overflow-hidden text-ellipsis max-w-[80px]">{towerDisplay}</td>
                                    <td className="py-1.5 px-1 whitespace-nowrap overflow-hidden text-ellipsis max-w-[60px]">{typeDisplay}</td>
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
