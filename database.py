import sqlite3
import json

# Single persistent in-memory connection (no threading in browser)
_conn = None

def _get_conn():
    """Get or create the in-memory SQLite connection."""
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(":memory:", check_same_thread=False)
        _init_schema(_conn)
    return _conn

def _init_schema(conn):
    """Create the attempts table if it doesn't exist."""
    with conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS attempts (
            id INTEGER PRIMARY KEY,
            timestamp TEXT,
            time_sec REAL,
            explosives TEXT,
            total_explosives INTEGER,
            tower TEXT,
            type TEXT,
            height INTEGER,
            bed_time REAL,
            is_success INTEGER, 
            fail_reason TEXT,
            session_id TEXT,
            split_tag TEXT,
            fingerprint TEXT UNIQUE
        )''')

def init_db():
    """Initialize the database (creates table in memory)."""
    _get_conn()

# ===========================
# PERSISTENCE (Browser Storage)
# ===========================

def save_to_storage(page):
    """Serialize all rows to JSON and save to browser storage."""
    try:
        conn = _get_conn()
        rows = conn.execute("SELECT * FROM attempts").fetchall()
        data = json.dumps(rows)
        page.client_storage.set("mcsr_db", data)
    except Exception as e:
        print(f"Save to storage error: {e}")

def load_from_storage(page):
    """Load data from browser storage into in-memory SQLite."""
    try:
        raw = page.client_storage.get("mcsr_db")
        if raw:
            rows = json.loads(raw)
            conn = _get_conn()
            with conn:
                for row in rows:
                    try:
                        conn.execute(
                            "INSERT OR IGNORE INTO attempts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                            tuple(row)
                        )
                    except Exception:
                        pass
            print(f"Loaded {len(rows)} rows from browser storage.")
    except Exception as e:
        print(f"Load from storage error: {e}")

def get_row_count():
    """Get the total number of rows in the database."""
    conn = _get_conn()
    result = conn.execute("SELECT COUNT(*) FROM attempts").fetchone()
    return result[0] if result else 0

# ===========================
# EXPORT / IMPORT (User-facing backup)
# ===========================

def export_json():
    """Return all data as a JSON string for user download."""
    conn = _get_conn()
    # Explicitly select columns to ensure stable order
    cols = ["id", "timestamp", "time_sec", "explosives", "total_explosives", "tower", "type", "height", "bed_time", "is_success", "fail_reason", "session_id", "split_tag", "fingerprint"]
    query = f"SELECT {', '.join(cols)} FROM attempts ORDER BY timestamp ASC, id ASC"
    rows = conn.execute(query).fetchall()
    return json.dumps([dict(zip(cols, row)) for row in rows], indent=2)

def import_json(data_str):
    """Import data from a JSON backup string. Maps compatible keys."""
    try:
        records = json.loads(data_str)
        conn = _get_conn()
        count = 0
        with conn:
            for rec in records:
                # Map column names to save_run expected keys
                mapped_data = {
                    'timestamp': rec.get('timestamp'),
                    'time': rec.get('time_sec') if 'time_sec' in rec else rec.get('time', 0),
                    'expl': rec.get('explosives') if 'explosives' in rec else rec.get('expl', '?'),
                    'tower': rec.get('tower', 'Unknown'),
                    'type': rec.get('type') if 'type' in rec else rec.get('run_type', 'Unknown'),
                    'height': rec.get('height', 0),
                    'bed_time': rec.get('bed_time'),
                    'is_success': bool(rec.get('is_success', False)),
                    'fail_reason': rec.get('fail_reason'),
                    'session_id': rec.get('session_id'),
                    'split_tag': rec.get('split_tag')
                }
                if _save_run_internal(conn, mapped_data):
                    count += 1
        return count
    except Exception as e:
        print(f"Import JSON error: {e}")
        return 0

# ===========================
# CORE DATA OPERATIONS
# ===========================

def save_run(data):
    """Saves a run with transaction handling."""
    conn = _get_conn()
    with conn:
        return _save_run_internal(conn, data)

def _save_run_internal(conn, data):
    """Internal save helper that assumes an active transaction."""
    # 1. Calculate Total Explosives
    expl_str = data.get('expl', '?')
    total_expl = 0
    if expl_str and expl_str != "?":
        try:
            if '+' in expl_str:
                parts = expl_str.split('+')
                total_expl = int(parts[0]) + int(parts[1])
            else:
                total_expl = int(expl_str)
        except:
            total_expl = 0
            
    # 2. Construct Fingerprint
    fingerprint = f"{data.get('session_id', 'live')}_{data['timestamp']}_{data.get('time', 0)}"

    try:
        # Prevent duplicates
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM attempts WHERE fingerprint = ?", (fingerprint,))
        if cursor.fetchone():
            return False 

        cursor.execute('''
            INSERT INTO attempts (
                timestamp, time_sec, explosives, total_explosives,
                tower, type, height, bed_time, 
                is_success, fail_reason, session_id, split_tag, fingerprint
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data['timestamp'], 
            data.get('time', 0), 
            expl_str,
            total_expl,
            data.get('tower', 'Unknown'), 
            data.get('type', 'Unknown'), 
            data.get('height', 0), 
            data.get('bed_time'),
            1 if data.get('is_success', False) else 0,
            data.get('fail_reason', data.get('raw_fail_reason', None)),
            data.get('session_id'),
            data.get('split_tag'),
            fingerprint
        ))
        
        return True
    except sqlite3.IntegrityError:
        return False
    except Exception as e:
        print(f"DB Error: {e}")
        return False

