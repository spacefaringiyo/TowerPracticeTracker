import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function DistChart({ data, chartColor = '#22d3ee' }) {
    const formattedData = useMemo(() => {
        if (!data || Object.keys(data).length === 0) return [];

        // Sort keys numerically
        return Object.keys(data)
            .sort((a, b) => Number(a) - Number(b))
            .map(count => ({
                name: `${count}`,
                percentage: Number(data[count].toFixed(1)),
                count: count
            }));
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
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', fontSize: '11px' }}
                        itemStyle={{ color: chartColor }}
                        formatter={(val) => [`${val}%`, 'Distribution']}
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
