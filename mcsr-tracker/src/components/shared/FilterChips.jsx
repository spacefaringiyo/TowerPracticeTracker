export default function FilterChips({ items, activeSet, onToggle, label = '' }) {
    return (
        <div className="flex flex-wrap gap-1.5 items-center">
            {label && <span className="text-xs text-gray-400 mr-1">{label}</span>}
            {items.map(item => {
                const active = activeSet.has(item);
                return (
                    <button
                        key={item}
                        onClick={() => onToggle(item)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${active
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200'
                            }`}
                    >
                        {item}
                    </button>
                );
            })}
        </div>
    );
}
