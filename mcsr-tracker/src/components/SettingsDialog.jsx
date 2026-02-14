import { useState } from 'react';
import { loadConfig, saveConfig } from '../utils/config';

export default function SettingsDialog({ leftPanelWidth, onWidthChange, onClose }) {
    const cfg = loadConfig();
    const [width, setWidth] = useState(leftPanelWidth);
    const [navMode, setNavMode] = useState(cfg.navigation_mode || 'default');
    const [threshold, setThreshold] = useState(cfg.session_gap_threshold || 30);

    const handleSave = () => {
        saveConfig({
            left_panel_width: width,
            navigation_mode: navMode,
            session_gap_threshold: threshold
        });
        onWidthChange(width);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-900 rounded-xl p-6 w-[480px] shadow-2xl border border-gray-700"
                onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-5">Settings</h2>

                <h3 className="font-semibold mb-2 text-sm">Appearance</h3>
                <p className="text-sm text-gray-300 mb-1">Left Panel Width: <span className="text-white font-medium">{width}px</span></p>
                <input
                    type="range" min="300" max="800" step="10"
                    value={width}
                    onChange={e => setWidth(parseInt(e.target.value))}
                    className="w-full mb-4 accent-blue-500"
                />

                <hr className="border-gray-700 my-4" />

                <h3 className="font-semibold mb-2 text-sm">Behavior</h3>
                <div className="space-y-2 mb-6">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                        <input type="radio" name="navMode" value="default"
                            checked={navMode === 'default'}
                            onChange={() => setNavMode('default')}
                            className="accent-blue-500" />
                        <span className="text-sm">Show All Types (Default)</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                        <input type="radio" name="navMode" value="filter"
                            checked={navMode === 'filter'}
                            onChange={() => setNavMode('filter')}
                            className="accent-blue-500" />
                        <span className="text-sm">Filter by Clicked Type</span>
                    </label>
                </div>

                <div className="flex items-center justify-between bg-gray-800/50 p-3 rounded-lg border border-gray-700/50 mb-6">
                    <div className="flex flex-col">
                        <span className="text-sm font-medium">AFK Gap Threshold</span>
                        <span className="text-[11px] text-gray-500">Gaps longer than this are excluded from session time</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="number" min="1" max="1440"
                            value={threshold}
                            onChange={e => setThreshold(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-16 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-center focus:outline-none focus:border-blue-500"
                        />
                        <span className="text-xs text-gray-400">min</span>
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose}
                        className="text-gray-400 hover:text-white px-4 py-2 rounded transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleSave}
                        className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        Save &amp; Close
                    </button>
                </div>
            </div>
        </div>
    );
}
