import { useState, useMemo, useEffect, useCallback } from 'react';
import { getCalendarStats, getDailyRuns, getMaxDailyRuns, getNeighboringActiveDate } from '../db/queries';
import { loadConfig } from '../utils/config';

// Column indices matching SQL schema
const C = {
    id: 0, timestamp: 1, time_sec: 2, explosives: 3, total_explosives: 4,
    tower: 5, type: 6, height: 7, bed_time: 8, is_success: 9,
    fail_reason: 10, session_id: 11, split_tag: 12, fingerprint: 13
};

function formatDuration(sec) {
    if (!sec) return '0m';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h${m}m`;
    return `${m}m`;
}

function getTimeRangeFromTimestamp(ts) {
    try {
        const timeStr = ts.split(' ')[1]; // HH:MM:SS
        const [h, m] = timeStr.split(':').map(Number);
        return h + (m / 60);
    } catch { return 0; }
}

export default function CalendarAnalytics({ refreshKey, isActive }) {
    const today = new Date();
    const config = loadConfig();
    const threshold = config.session_gap_threshold || 30;

    const getLocalDateStr = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    const [selectedDate, setSelectedDate] = useState(getLocalDateStr(today));
    const [groupMode, setGroupMode] = useState('tower'); // 'tower' or 'height'
    const [sortMode, setSortMode] = useState('performance'); // 'performance', 'runs', 'name'

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const monthName = viewDate.toLocaleString('default', { month: 'long' });

    const calendarStats = useMemo(() => {
        if (!isActive) return [];
        return getCalendarStats(year, month, threshold);
    }, [year, month, refreshKey, isActive, threshold]);

    const dailyRuns = useMemo(() => {
        if (!isActive || !selectedDate) return [];
        return getDailyRuns(selectedDate);
    }, [selectedDate, refreshKey, isActive]);

    const statsMap = useMemo(() => {
        const map = {};
        calendarStats.forEach(s => { map[s.date] = s; });
        return map;
    }, [calendarStats]);

    // Calendar logic
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Mon
    const weeks = [];
    let currentWeek = Array(7).fill(null);

    for (let i = 0; i < firstDay; i++) {
        const prevMonthDate = new Date(year, month, 0).getDate() - (firstDay - i - 1);
        currentWeek[i] = { day: prevMonthDate, isPrev: true };
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const pos = (firstDay + d - 1) % 7;
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        currentWeek[pos] = { day: d, date: dateStr, isCurrent: true };
        if (pos === 6) {
            weeks.push(currentWeek);
            currentWeek = Array(7).fill(null);
        }
    }

    if (currentWeek.some(d => d !== null)) {
        for (let i = 0; i < 7; i++) {
            if (currentWeek[i] === null) {
                const dayValue = i - ((firstDay + daysInMonth - 1) % 7);
                currentWeek[i] = { day: dayValue, isNext: true };
            }
        }
        weeks.push(currentWeek);
    }

    const changeMonth = (offset) => {
        setViewDate(new Date(year, month + offset, 1));
    };

    const handleTodayClick = () => {
        const d = new Date();
        setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
        setSelectedDate(getLocalDateStr(d));
    };

    const changeSelectedDay = (offset) => {
        const nextDate = getNeighboringActiveDate(selectedDate, offset);
        if (!nextDate) return;

        setSelectedDate(nextDate);

        // Auto-change view month if navigation goes out of current view
        const nDate = new Date(nextDate);
        if (nDate.getMonth() !== month || nDate.getFullYear() !== year) {
            setViewDate(new Date(nDate.getFullYear(), nDate.getMonth(), 1));
        }
    };

    // Sub-day Graph Logic
    const hourlyActivity = useMemo(() => {
        const hours = Array(24).fill(0);
        dailyRuns.forEach(run => {
            const h = parseInt(run[C.timestamp].split(' ')[1].split(':')[0]);
            hours[h]++;
        });
        const max = Math.max(...hours, 1);
        return hours.map(v => v / max);
    }, [dailyRuns]);

    // Grouping and Sorting Logic
    const groupedActivity = useMemo(() => {
        const groups = {};
        dailyRuns.filter(r => r[C.is_success]).forEach(run => {
            const key = groupMode === 'tower' ? run[C.tower] : `Height ${run[C.height]}`;
            if (!groups[key]) {
                groups[key] = {
                    name: key,
                    runs: 0,
                    bestExpl: 999,
                    totalExpl: 0,
                    successCount: 0,
                    bestTime: 999,
                    totalTime: 0
                };
            }
            groups[key].runs++;
            groups[key].successCount++;
            groups[key].bestExpl = Math.min(groups[key].bestExpl, run[C.total_explosives]);
            groups[key].totalExpl += run[C.total_explosives];
            groups[key].bestTime = Math.min(groups[key].bestTime, run[C.time_sec]);
            groups[key].totalTime += run[C.time_sec];
        });

        const list = Object.values(groups).map(g => ({
            ...g,
            avgExpl: g.totalExpl / g.successCount,
            avgTime: g.totalTime / g.successCount
        }));

        list.sort((a, b) => {
            if (sortMode === 'performance') return a.avgExpl - b.avgExpl;
            if (sortMode === 'runs') return b.runs - a.runs;
            return a.name.localeCompare(b.name);
        });

        return list;
    }, [dailyRuns, groupMode, sortMode]);

    // Dynamic Heatmap thresholds
    const peakRuns = useMemo(() => {
        if (!isActive) return 20;
        return Math.max(getMaxDailyRuns(), 10); // Minimum reference of 10
    }, [refreshKey, isActive]);

    // Heatmap intensity helper
    const getIntensityClass = (count, isSelected) => {
        if (!count || count === 0) return isSelected ? 'bg-blue-600/30' : 'bg-gray-800/40';

        const ratio = count / peakRuns;

        // Intensity levels based on percentage of peak runs
        if (ratio >= 0.9) return isSelected ? 'bg-emerald-500/60' : 'bg-emerald-500/40';
        if (ratio >= 0.6) return isSelected ? 'bg-emerald-600/50' : 'bg-emerald-600/30';
        if (ratio >= 0.3) return isSelected ? 'bg-emerald-700/40' : 'bg-emerald-700/20';
        if (ratio >= 0.1) return isSelected ? 'bg-emerald-800/30' : 'bg-emerald-800/10';
        return isSelected ? 'bg-blue-600/30' : 'bg-gray-800/40';
    };

    return (
        <div className="flex flex-col h-full overflow-hidden pt-1 px-1">
            {/* Header / Month Nav */}
            <div className="flex items-center gap-4 mb-4 shrink-0">
                <div className="flex bg-gray-800 rounded-lg overflow-hidden border border-gray-700/50">
                    <button onClick={() => changeMonth(-1)} className="px-3 py-1.5 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="px-4 py-1.5 font-bold text-gray-100 min-w-[140px] text-center border-x border-gray-700/50">
                        {monthName} {year}
                    </div>
                    <button onClick={() => changeMonth(1)} className="px-3 py-1.5 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
                <button
                    onClick={handleTodayClick}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-1.5 rounded-lg text-sm font-bold transition-colors border border-gray-700/50"
                >
                    Today
                </button>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row min-h-0 gap-6 overflow-hidden">
                {/* Left Side: Even Larger Calendar Grid */}
                <div className="w-full lg:w-[720px] shrink-0 flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">
                    <div className="grid grid-cols-7 gap-2">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                            <div key={d} className="text-center text-xs font-black uppercase text-gray-500 pb-1.5">
                                {d}
                            </div>
                        ))}
                        {weeks.map((week, wi) => (
                            week.map((day, di) => {
                                if (!day || day.isPrev || day.isNext) {
                                    return <div key={`empty-${wi}-${di}`} className="h-24 bg-gray-800/5 rounded-xl border border-transparent" />;
                                }
                                const stats = statsMap[day.date];
                                const isSelected = selectedDate === day.date;
                                const isToday = day.date === getLocalDateStr(today);
                                const runCount = stats?.count || 0;

                                return (
                                    <div
                                        key={day.date}
                                        onClick={() => setSelectedDate(day.date)}
                                        className={`h-24 rounded-xl border p-2.5 transition-all cursor-pointer flex flex-col relative overflow-hidden group
                                            ${getIntensityClass(runCount, isSelected)}
                                            ${isSelected ? 'border-blue-500 shadow-xl shadow-blue-900/40' : 'border-gray-700/50 hover:border-gray-600'}
                                            ${isToday && !isSelected ? 'border-orange-500/50' : ''}
                                        `}
                                    >
                                        <div className={`text-xs font-bold leading-none mb-1.5 ${isSelected ? 'text-blue-300' : 'text-gray-500'} ${isToday ? 'text-orange-400' : ''}`}>
                                            {day.day}
                                        </div>

                                        {stats && (
                                            <div className="flex-1 flex flex-col justify-end gap-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-[11px] font-black leading-none ${runCount / peakRuns > 0.6 ? 'text-white' : 'text-gray-100'}`}>
                                                        {stats.count} runs
                                                    </span>
                                                    {stats.avg_expl !== null && (
                                                        <span className={`font-black text-xs leading-none ${runCount / peakRuns > 0.6 ? 'text-white' : 'text-emerald-400'}`}>{stats.avg_expl.toFixed(1)}</span>
                                                    )}
                                                </div>
                                                <div className={`text-[11px] font-black leading-none mt-1 ${runCount / peakRuns > 0.6 ? 'text-white' : 'text-cyan-400'}`}>
                                                    {formatDuration(stats.duration_sec)}
                                                </div>
                                            </div>
                                        )}

                                        {/* Activity dot with glow */}
                                        {stats && stats.count > 0 && (
                                            <div className={`absolute top-2.5 right-2.5 w-2 h-2 rounded-full ${isSelected ? 'bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.6)]' : 'bg-blue-500/80'}`} />
                                        )}
                                    </div>
                                );
                            })
                        ))}
                    </div>
                </div>

                {/* Right Side: Scrollable Details */}
                <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-y-auto pr-1 custom-scrollbar">
                    {/* Selected Day Details */}
                    <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-4 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="flex bg-gray-800 rounded-lg overflow-hidden border border-gray-700/50 p-0.5">
                                    <button onClick={() => changeSelectedDay(-1)} className="p-2.5 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors" title="Previous Day">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                                        </svg>
                                    </button>
                                    <button onClick={() => changeSelectedDay(1)} className="p-2.5 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors border-l border-gray-700/50" title="Next Day">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>
                                <h3 className="text-xl font-bold text-gray-100 flex items-center gap-2 mt-0.5">
                                    Activity for <span className="text-blue-400">{selectedDate}</span>
                                </h3>
                            </div>
                        </div>

                        {/* Hourly activity graph */}
                        <div className="flex flex-col gap-1.5">
                            <div className="h-20 flex items-end gap-1 px-2 border-b border-gray-700/50 pb-1">
                                {hourlyActivity.map((v, i) => (
                                    <div
                                        key={i}
                                        className="flex-1 bg-blue-600/40 rounded-t hover:bg-blue-500 transition-all relative group"
                                        style={{ height: `${v * 100}%`, minHeight: v > 0 ? '4px' : '0' }}
                                        title={`${i}:00 - ${dailyRuns.filter(r => parseInt(r[C.timestamp].split(' ')[1].split(':')[0]) === i).length} runs`}
                                    >
                                        {v > 0 && (
                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 px-1.5 py-0.5 rounded text-[8px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                                                {i}:00
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between text-[8px] font-bold text-gray-500 uppercase tracking-widest px-1">
                                <span>00:00</span>
                                <span>06:00</span>
                                <span>12:00</span>
                                <span>18:00</span>
                                <span>24:00</span>
                            </div>
                        </div>

                        {/* Grouped Table Controls */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex bg-gray-800 rounded-lg overflow-hidden border border-gray-700/50 p-0.5">
                                <button
                                    onClick={() => setGroupMode('tower')}
                                    className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-tight transition-all ${groupMode === 'tower' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                                >Tower</button>
                                <button
                                    onClick={() => setGroupMode('height')}
                                    className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-tight transition-all ${groupMode === 'height' ? 'bg-orange-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                                >Height</button>
                            </div>

                            <select
                                value={sortMode}
                                onChange={(e) => setSortMode(e.target.value)}
                                className="bg-gray-800 border border-gray-700/50 rounded-lg px-2 py-1 text-[10px] font-bold text-gray-300 outline-none"
                            >
                                <option value="performance">Sort: Performance</option>
                                <option value="runs">Sort: Runs</option>
                                <option value="name">Sort: Name</option>
                            </select>
                        </div>

                        {/* Grouped Activity Table */}
                        <div className="overflow-hidden rounded-lg border border-gray-700/50">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-gray-800/80 text-gray-400 font-bold border-b border-gray-700/50">
                                    <tr>
                                        <th className="py-2 px-3">{groupMode === 'tower' ? 'Tower' : 'Height'}</th>
                                        <th className="py-2 px-3">Runs</th>
                                        <th className="py-2 px-3">Best Expl</th>
                                        <th className="py-2 px-3">Avg Expl</th>
                                        <th className="py-2 px-3">Avg Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groupedActivity.map((g, i) => (
                                        <tr key={i} className="border-b border-gray-800 last:border-0 hover:bg-gray-700/20 transition-colors">
                                            <td className="py-2 px-3 font-bold text-gray-200">{g.name}</td>
                                            <td className="py-2 px-3 text-gray-400">{g.runs}</td>
                                            <td className="py-2 px-3 text-yellow-400 font-bold">{g.bestExpl}</td>
                                            <td className="py-2 px-3 text-emerald-400 font-extrabold">{g.avgExpl.toFixed(1)}</td>
                                            <td className="py-2 px-3 text-gray-400">{g.avgTime.toFixed(1)}s</td>
                                        </tr>
                                    ))}
                                    {groupedActivity.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center text-gray-500 font-medium">No successful runs on this day.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
