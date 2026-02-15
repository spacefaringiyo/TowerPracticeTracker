import { useState, useEffect, useCallback } from 'react';
import { initDatabase, saveToStorage, getRowCount } from './db/database';
import { loadConfig, saveConfig } from './utils/config';
import Header from './components/Header';
import LoadingBar from './components/LoadingBar';
import WelcomeBanner from './components/WelcomeBanner';
import RecentRuns from './components/RecentRuns';
import TowerAnalytics from './components/TowerAnalytics';
import SessionAnalytics from './components/SessionAnalytics';
import HeightAnalytics from './components/HeightAnalytics';
import ImportDialog from './components/ImportDialog';
import CalendarAnalytics from './components/CalendarAnalytics';
import SettingsDialog from './components/SettingsDialog';
import CreditsDialog from './components/CreditsDialog';

const TABS = [
    { name: 'Session Analytics', icon: '📊' },
    { name: 'Tower Analytics', icon: '🏗️' },
    { name: 'Height Analytics', icon: '📏' },
    { name: 'Calendar', icon: '📅' },
];

export default function App() {
    const [dbReady, setDbReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const [activeTab, setActiveTab] = useState(0); // Back to Session Analytics as default
    const [leftPanelWidth, setLeftPanelWidth] = useState(630);
    const [uiScale, setUiScale] = useState(100);

    // Dialogs
    const [showImport, setShowImport] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showCredits, setShowCredits] = useState(false);

    // Tower detail navigation request from Recent Runs clicks
    const [towerDetailRequest, setTowerDetailRequest] = useState(null);

    // Initialize DB and load config
    useEffect(() => {
        (async () => {
            try {
                if (!dbReady) await initDatabase();
                const cfg = loadConfig();
                setLeftPanelWidth(cfg.left_panel_width || 630);
                setUiScale(cfg.ui_scale || 100);
                setDbReady(true);
            } catch (err) {
                console.error('Failed to initialize database:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, [refreshKey]);

    const refreshAll = useCallback(() => {
        setRefreshKey(k => k + 1);
    }, []);

    // Handle run click in Recent Runs panel
    const handleRunClick = useCallback((towerName, runType) => {
        const cfg = loadConfig();
        const mode = cfg.navigation_mode || 'default';
        setActiveTab(1); // Switch to Tower Analytics tab (was 2)
        setTowerDetailRequest({
            tower: towerName,
            filterType: mode === 'filter' ? runType : null,
            key: Date.now()
        });
    }, []);

    // Resizable split panel
    const handleResizeStart = useCallback((e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = leftPanelWidth;

        const onMouseMove = (e) => {
            const newWidth = startWidth + (e.clientX - startX);
            if (newWidth >= 300 && newWidth <= 800) {
                setLeftPanelWidth(newWidth);
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            // Save after drag ends (uses latest from closure via a callback)
            setLeftPanelWidth(w => {
                saveConfig({ left_panel_width: w });
                return w;
            });
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [leftPanelWidth]);

    const rowCount = dbReady ? getRowCount() : 0;
    const showWelcome = dbReady && rowCount === 0 && !showImport;

    const scaleFactor = uiScale / 100;
    const invScale = 100 / scaleFactor;

    const handleScaleChange = useCallback((newScale) => {
        setUiScale(newScale);
        saveConfig({ ui_scale: newScale });
    }, []);

    return (
        <div
            className="flex flex-col select-none overflow-hidden origin-top-left p-2.5 gap-2"
            style={{
                zoom: scaleFactor,
                width: `${invScale}vw`,
                height: `${invScale}vh`,
                transition: 'all 0.2s ease-out'
            }}
        >
            {/* Header */}
            <Header
                uiScale={uiScale}
                onScaleChange={handleScaleChange}
                onImport={() => setShowImport(true)}
                onCredits={() => setShowCredits(true)}
                onSettings={() => setShowSettings(true)}
            />

            {/* Loading Bar */}
            <LoadingBar show={loading} />

            {/* Main Content */}
            <div className="flex flex-1 min-h-0 gap-0">
                {/* Left Panel - Recent Runs */}
                <div
                    className="bg-gray-900 rounded-xl p-2.5 flex flex-col min-h-0 shrink-0"
                    style={{ width: leftPanelWidth }}
                >
                    {dbReady && (
                        <RecentRuns
                            refreshKey={refreshKey}
                            onRunClick={handleRunClick}
                            width={leftPanelWidth}
                        />
                    )}
                </div>

                {/* Resize Handle */}
                <div
                    className="w-2.5 flex items-center justify-center cursor-col-resize group shrink-0"
                    onMouseDown={handleResizeStart}
                >
                    <div className="w-0.5 h-full bg-gray-800 group-hover:bg-gray-600 transition-colors rounded" />
                </div>

                {/* Right Panel - Analytics Tabs */}
                <div className="flex-1 bg-gray-900 rounded-xl p-2.5 flex flex-col min-h-0">
                    {/* Tab Bar */}
                    <div className="flex border-b border-gray-800 mb-2 shrink-0">
                        {TABS.map((tab, i) => (
                            <button
                                key={tab.name}
                                className={`px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === i
                                    ? 'text-white'
                                    : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                onClick={() => setActiveTab(i)}
                            >
                                <span className="mr-1.5">{tab.icon}</span>
                                {tab.name}
                                {activeTab === i && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 min-h-0 overflow-hidden relative">
                        {dbReady && (
                            <>
                                <div className={`absolute inset-0 ${activeTab === 0 ? 'z-10' : 'z-0 invisible'}`}>
                                    <SessionAnalytics refreshKey={refreshKey} isActive={activeTab === 0} />
                                </div>
                                <div className={`absolute inset-0 ${activeTab === 1 ? 'z-10' : 'z-0 invisible'}`}>
                                    <TowerAnalytics refreshKey={refreshKey} detailRequest={towerDetailRequest} isActive={activeTab === 1} />
                                </div>
                                <div className={`absolute inset-0 ${activeTab === 2 ? 'z-10' : 'z-0 invisible'}`}>
                                    <HeightAnalytics refreshKey={refreshKey} isActive={activeTab === 2} />
                                </div>
                                <div className={`absolute inset-0 ${activeTab === 3 ? 'z-10' : 'z-0 invisible'}`}>
                                    <CalendarAnalytics refreshKey={refreshKey} isActive={activeTab === 3} />
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Welcome Banner */}
            {showWelcome && <WelcomeBanner onImport={() => setShowImport(true)} />}

            {/* Dialogs */}
            {showImport && (
                <ImportDialog onClose={() => { setShowImport(false); refreshAll(); }} />
            )}
            {showSettings && (
                <SettingsDialog
                    leftPanelWidth={leftPanelWidth}
                    onWidthChange={setLeftPanelWidth}
                    onClose={() => { setShowSettings(false); refreshAll(); }}
                />
            )}
            {showCredits && (
                <CreditsDialog onClose={() => setShowCredits(false)} />
            )}
        </div>
    );
}
