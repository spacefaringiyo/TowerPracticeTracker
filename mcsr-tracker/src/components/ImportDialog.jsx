import { useState, useRef, useCallback, useEffect } from 'react';
import { processFileContent } from '../engine/parser';
import { saveToStorage, getRowCount, exportJson, importJson, clearDb } from '../db/database';
import { loadConfig, saveConfig } from '../utils/config';

const COMMON_LOG_PATHS = [
    { name: 'Prism (MCSRRanked)', path: String.raw`%APPDATA%\PrismLauncher\instances\MCSRRanked-1.16.1\logs` },
    { name: 'Prism (Ranked)', path: String.raw`%APPDATA%\PrismLauncher\instances\Ranked\logs` },
    { name: 'MultiMC', path: String.raw`%APPDATA%\MultiMC\instances\MCSRRanked-1.16.1\logs` },
    { name: 'MultiMC (Downloads)', path: String.raw`%USERPROFILE%\Downloads\mmc-develop-win32\MultiMC\instances\MCSRRanked-Windows-1.16.1-All.minecraft\logs` },
];

export default function ImportDialog({ onClose, uiScale = 100 }) {
    const [status, setStatus] = useState('');
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [stats, setStats] = useState({ new: 0, dupe: 0, total: 0, runsInBatch: 0 });
    const [dragActive, setDragActive] = useState(false);
    const [copiedPath, setCopiedPath] = useState(null);
    const [pinInput, setPinInput] = useState('');
    const [config, setConfig] = useState(loadConfig());

    const fileInputRef = useRef(null);
    const backupInputRef = useRef(null);

    // Clear "Copied!" state after 2 seconds
    useEffect(() => {
        if (copiedPath) {
            const timer = setTimeout(() => setCopiedPath(null), 2000);
            return () => clearTimeout(timer);
        }
    }, [copiedPath]);

    const processFiles = async (files) => {
        if (!files.length) return;

        setProcessing(true);
        setProgress(0);
        setStats({ new: 0, dupe: 0, total: 0, runsInBatch: 0 });
        setStatus('Initializing...');

        let newCount = 0;
        let dupeCount = 0;

        const onParseResult = (result) => {
            if (result === 'new' || result === 'new_fail') newCount++;
            else dupeCount++;
        };

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setStatus(`Processing: ${file.name}`);
            try {
                const buffer = await file.arrayBuffer();
                processFileContent(file.name, new Uint8Array(buffer), onParseResult);
            } catch (err) {
                console.error(`Error processing ${file.name}:`, err);
            }
            setProgress(Math.round(((i + 1) / files.length) * 100));
        }

        await saveToStorage();
        const finalCount = getRowCount();
        setStats({
            new: newCount,
            dupe: dupeCount,
            runsInBatch: newCount + dupeCount,
            total: finalCount
        });
        setStatus('✅ Import Complete!');
        setProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleFileChange = (e) => processFiles(Array.from(e.target.files));

    const triggerMainImport = async () => {
        // Modern showOpenFilePicker approach (Chromium)
        if (window.showOpenFilePicker) {
            try {
                const handles = await window.showOpenFilePicker({
                    id: 'import-logs',
                    multiple: true,
                    types: [
                        {
                            description: 'Minecraft Logs',
                            accept: { 'text/plain': ['.log'], 'application/gzip': ['.gz'] }
                        }
                    ]
                });
                const files = await Promise.all(handles.map(h => h.getFile()));
                processFiles(files);
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
                console.error('Picker error, falling back:', err);
            }
        }
        // Fallback
        fileInputRef.current?.click();
    };

    const handleDrag = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
        else if (e.type === 'dragleave') setDragActive(false);
    }, []);

    const getAllFilesFromEntry = async (entry) => {
        const files = [];
        if (entry.isFile) {
            const file = await new Promise((resolve) => entry.file(resolve));
            if (file.name.endsWith('.log') || file.name.endsWith('.gz')) {
                files.push(file);
            }
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            const entries = await new Promise((resolve) => {
                const allEntries = [];
                const readBatch = () => {
                    reader.readEntries((batch) => {
                        if (batch.length > 0) {
                            allEntries.push(...batch);
                            readBatch();
                        } else {
                            resolve(allEntries);
                        }
                    });
                };
                readBatch();
            });
            for (const subEntry of entries) {
                files.push(...(await getAllFilesFromEntry(subEntry)));
            }
        }
        return files;
    };

    const handleDrop = useCallback(async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const items = Array.from(e.dataTransfer.items);
        const files = [];

        for (const item of items) {
            const entry = item.webkitGetAsEntry();
            if (entry) {
                files.push(...(await getAllFilesFromEntry(entry)));
            }
        }

        if (files.length > 0) {
            processFiles(files);
        }
    }, []);

    const handleExport = useCallback(() => {
        try {
            const jsonData = exportJson();
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tower_practice_tracker_export_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setStatus('✅ Backup downloaded!');
        } catch (err) {
            setStatus(`Export error: ${err.message}`);
        }
    }, []);

    const handleDataImport = useCallback(async (e) => {
        const file = e.type === 'change' ? e.target.files?.[0] : e;
        if (!file) return;
        setProcessing(true);
        try {
            const text = await file.text();
            const count = importJson(text);
            await saveToStorage();
            setStatus(`✅ Data imported! ${count} runs added.`);
        } catch (err) {
            setStatus(`Import error: ${err.message}`);
        }
        setProcessing(false);
        if (backupInputRef.current) backupInputRef.current.value = '';
    }, []);

    const triggerDataImport = async () => {
        if (window.showOpenFilePicker) {
            try {
                const [handle] = await window.showOpenFilePicker({
                    id: 'import-processed-data',
                    startIn: 'downloads',
                    multiple: false,
                    types: [
                        {
                            description: 'Tracker Export File',
                            accept: { 'application/json': ['.json'] }
                        }
                    ]
                });
                const file = await handle.getFile();
                handleDataImport(file);
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
                console.error('Picker error, falling back:', err);
            }
        }
        backupInputRef.current?.click();
    };

    const handleClear = useCallback(async () => {
        if (!window.confirm('This will permanently delete ALL stored runs. This cannot be undone. Continue?')) return;
        clearDb();
        await saveToStorage();
        setStatus('All data cleared.');
        setStats({ new: 0, dupe: 0, total: 0, runsInBatch: 0 });
    }, []);

    const copyPath = (path) => {
        navigator.clipboard.writeText(path).then(() => {
            setCopiedPath(path);
            setStatus(`Copied path!`);
        });
    };

    const handlePinCustomPath = () => {
        const path = pinInput.trim();
        if (!path) return;
        const newConfig = saveConfig({ custom_import_path: path });
        setConfig(newConfig);
        setPinInput('');
        setStatus('Custom path pinned!');
    };

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6"
            onClick={onClose}
            style={{ zoom: 100 / uiScale }}
        >
            <div className="bg-gray-900 border border-gray-800 w-full max-w-7xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] rounded-2xl"
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="bg-gray-800/50 p-8 border-b border-gray-800">
                    <h2 className="text-3xl font-black text-white flex items-center gap-3">
                        <span className="text-blue-500">📥</span> IMPORT DATA
                    </h2>
                    <p className="text-base text-gray-400 mt-2 font-medium">Add Minecraft log files or folders to track your practice history.</p>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                        {/* 3-Step Guide */}
                        <div className="grid grid-cols-3 gap-4 mb-8">
                            <div className="bg-gray-800/30 p-5 rounded-xl border border-gray-700/30 text-center">
                                <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-black mx-auto mb-3">1</div>
                                <div className="text-sm font-bold text-gray-300 leading-tight tracking-tight">COPY LOG PATH</div>
                            </div>
                            <div className="bg-gray-800/30 p-5 rounded-xl border border-gray-700/30 text-center">
                                <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-black mx-auto mb-3">2</div>
                                <div className="text-sm font-bold text-gray-300 leading-tight tracking-tight">OPEN FOLDER</div>
                            </div>
                            <div className="bg-gray-800/30 p-5 rounded-xl border border-gray-700/30 text-center">
                                <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-black mx-auto mb-3">3</div>
                                <div className="text-sm font-bold text-gray-300 leading-tight tracking-tight">DROP HERE</div>
                            </div>
                        </div>

                        {/* Path Shortcuts */}
                        <div className="mb-8">
                            <label className="text-sm font-black text-gray-500 uppercase tracking-widest mb-3 block">Quick Path Shortcuts</label>
                            <div className="grid grid-cols-2 gap-4">
                                {/* Pinned Custom Path */}
                                {config.custom_import_path && (
                                    <button
                                        onClick={() => copyPath(config.custom_import_path)}
                                        className="w-full flex items-center justify-between gap-4 bg-blue-950/20 hover:bg-blue-900/30 border border-blue-500/30 hover:border-blue-500 rounded-xl px-5 py-4 transition-all group scale-[1.01] mb-1">
                                        <div className="flex flex-col items-start min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-black text-blue-400">PINNED PATH</span>
                                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                                            </div>
                                            <span className="text-sm font-mono text-gray-400 truncate w-full mt-1.5">{config.custom_import_path}</span>
                                        </div>
                                        <span className={`text-sm font-bold px-3 py-1.5 rounded-lg transition-all ${copiedPath === config.custom_import_path ? 'bg-green-500 text-white opacity-100' : 'text-blue-500 bg-blue-500/10 opacity-0 group-hover:opacity-100'}`}>
                                            {copiedPath === config.custom_import_path ? 'COPIED!' : 'COPY'}
                                        </span>
                                    </button>
                                )}

                                {COMMON_LOG_PATHS.map(item => (
                                    <button key={item.name}
                                        onClick={() => copyPath(item.path)}
                                        className="w-full flex items-center justify-between gap-4 bg-gray-950/50 hover:bg-blue-900/10 border border-gray-800 hover:border-blue-500/30 rounded-xl px-5 py-4 transition-all group">
                                        <div className="flex flex-col items-start min-w-0">
                                            <span className="text-sm font-black text-gray-400 group-hover:text-blue-400">{item.name}</span>
                                            <span className="text-sm font-mono text-gray-600 truncate w-full mt-1">{item.path}</span>
                                        </div>
                                        <span className={`text-sm font-bold px-3 py-1.5 rounded-lg transition-all ${copiedPath === item.path ? 'bg-green-500 text-white opacity-100' : 'text-blue-500 bg-blue-500/10 opacity-0 group-hover:opacity-100'
                                            }`}>
                                            {copiedPath === item.path ? 'COPIED!' : 'COPY'}
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {/* Pin Input */}
                            <div className="mt-4 flex gap-3">
                                <input
                                    type="text"
                                    value={pinInput}
                                    onChange={(e) => setPinInput(e.target.value)}
                                    placeholder="Paste your custom log folder path here..."
                                    className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-5 py-3 text-sm font-mono text-gray-300 placeholder:text-gray-600 focus:border-blue-500/50 outline-none transition-all"
                                />
                                <button
                                    onClick={handlePinCustomPath}
                                    className="bg-gray-800 hover:bg-blue-600 text-white px-5 py-3 rounded-xl text-xs font-black tracking-widest uppercase transition-all whitespace-nowrap"
                                >
                                    PIN PATH
                                </button>
                            </div>
                        </div>

                        {/* Drop Zone */}
                        <div
                            onDragEnter={handleDrag}
                            onDragOver={handleDrag}
                            onDragLeave={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => !processing && triggerMainImport()}
                            className={`relative group h-64 border-3 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer overflow-hidden ${dragActive ? 'border-blue-500 bg-blue-500/10' :
                                processing ? 'border-gray-700 bg-gray-900/50 cursor-wait' :
                                    'border-gray-700 hover:border-gray-500 bg-gray-950/30 hover:bg-gray-900/50'
                                }`}
                        >
                            {processing ? (
                                <div className="w-full px-16 flex flex-col items-center">
                                    <div className="text-3xl mb-4">⚡</div>
                                    <div className="w-full bg-gray-800 h-4 rounded-full overflow-hidden mb-4">
                                        <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${progress}%` }} />
                                    </div>
                                    <div className="text-lg font-black text-white tracking-widest uppercase">{progress}%</div>
                                    <div className="text-sm font-bold text-gray-400 mt-2 truncate max-w-full italic">{status}</div>
                                </div>
                            ) : (
                                <>
                                    <div className={`text-6xl mb-6 transition-transform duration-300 ${dragActive ? 'scale-125' : 'group-hover:scale-110'}`}>
                                        {dragActive ? '📥' : '📂'}
                                    </div>
                                    <div className="text-xl font-black text-white tracking-widest uppercase text-center px-8 mb-2">
                                        {dragActive ? 'Release to Start' : 'Drop Logs Folder or Select Files'}
                                    </div>
                                    <div className="text-sm font-medium text-gray-400 flex flex-col items-center gap-1.5">
                                        <span>Supports multiple files and folders</span>
                                        <span className="text-blue-400 font-bold">Tip: Ctrl+A inside your folder to select all!</span>
                                    </div>
                                </>
                            )}
                            <input
                                id="import-log-input"
                                name="import-log-selection"
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept=".gz,.log"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </div>


                        {/* Persistent Status Message (outside busy state) */}
                        {!processing && status && (
                            <div className={`mt-6 p-4 rounded-xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2 shadow-lg ${status.includes('error') ? 'bg-red-900/20 border border-red-500/30 text-red-200' : 'bg-emerald-900/20 border border-emerald-500/30 text-emerald-100'}`}>
                                <div className="text-2xl">{status.includes('error') ? '⚠️' : '✅'}</div>
                                <div className="text-lg font-bold">{status}</div>
                            </div>
                        )}

                        {/* Stats Summary */}
                        {(stats.new > 0 || stats.dupe > 0) && !processing && (
                            <div className="mt-8 p-6 rounded-2xl bg-blue-900/10 border border-blue-500/20 animate-in fade-in zoom-in-95 duration-300">
                                <div className="flex justify-around items-center">
                                    <div className="text-center">
                                        <div className="text-xs font-black text-gray-500 uppercase mb-2">Runs in Files</div>
                                        <div className="text-3xl font-black text-white tracking-tight">{stats.runsInBatch}</div>
                                    </div>
                                    <div className="w-[1px] h-12 bg-gray-700" />
                                    <div className="text-center">
                                        <div className="text-xs font-black text-gray-500 uppercase mb-2">New Imports</div>
                                        <div className="text-3xl font-black text-blue-400 tracking-tight">{stats.new}</div>
                                    </div>
                                    <div className="w-[1px] h-12 bg-gray-700" />
                                    <div className="text-center">
                                        <div className="text-xs font-black text-gray-500 uppercase mb-2">Already Logged</div>
                                        <div className="text-3xl font-black text-gray-500 tracking-tight">{stats.dupe}</div>
                                    </div>
                                    <div className="w-[1px] h-12 bg-gray-700" />
                                    <div className="text-center">
                                        <div className="text-xs font-black text-gray-500 uppercase mb-2">Total Database</div>
                                        <div className="text-3xl font-black text-white tracking-tight">{stats.total}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN: Info Sidebar */}
                    <div className="w-96 bg-gray-950/30 border-l border-gray-800 p-8 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                        <div className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1 px-1">Good to Know</div>

                        {/* Security Card */}
                        <div className="bg-emerald-900/10 border border-emerald-500/20 p-6 rounded-2xl shadow-lg shadow-emerald-900/5">
                            <div className="text-3xl mb-4">🔒</div>
                            <h3 className="text-emerald-400 font-bold text-lg mb-2">Your Data is Safe</h3>
                            <p className="text-emerald-100/70 text-sm leading-relaxed font-medium">
                                All log processing happens 100% locally on your device. No files are ever uploaded to any server.
                            </p>
                        </div>

                        {/* Export Card */}
                        <div className="bg-blue-900/10 border border-blue-500/20 p-6 rounded-2xl shadow-lg shadow-blue-900/5">
                            <div className="text-3xl mb-4">📤</div>
                            <h3 className="text-blue-400 font-bold text-lg mb-2">Export & Share</h3>
                            <p className="text-blue-100/70 text-sm leading-relaxed font-medium">
                                Use the <b>Export Data</b> button below to save your processed runs to a JSON file for backup or sharing.
                            </p>
                        </div>

                        {/* Smart Import Card */}
                        <div className="bg-gray-800/30 border border-gray-700/50 p-6 rounded-2xl">
                            <div className="text-3xl mb-4">⚡</div>
                            <h3 className="text-gray-300 font-bold text-lg mb-2">Smart Dupe Check</h3>
                            <p className="text-gray-400 text-sm leading-relaxed font-medium">
                                Don't worry about selecting the same files twice. The importer automatically detects and skips duplicates.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="bg-gray-950 p-6 border-t border-gray-800 flex items-center justify-between">
                    <div className="flex gap-3">
                        <button onClick={handleExport}
                            className="text-xs font-black text-gray-500 hover:text-white uppercase tracking-widest px-4 py-3 bg-gray-900 hover:bg-gray-800 rounded-lg transition-all">
                            Export Data
                        </button>
                        <button onClick={triggerDataImport}
                            className="text-xs font-black text-gray-500 hover:text-white uppercase tracking-widest px-4 py-3 bg-gray-900 hover:bg-gray-800 rounded-lg transition-all">
                            Import Data
                        </button>
                        <input
                            id="import-processed-input"
                            name="import-processed-selection"
                            ref={backupInputRef}
                            type="file"
                            accept=".json"
                            className="hidden"
                            onChange={handleDataImport}
                        />
                        <button onClick={handleClear}
                            className="text-xs font-black text-red-900 hover:text-red-500 uppercase tracking-widest px-4 py-3 hover:bg-red-950/20 rounded-lg transition-all">
                            Clear Data
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        <button onClick={onClose}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-3 rounded-xl text-base font-black tracking-widest uppercase transition-all shadow-xl shadow-blue-900/20 active:scale-95 hover:scale-[1.02]">
                            DONE
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
