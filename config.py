import json

# In-memory DB path (no filesystem in browser)
DB_PATH = ":memory:"

# Common log folder paths to display as hints in the UI
# These help users navigate to their logs folder in the file picker
COMMON_LOG_PATHS = [
    r"%APPDATA%\PrismLauncher\instances\MCSRRanked-1.16.1\logs",
    r"%APPDATA%\PrismLauncher\instances\Ranked\logs",
    r"%APPDATA%\MultiMC\instances\MCSRRanked-1.16.1\logs",
    r"%USERPROFILE%\Downloads\mmc-develop-win32\MultiMC\instances\MCSRRanked-Windows-1.16.1-All.minecraft\logs",
]

DEFAULT_CONFIG = {
    "left_panel_width": 630,
    "navigation_mode": "default",
    "show_splits_only": False,
    "chart_mode": "expl",
    "hide_fails": False,
    "show_trend": False,
}

def load_config(page):
    """Load config from browser's localStorage via page.client_storage."""
    try:
        raw = page.client_storage.get("mcsr_config")
        if raw:
            return {**DEFAULT_CONFIG, **json.loads(raw)}
    except:
        pass
    return dict(DEFAULT_CONFIG)

def save_config(page, new_config):
    """Save config to browser's localStorage via page.client_storage."""
    current = load_config(page)
    current.update(new_config)
    page.client_storage.set("mcsr_config", json.dumps(current))