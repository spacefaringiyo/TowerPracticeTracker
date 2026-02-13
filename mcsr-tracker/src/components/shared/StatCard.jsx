import React from 'react';

export default function StatCard({ label, value, color = 'text-white' }) {
    return (
        <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center border border-gray-700/30">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
            <p className={`text-sm font-bold ${color}`}>{value}</p>
        </div>
    );
}
