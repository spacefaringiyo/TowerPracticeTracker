import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function DistChart({ data, chartColor = '#22d3ee' }) {
    const formattedData = useMemo(() => {
        if (!data || Object.keys(data).length === 0) return [];

        // Sort keys numerically
        return Object.keys(data)
            .sort((a, b) => Number(a) - Number(b))
            .map(count => {
                const entry = data[count];
                const isObj = entry !== null && typeof entry === 'object';
                const percentage = isObj ? (entry.percentage || 0) : (entry || 0);
                const runCount = isObj ? entry.runCount : null;

                return {
                    name: `${count}`,
                    percentage: Number(percentage.toFixed(1)),
                    runCount: runCount,
                    expl: count
                };
            });
    }, [data]);

    if (formattedData.length === 0) {
        return (
            <div className="h-[150px] bg-black/30 rounded-lg flex items-center justify-center text-gray-500 text-sm">
                No successes to analyze
            </div>
        );
    }

    return (
        <div className="h-[150px] bg-black/30 rounded-lg p-2">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis
                        dataKey="name"
                        tick={{ fill: '#9ca3af', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        tick={{ fill: '#6b7280', fontSize: 9 }}
                        axisLine={false}
                        tickLine={false}
                        unit="%"
                    />
                    <Tooltip
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', fontSize: '11px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ color: chartColor }}
                        formatter={(val, name, props) => {
                            const { runCount } = props.payload;
                            const label = runCount !== null ? `${runCount} Runs` : 'Distribution';
                            return [`${val}%`, label];
                        }}
                    />
                    <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                        {formattedData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={chartColor} fillOpacity={0.6 + (index / formattedData.length) * 0.4} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
