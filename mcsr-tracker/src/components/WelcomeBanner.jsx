import { createPortal } from 'react-dom';

export default function WelcomeBanner({ onImport }) {
    return createPortal(
        <div className="fixed inset-0 flex items-center justify-center z-[100] bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-800 border border-gray-600 rounded-2xl p-10 shadow-2xl text-center max-w-lg mx-4">
                <h2 className="text-2xl font-bold text-yellow-400 mb-3">
                    Welcome to Tower Practice Tracker!
                </h2>
                <p className="text-lg text-gray-200 mb-8">
                    Import your log files to see your statistics and track your progress.
                </p>
                <button
                    onClick={onImport}
                    className="bg-blue-700 hover:bg-blue-600 text-white px-8 py-4 rounded-xl text-lg font-medium inline-flex items-center gap-3 transition-colors shadow-lg"
                >
                    <span>📤</span> Import My Data Now
                </button>
            </div>
        </div>,
        document.body
    );
}
