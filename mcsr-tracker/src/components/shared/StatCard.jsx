import React from 'react';

export default function StatCard({ label, value, subValue = null, equalValue = null, color = 'text-white', equalColor = null, tooltip = null }) {
    const secondColor = equalColor || color;
    return (
        <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center border border-gray-700/30 flex flex-col justify-center min-h-[54px]"
            title={tooltip}>
            <p className={`text-[10px] text-gray-400 uppercase tracking-wide mb-0.5 ${tooltip ? 'cursor-help' : ''}`}>{label}</p>
            <div className="flex flex-col items-center">
                <p className={`text-sm font-bold leading-tight ${color}`}>{value}</p>
                {equalValue && (
                    <p className={`text-sm font-bold leading-tight ${secondColor}`}>{equalValue}</p>
                )}
                {subValue && !equalValue && (
                    <p className="text-[10px] text-gray-500 font-medium leading-tight">{subValue}</p>
                )}
            </div>
        </div>
    );
}
