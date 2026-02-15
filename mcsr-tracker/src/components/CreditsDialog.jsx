export default function CreditsDialog({ onClose }) {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-gray-900 rounded-xl p-8 min-w-[320px] shadow-2xl border border-gray-700 text-center"
                onClick={e => e.stopPropagation()}
            >
                <h2 className="text-xl font-bold mb-5">Credits</h2>
                <div className="space-y-3 mb-5">
                    <p className="text-base">
                        Made for &amp; Advised by <a href="https://x.com/PleonexiaLost" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-500 hover:text-blue-400 transition-colors">SolandMoon</a>
                    </p>
                    <p className="text-base">
                        Made by{' '}
                        <a href="https://x.com/spacefaringiyo" target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 underline hover:text-blue-300 transition-colors">iyo</a>
                        {' & '}
                        <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 underline hover:text-blue-300 transition-colors">Gemini</a>
                        {' & '}
                        <a href="https://claude.ai" target="_blank" rel="noopener noreferrer"
                            className="text-purple-400 underline hover:text-purple-300 transition-colors">Claude Opus</a>
                    </p>
                </div>
                <div className="mb-5">
                    <a href="https://github.com/spacefaringiyo/TowerPracticeTracker" target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm border border-gray-700 transition-all">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
                        GitHub Repository
                    </a>
                </div>
                <p className="text-xs text-gray-500 mb-5">v2.0.0 (Web)</p>
                <button onClick={onClose} className="text-gray-400 hover:text-white px-4 py-2 transition-colors">
                    Close
                </button>
            </div>
        </div>
    );
}
