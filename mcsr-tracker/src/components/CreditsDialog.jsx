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
                        Made for &amp; Advised by <span className="font-bold">SolandMoon</span>
                    </p>
                    <p className="text-base">
                        Made by{' '}
                        <a href="https://x.com/spacefaringiyo" target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 underline hover:text-blue-300 transition-colors">iyo</a>
                        {' & '}
                        <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 underline hover:text-blue-300 transition-colors">Gemini</a>
                    </p>
                </div>
                <p className="text-xs text-gray-500 mb-5">v2.0.0 (Web)</p>
                <button onClick={onClose} className="text-gray-400 hover:text-white px-4 py-2 transition-colors">
                    Close
                </button>
            </div>
        </div>
    );
}
