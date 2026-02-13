import { useState, useRef, useCallback } from 'react';
import { processFileContent } from '../engine/parser';
import { saveToStorage, getRowCount, exportJson, importJson, clearDb } from '../db/database';

const COMMON_LOG_PATHS = [
    String.raw`%APPDATA%\PrismLauncher\instances\MCSRRanked-1.16.1\logs`,
    String.raw`%APPDATA%\PrismLauncher\instances\Ranked\logs`,
    String.raw`%APPDATA%\MultiMC\instances\MCSRRanked-1.16.1\logs`,
];

export default function ImportDialog({ onClose }) {
    const [status, setStatus] = useState('');
    const [processing, setProcessing] = useState(false);
    const fileInputRef = useRef(null);
    const backupInputRef = useRef(null);

    const handleFileChange = useCallback(async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        setProcessing(true);
        const countBefore = getRowCount();

        for (let i = 0; i < files.length; i++) {
            setStatus(`Processing: ${i + 1}/${files.length} — ${files[i].name}`);
            try {
                const buffer = await files[i].arrayBuffer();
                processFileContent(files[i].name, new Uint8Array(buffer));
            } catch (err) {
                console.error(`Error processing ${files[i].name}:`, err);
            }
        }

        await saveToStorage();
        const countAfter = getRowCount();
        const newRuns = countAfter - countBefore;
        setStatus(`✅ Done! ${newRuns} new run(s) added. (${countAfter} total)`);
        setProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    const handleExport = useCallback(() => {
        try {
            const jsonData = exportJson();
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mcsr_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setStatus('✅ Backup downloaded!');
        } catch (err) {
            setStatus(`Export error: ${err.message}`);
        }
    }, []);

    const handleBackupImport = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setProcessing(true);
        try {
            const text = await file.text();
            const count = importJson(text);
            await saveToStorage();
            setStatus(`✅ Backup restored! ${count} runs imported.`);
        } catch (err) {
            setStatus(`Backup error: ${err.message}`);
        }
        setProcessing(false);
        if (backupInputRef.current) backupInputRef.current.value = '';
    }, []);

    const handleClear = useCallback(async () => {
        if (!window.confirm('This will permanently delete all runs stored in this browser. This action cannot be undone. Continue?')) return;
        clearDb();
        await saveToStorage();
        setStatus('All data cleared.');
    }, []);

    const copyPath = useCallback((path) => {
        navigator.clipboard.writeText(path).then(() => {
            setStatus(`Copied: ${path}`);
        });
    }, []);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-gray-900 rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto shadow-2xl border border-gray-700"
                onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-3">Import Data</h2>
                <p className="text-base text-gray-200 mb-1">Import your Minecraft log files to track your runs.</p>
                <p className="text-sm text-gray-400 mb-4">Select all files in your logs folder. Duplicates are skipped automatically.</p>

                {/* Path Hints */}
                <div className="mb-4">
                    <p className="text-sm font-bold mb-2">📁 Common log folder locations (Click to Copy):</p>
                    <div className="space-y-1.5">
                        {COMMON_LOG_PATHS.map(path => (
                            <button key={path}
                                className="w-full flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg px-3 py-2.5 text-left transition-colors"
                                onClick={() => copyPath(path)}>
                                <span className="text-blue-300 text-sm shrink-0">📋</span>
                                <span className="text-blue-300 text-xs font-mono break-all">{path}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <p className="text-sm text-blue-300 italic mb-4">
                    (Tip: Press Ctrl+A inside the folder to select all files at once)
                </p>

                {/* Import Button */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={processing}
                    className="bg-blue-700 hover:bg-blue-600 disabled:bg-blue-900 disabled:cursor-wait text-white px-5 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors mb-3"
                >
                    📂 Select Log Files (.gz / .log)
                </button>
                <input ref={fileInputRef} type="file" multiple accept=".gz,.log" className="hidden" onChange={handleFileChange} />

                {/* Status */}
                {status && <p className="text-sm text-yellow-400 mb-3">{status}</p>}

                <hr className="border-gray-700 my-4" />

                {/* Data Management */}
                <div className="flex flex-wrap gap-2 mb-3">
                    <button onClick={handleExport}
                        className="border border-gray-600 hover:bg-gray-800 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors">
                        ⬇️ Export Data
                    </button>
                    <button onClick={() => backupInputRef.current?.click()}
                        className="border border-gray-600 hover:bg-gray-800 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors">
                        🔄 Import Backup
                    </button>
                    <input ref={backupInputRef} type="file" accept=".json" className="hidden" onChange={handleBackupImport} />
                </div>

                <button onClick={handleClear}
                    className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1.5 transition-colors">
                    🗑️ Clear All Data
                </button>

                <div className="flex justify-end mt-6">
                    <button onClick={onClose} className="text-gray-400 hover:text-white px-4 py-2 transition-colors">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
