const DEFAULT_CONFIG = {
    left_panel_width: 630,
    navigation_mode: 'default',
    show_splits_only: false,
    chart_mode: 'expl',
    hide_fails: false,
    show_trend: false,
    session_gap_threshold: 30,
    show_dist_chart: false,
    show_index_chart: false,
    index_chart_mode: 'session',
    index_chart_metric: 'expl',
    // Per-mode settings
    index_session_min_runs: 5,
    index_session_group: 1,
    index_run_group: 5,
    index_split_min_runs: 3,
    index_split_group: 1,
    // Anomaly filtering (Runs mode)
    index_run_filter_anomalies: true,
    index_run_max_expl: 10,
    index_run_max_time: 300,
    ui_scale: 100,
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
