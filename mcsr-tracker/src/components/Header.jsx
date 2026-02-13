export default function Header({ onImport, onCredits, onSettings }) {
    return (
        <div className="flex items-center justify-between px-1">
            <h1 className="text-xl font-bold tracking-tight">Tower Practice Tracker</h1>
            <div className="flex items-center gap-1.5">
                <button
                    onClick={onImport}
                    className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                >
                    <span>📤</span> Import Data
                </button>
                <button
                    onClick={onCredits}
                    className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                    title="Credits"
                >
                    ℹ️
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