# ===========================
# QUERY FUNCTIONS (unchanged API)
# ===========================

def get_recent_runs(limit=100):
    conn = _get_conn()
    # Order by timestamp first for chronological accuracy
    runs = conn.execute(f"SELECT * FROM attempts ORDER BY timestamp DESC, id DESC LIMIT {limit}").fetchall()
    return runs

def get_tower_stats():
    conn = _get_conn()
    rows = conn.execute('''
        SELECT tower, MIN(time_sec), COUNT(*) 
        FROM attempts 
        WHERE is_success = 1 AND tower IS NOT NULL AND tower != 'Unknown'
        GROUP BY tower 
        ORDER BY COUNT(*) DESC
    ''').fetchall()
    return rows

def get_runs_by_tower(tower_name):
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM attempts WHERE tower = ? ORDER BY timestamp ASC", (tower_name,)).fetchall()
    return rows

def get_pbs_map():
    conn = _get_conn()
    rows = conn.execute('''
        SELECT tower, type, MIN(total_explosives)
        FROM attempts
        WHERE is_success = 1 AND tower != 'Unknown'
        GROUP BY tower, type
    ''').fetchall()
    
    pb_map = {}
    for r in rows:
        pb_map[(r[0], r[1])] = r[2]
    return pb_map

# --- SESSION FUNCTIONS ---

def get_session_index():
    conn = _get_conn()
    
    # 1. Log Files (No filter - we want to see all logs)
    files = conn.execute('''
        SELECT session_id, MIN(timestamp), MAX(timestamp), COUNT(*), SUM(is_success)
        FROM attempts 
        WHERE session_id IS NOT NULL 
        GROUP BY session_id
    ''').fetchall()
    
    # 2. Splits (Must have at least 1 success to be valid)
    splits = conn.execute('''
        SELECT split_tag, MIN(timestamp), MAX(timestamp), COUNT(*), SUM(is_success)
        FROM attempts 
        WHERE split_tag IS NOT NULL 
        GROUP BY split_tag
        HAVING SUM(is_success) > 0
    ''').fetchall()
    
    results = []
    for row in files:
        results.append({
            'id': row[0], 'type': 'file', 'start_time': row[1], 
            'end_time': row[2], 'count': row[3], 'success_count': row[4] or 0
        })
    for row in splits:
        results.append({
            'id': row[0], 'type': 'split', 'start_time': row[1], 
            'end_time': row[2], 'count': row[3], 'success_count': row[4] or 0
        })
        
    results.sort(key=lambda x: x['start_time'], reverse=True)
    return results

def get_runs_by_session(session_id, session_type):
    """
    Fetches all runs for a specific session ID or Split Tag.
    """
    conn = _get_conn()
    
    if session_type == 'file':
        runs = conn.execute("SELECT * FROM attempts WHERE session_id = ? ORDER BY timestamp DESC", (session_id,)).fetchall()
    else:
        runs = conn.execute("SELECT * FROM attempts WHERE split_tag = ? ORDER BY timestamp DESC", (session_id,)).fetchall()
        
    return runs

def get_height_stats():
    conn = _get_conn()
    # Only consider positive heights and successful runs for stats
    rows = conn.execute('''
        SELECT height, COUNT(*), MIN(time_sec), MIN(total_explosives)
        FROM attempts 
        WHERE is_success = 1 AND height > 0
        GROUP BY height 
        ORDER BY height ASC
    ''').fetchall()
    return rows

def get_runs_by_height(height):
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM attempts WHERE height = ? AND is_success = 1 ORDER BY timestamp ASC", (height,)).fetchall()
    return rows

def clear_db():
    conn = _get_conn()
    with conn:
        conn.execute("DELETE FROM attempts")