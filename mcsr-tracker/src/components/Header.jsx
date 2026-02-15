import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Header({ uiScale, onScaleChange, onImport, onCredits, onSettings }) {
    const [showZoom, setShowZoom] = useState(false);
    const zoomRef = useRef(null);
    const [popPos, setPopPos] = useState({ top: 0, right: 0 });

    // Close zoom popover when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            const portalContent = document.getElementById('zoom-portal-content');
            if (zoomRef.current && !zoomRef.current.contains(event.target) &&
                portalContent && !portalContent.contains(event.target)) {
                setShowZoom(false);
            }
        }
        if (showZoom) {
            document.addEventListener('mousedown', handleClickOutside);

            if (zoomRef.current) {
                const rect = zoomRef.current.getBoundingClientRect();
                setPopPos({
                    top: rect.bottom + 8,
                    right: window.innerWidth - rect.right
                });
            }
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showZoom]);

    return (
        <div className="flex items-center justify-between px-1 relative">
            <h1 className="text-xl font-bold tracking-tight">Tower Practice Tracker</h1>
            <div className="flex items-center gap-1.5">
                <button
                    onClick={onImport}
                    className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors mr-2"
                >
                    <span>📤</span> Import Data
                </button>

                <div className="relative" ref={zoomRef}>
                    <button
                        onClick={() => setShowZoom(!showZoom)}
                        className={`flex items-center gap-3 px-3 py-1.5 rounded-lg border transition-all mr-2 ${showZoom ? 'bg-gray-800 border-blue-500 shadow-lg shadow-blue-500/10' : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600'}`}
                    >
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Zoom</span>
                        <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden relative">
                            <div className="absolute top-0 left-0 h-full bg-blue-500/50" style={{ width: `${(uiScale - 50) / 1.5}%` }} />
                        </div>
                        <span className="text-[11px] font-bold text-blue-400 w-8 text-right">{uiScale}%</span>
                    </button>

                    {showZoom && createPortal(
                        <div
                            id="zoom-portal-content"
                            className="fixed w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 z-[999] animate-in fade-in zoom-in-95 duration-200"
                            style={{
                                top: popPos.top,
                                right: popPos.right,
                                pointerEvents: 'auto'
                            }}
                        >
                            <div className="flex items-center justify-between mb-5 px-1">
                                <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Interface Scale</span>
                                <button
                                    onClick={() => onScaleChange(100)}
                                    className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase"
                                >
                                    Reset (100%)
                                </button>
                            </div>

                            <div className="flex items-center gap-4 mb-6">
                                <button
                                    onClick={() => onScaleChange(Math.max(50, uiScale - 5))}
                                    className="w-10 h-10 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors text-lg font-bold border border-gray-700/50"
                                >
                                    -
                                </button>
                                <div className="flex-1 px-1">
                                    <input
                                        type="range" min="50" max="200" step="5"
                                        value={uiScale}
                                        onChange={e => onScaleChange(parseInt(e.target.value))}
                                        className="w-full accent-blue-500 h-2 cursor-pointer bg-gray-800 rounded-full"
                                    />
                                </div>
                                <button
                                    onClick={() => onScaleChange(Math.min(200, uiScale + 5))}
                                    className="w-10 h-10 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors text-lg font-bold border border-gray-700/50"
                                >
                                    +
                                </button>
                            </div>

                            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/30">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-semibold text-gray-400">Current Scale:</span>
                                    <span className="text-lg font-bold text-blue-400 font-mono">{uiScale}%</span>
                                </div>
                                <p className="text-[11px] text-gray-500 leading-relaxed mt-2 italic">
                                    Adjusts the overall density of the dashboard to fit your monitor.
                                </p>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>

                <button
                    onClick={onCredits}
                    className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                    title="Credits"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                    </svg>
                </button>
                <button
                    onClick={onSettings}
                    className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                    title="Settings"
                >
                    ⚙️
                </button>
            </div>
        </div>
    );
}
