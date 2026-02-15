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
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center z-50"
            onClick={onClose}
            style={{ zoom: 100 / uiScale }}
        >
            <div className="bg-gray-900 border-x border-gray-800 w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col h-full"
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="bg-gray-800/50 p-6 border-b border-gray-800">
                    <h2 className="text-2xl font-black text-white flex items-center gap-2">
                        <span className="text-blue-500">📥</span> IMPORT DATA
                    </h2>
                    <p className="text-sm text-gray-400 mt-1 font-medium">Add Minecraft log files or folders to track your practice history.</p>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                    {/* 3-Step Guide */}
                    <div className="grid grid-cols-3 gap-3 mb-6">
                        <div className="bg-gray-800/30 p-4 rounded-xl border border-gray-700/30 text-center">
                            <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-black mx-auto mb-2">1</div>
                            <div className="text-xs font-bold text-gray-300 leading-tight tracking-tight">COPY LOG PATH</div>
                        </div>
                        <div className="bg-gray-800/30 p-4 rounded-xl border border-gray-700/30 text-center">
                            <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-black mx-auto mb-2">2</div>
                            <div className="text-xs font-bold text-gray-300 leading-tight tracking-tight">OPEN FOLDER</div>
                        </div>
                        <div className="bg-gray-800/30 p-4 rounded-xl border border-gray-700/30 text-center">
                            <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-black mx-auto mb-2">3</div>
                            <div className="text-xs font-bold text-gray-300 leading-tight tracking-tight">DROP HERE</div>
                        </div>
                    </div>

                    {/* Path Shortcuts */}
                    <div className="mb-6">
                        <label className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2 block">Quick Path Shortcuts</label>
                        <div className="grid grid-cols-1 gap-2">
                            {/* Pinned Custom Path */}
                            {config.custom_import_path && (
                                <button
                                    onClick={() => copyPath(config.custom_import_path)}
                                    className="w-full flex items-center justify-between gap-3 bg-blue-950/20 hover:bg-blue-900/30 border border-blue-500/30 hover:border-blue-500 rounded-lg px-4 py-3 transition-all group scale-[1.01] mb-1">
                                    <div className="flex flex-col items-start min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-black text-blue-400">PINNED PATH</span>
                                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                                        </div>
                                        <span className="text-xs font-mono text-gray-400 truncate w-full">{config.custom_import_path}</span>
                                    </div>
                                    <span className={`text-xs font-bold px-2 py-1 rounded transition-all ${copiedPath === config.custom_import_path ? 'bg-green-500 text-white opacity-100' : 'text-blue-500 bg-blue-500/10 opacity-0 group-hover:opacity-100'}`}>
                                        {copiedPath === config.custom_import_path ? 'COPIED!' : 'COPY'}
                                    </span>
                                </button>
                            )}

                            {COMMON_LOG_PATHS.map(item => (
                                <button key={item.name}
                                    onClick={() => copyPath(item.path)}
                                    className="w-full flex items-center justify-between gap-3 bg-gray-950/50 hover:bg-blue-900/10 border border-gray-800 hover:border-blue-500/30 rounded-lg px-4 py-3 transition-all group">
                                    <div className="flex flex-col items-start min-w-0">
                                        <span className="text-xs font-black text-gray-400 group-hover:text-blue-400">{item.name}</span>
                                        <span className="text-xs font-mono text-gray-600 truncate w-full">{item.path}</span>
                                    </div>
                                    <span className={`text-xs font-bold px-2 py-1 rounded transition-all ${copiedPath === item.path ? 'bg-green-500 text-white opacity-100' : 'text-blue-500 bg-blue-500/10 opacity-0 group-hover:opacity-100'
                                        }`}>
                                        {copiedPath === item.path ? 'COPIED!' : 'COPY'}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Pin Input */}
                        <div className="mt-3 flex gap-2">
                            <input
                                type="text"
                                value={pinInput}
                                onChange={(e) => setPinInput(e.target.value)}
                                placeholder="Paste your custom log folder path here..."
                                className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-xs font-mono text-gray-300 placeholder:text-gray-600 focus:border-blue-500/50 outline-none transition-all"
                            />
                            <button
                                onClick={handlePinCustomPath}
                                className="bg-gray-800 hover:bg-blue-600 text-white px-4 py-2.5 rounded-lg text-xs font-black tracking-widest uppercase transition-all whitespace-nowrap"
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
                        className={`relative group h-48 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer overflow-hidden ${dragActive ? 'border-blue-500 bg-blue-500/10' :
                            processing ? 'border-gray-700 bg-gray-900/50 cursor-wait' :
                                'border-gray-800 hover:border-gray-600 bg-gray-950/50'
                            }`}
                    >
                        {processing ? (
                            <div className="w-full px-12 flex flex-col items-center">
                                <div className="text-2xl mb-3">⚡</div>
                                <div className="w-full bg-gray-800 h-3 rounded-full overflow-hidden mb-3">
                                    <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${progress}%` }} />
                                </div>
                                <div className="text-sm font-black text-white tracking-widest uppercase">{progress}%</div>
                                <div className="text-xs font-bold text-gray-400 mt-2 truncate max-w-full italic">{status}</div>
                            </div>
                        ) : (
                            <>
                                <div className={`text-4xl mb-3 transition-transform ${dragActive ? 'scale-125' : 'group-hover:scale-110'}`}>
                                    {dragActive ? '📥' : '📂'}
                                </div>
                                <div className="text-sm font-black text-white tracking-widest uppercase text-center px-4">
                                    {dragActive ? 'Release to Start' : 'Drop Logs Folder or Select Files'}
                                </div>
                                <div className="text-xs font-bold text-gray-500 mt-2 flex flex-col items-center gap-1">
                                    <span>Supports multiple files and folders</span>
                                    <span className="text-blue-400/80 italic">Tip: Ctrl+A inside your folder to select all!</span>
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
                        <div className={`mt-4 p-3 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${status.includes('error') ? 'bg-red-900/20 border border-red-500/30 text-red-200' : 'bg-emerald-900/20 border border-emerald-500/30 text-emerald-200'}`}>
                            <div className="text-lg">{status.includes('error') ? '⚠️' : '✅'}</div>
                            <div className="text-xs font-bold">{status}</div>
                        </div>
                    )}

                    {/* Stats Summary */}
                    {(stats.new > 0 || stats.dupe > 0) && !processing && (
                        <div className="mt-6 p-4 rounded-xl bg-blue-900/10 border border-blue-500/20 animate-in fade-in zoom-in-95 duration-300">
                            <div className="flex justify-around items-center">
                                <div className="text-center">
                                    <div className="text-xs font-black text-gray-500 uppercase mb-1">Runs in Files</div>
                                    <div className="text-2xl font-black text-white tracking-tight">{stats.runsInBatch}</div>
                                </div>
                                <div className="w-[1px] h-10 bg-gray-800" />
                                <div className="text-center">
                                    <div className="text-xs font-black text-gray-500 uppercase mb-1">New Imports</div>
                                    <div className="text-2xl font-black text-blue-400 tracking-tight">{stats.new}</div>
                                </div>
                                <div className="w-[1px] h-10 bg-gray-800" />
                                <div className="text-center">
                                    <div className="text-xs font-black text-gray-500 uppercase mb-1">Already Logged</div>
                                    <div className="text-2xl font-black text-gray-400 tracking-tight">{stats.dupe}</div>
                                </div>
                                <div className="w-[1px] h-10 bg-gray-800" />
                                <div className="text-center">
                                    <div className="text-xs font-black text-gray-500 uppercase mb-1">Total Database</div>
                                    <div className="text-2xl font-black text-white tracking-tight">{stats.total}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="bg-gray-950 p-6 border-t border-gray-800 flex items-center justify-between">
                    <div className="flex gap-2">
                        <button onClick={handleExport}
                            className="text-xs font-black text-gray-500 hover:text-white uppercase tracking-widest px-3 py-2 transition-colors">
                            Export Data
                        </button>
                        <button onClick={triggerDataImport}
                            className="text-xs font-black text-gray-500 hover:text-white uppercase tracking-widest px-3 py-2 transition-colors">
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
                            className="text-xs font-black text-red-900 hover:text-red-500 uppercase tracking-widest px-3 py-2 transition-colors">
                            Clear Data
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        <button onClick={onClose}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-lg text-sm font-black tracking-widest uppercase transition-all shadow-lg active:scale-95">
                            DONE
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
