import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// Compute linear regression trend line
function computeTrend(points) {
    if (points.length < 2) return null;
    const n = points.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (const p of points) {
        sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumXX += p.x * p.x;
    }
    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return null;
    const m = (n * sumXY - sumX * sumY) / denom;
    const b = (sumY - m * sumX) / n;
    return [
        { x: points[0].x, trend: m * points[0].x + b },
        { x: points[points.length - 1].x, trend: m * points[points.length - 1].x + b },
    ];
}

export default function RunChart({ yValues, chartColor = '#22d3ee', title = '', groupSize = 1, showTrend = false }) {
    const { data, trendData } = useMemo(() => {
        let points = [];
        if (groupSize > 1) {
            for (let i = 0; i < yValues.length; i += groupSize) {
                const chunk = yValues.slice(i, i + groupSize);
                if (chunk.length) {
                    const avg = chunk.reduce((a, b) => a + b, 0) / chunk.length;
                    points.push({ x: i, y: Math.round(avg * 100) / 100 });
                }
            }
        } else {
            points = yValues.map((val, i) => ({ x: i, y: Math.round(val * 100) / 100 }));
        }

        let trendData = null;
        if (showTrend && points.length > 1) {
            trendData = computeTrend(points);
        }

        return { data: points, trendData };
    }, [yValues, groupSize, showTrend]);

    if (data.length === 0) {
        return (
            <div className="h-[150px] bg-black/30 rounded-lg flex items-center justify-center text-gray-500 text-sm">
                No data to display
            </div>
        );
    }

    // Merge trend data into main data for recharts
    const mergedData = data.map(p => ({ ...p }));
    if (trendData) {
        // Add trend values to first and last points
        const first = mergedData[0];
        const last = mergedData[mergedData.length - 1];
        if (first) first.trend = trendData[0].trend;
        if (last) last.trend = trendData[1].trend;
    }

    return (
        <div className="h-[150px] bg-black/30 rounded-lg p-2">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mergedData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="x" hide />
                    <YAxis
                        width={45}
                        tick={{ fill: '#9ca3af', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        domain={['dataMin', 'dataMax']}
                        padding={{ top: 10, bottom: 10 }}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
                        labelStyle={{ display: 'none' }}
                        itemStyle={{ color: chartColor }}
                        formatter={(value) => [Number(value).toFixed(2), title]}
                    />
                    <Line
                        type="monotone" dataKey="y" stroke={chartColor} strokeWidth={2}
                        dot={false} activeDot={{ r: 3, fill: chartColor }}
                        connectNulls
                        animationDuration={300}
                    />
                    {trendData && (
                        <Line
                            type="linear" dataKey="trend" stroke="#ffffff88" strokeWidth={1}
                            strokeDasharray="5 5" dot={false} connectNulls
                            animationDuration={300}
                        />
                    )}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
