const DEFAULT_CONFIG = {
    left_panel_width: 630,
    navigation_mode: 'default',
    show_splits_only: false,
    chart_mode: 'expl',
    hide_fails: false,
    show_trend: false,
};

const CONFIG_KEY = 'mcsr_config';

export function loadConfig() {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (raw) {
            return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
        }
    } catch { /* ignore */ }
    return { ...DEFAULT_CONFIG };
}

export function saveConfig(newConfig) {
    const current = loadConfig();
    const merged = { ...current, ...newConfig };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
    return merged;
}
