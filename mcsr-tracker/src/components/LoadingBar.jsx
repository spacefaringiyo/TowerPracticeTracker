export default function LoadingBar({ show }) {
    return (
        <div className={`h-1 bg-gray-800 rounded overflow-hidden transition-opacity duration-200 ${show ? 'opacity-100' : 'opacity-0'}`}>
            <div className="h-full w-[30%] bg-blue-500 rounded animate-loading-bar" />
        </div>
    );
}
