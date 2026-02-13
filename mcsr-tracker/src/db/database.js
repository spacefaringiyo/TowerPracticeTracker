import initSqlJs from 'sql.js';
import { get, set } from 'idb-keyval';

const DB_STORAGE_KEY = 'mcsr_tracker_db';
let db = null;

export async function initDatabase() {
    // Manually fetch the WASM file to handle 404s/HTML errors explicitly
    // Use relative path to support subdirectory deployment (e.g. GitHub Pages)
    const wasmUrl = './sql-wasm.wasm';
    const response = await fetch(wasmUrl);

    if (!response.ok) {
        throw new Error(`Failed to load WASM: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('Content-Type');
    if (contentType && contentType.includes('text/html')) {
        // If server returns HTML (SPA fallback), the file is missing
        throw new Error(`Failed to load WASM: Server returned HTML (404) instead of binary. Check if ${wasmUrl} exists in public folder.`);
    }

    const wasmBinary = await response.arrayBuffer();

    const SQL = await initSqlJs({
        wasmBinary
    });

    // Try to load from IndexedDB
    const savedData = await get(DB_STORAGE_KEY);
    if (savedData) {
        db = new SQL.Database(new Uint8Array(savedData));
    } else {
        db = new SQL.Database();
    }

    // Create schema (idempotent)
    db.run(`CREATE TABLE IF NOT EXISTS attempts (
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
  )`);

    return db;
}

export function getDb() {
    return db;
}

export async function saveToStorage() {
    if (!db) return;
    const data = db.export();
    await set(DB_STORAGE_KEY, new Uint8Array(data));
}

export function saveRun(data) {
    if (!db) {
        console.error('saveRun: DB is null');
        return false;
    }

    // Calculate total explosives
    const explStr = data.expl || '?';
    let totalExpl = 0;
    if (explStr && explStr !== '?') {
        try {
            if (explStr.includes('+')) {
                const parts = explStr.split('+');
                totalExpl = parseInt(parts[0]) + parseInt(parts[1]);
            } else {
                totalExpl = parseInt(explStr);
            }
        } catch {
            totalExpl = 0;
        }
        if (isNaN(totalExpl)) totalExpl = 0;
    }

    // Construct fingerprint
    const fingerprint = `${data.session_id || 'live'}_${data.timestamp}_${data.time || 0}`;

    try {
        // Check for duplicate
        const existing = db.exec("SELECT 1 FROM attempts WHERE fingerprint = ?", [fingerprint]);
        if (existing.length > 0 && existing[0].values.length > 0) {
            console.log('saveRun: Duplicate found for fingerprint', fingerprint);
            return false;
        }

        const sql = `INSERT INTO attempts (
      timestamp, time_sec, explosives, total_explosives,
      tower, type, height, bed_time,
      is_success, fail_reason, session_id, split_tag, fingerprint
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const values = [
            data.timestamp,
            data.time || 0,
            explStr,
            totalExpl,
            data.tower || 'Unknown',
            data.type || 'Unknown',
            data.height || 0,
            data.bed_time ?? null,
            data.is_success ? 1 : 0,
            data.fail_reason || null,
            data.session_id || null,
            data.split_tag || null,
            fingerprint
        ];

        console.log('saveRun: Preparing statement with values:', values);
        const stmt = db.prepare(sql);
        stmt.run(values);
        stmt.free();

        console.log('saveRun: Successfully saved run', fingerprint);
        return true;

        console.log('saveRun: Successfully saved run', fingerprint);
        return true;
    } catch (e) {
        if (e.message && e.message.includes('UNIQUE constraint')) {
            console.log('saveRun: Duplicate (UNIQUE) for', fingerprint);
            return false;
        }
        console.error('DB Error in saveRun:', e);
        return false;
    }
}

export function exportJson() {
    if (!db) return '[]';
    const cols = ['id', 'timestamp', 'time_sec', 'explosives', 'total_explosives',
        'tower', 'type', 'height', 'bed_time', 'is_success', 'fail_reason',
        'session_id', 'split_tag', 'fingerprint'];
    const result = db.exec(`SELECT ${cols.join(', ')} FROM attempts ORDER BY timestamp ASC, id ASC`);
    if (result.length === 0) return '[]';

    const rows = result[0].values.map(row => {
        const obj = {};
        cols.forEach((col, i) => { obj[col] = row[i]; });
        return obj;
    });
    return JSON.stringify(rows, null, 2);
}

export function importJson(dataStr) {
    if (!db) return 0;
    try {
        const records = JSON.parse(dataStr);
        let count = 0;
        for (const rec of records) {
            const mappedData = {
                timestamp: rec.timestamp,
                time: rec.time_sec !== undefined ? rec.time_sec : (rec.time || 0),
                expl: rec.explosives !== undefined ? rec.explosives : (rec.expl || '?'),
                tower: rec.tower || 'Unknown',
                type: rec.type !== undefined ? rec.type : (rec.run_type || 'Unknown'),
                height: rec.height || 0,
                bed_time: rec.bed_time,
                is_success: Boolean(rec.is_success),
                fail_reason: rec.fail_reason,
                session_id: rec.session_id,
                split_tag: rec.split_tag
            };
            if (saveRun(mappedData)) count++;
        }
        return count;
    } catch (e) {
        console.error('Import JSON error:', e);
        return 0;
    }
}

export function getRowCount() {
    if (!db) return 0;
    const result = db.exec("SELECT COUNT(*) FROM attempts");
    return result.length > 0 ? result[0].values[0][0] : 0;
}

export function clearDb() {
    if (!db) return;
    db.run("DELETE FROM attempts");
}
