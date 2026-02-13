import { getDb } from './database.js';
import initSqlJs from 'sql.js'; // Not needed here, but keeping imports clean

// Helper to convert sql.js result to array of arrays (tuples)
function resultToArrays(result) {
    if (!result || result.length === 0) return [];
    return result[0].values;
}

// Helper to safely execute parameterized queries
function safeQuery(sql, params = []) {
    const db = getDb();
    if (!db) return [];
    try {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.get());
        }
        stmt.free();
        return rows;
    } catch (e) {
        console.error('Query Error:', e);
        return [];
    }
}

export function getRecentRuns(limit = 100) {
    const db = getDb();
    if (!db) return [];
    // No parameters needed here (limit is safe integer)
    return resultToArrays(db.exec(
        `SELECT * FROM attempts ORDER BY timestamp DESC, id DESC LIMIT ${limit}`
    ));
}

export function getTowerStats() {
    const db = getDb();
    if (!db) return [];
    return resultToArrays(db.exec(`
    SELECT tower, MIN(time_sec), AVG(time_sec), MIN(total_explosives), AVG(total_explosives), COUNT(*)
    FROM attempts
    WHERE is_success = 1 AND tower IS NOT NULL AND tower != 'Unknown'
    GROUP BY tower
    ORDER BY COUNT(*) DESC
  `));
}

export function getRunsByTower(towerName) {
    return safeQuery(
        "SELECT * FROM attempts WHERE tower = ? ORDER BY timestamp ASC",
        [towerName]
    );
}

export function getPbsMap() {
    const db = getDb();
    if (!db) return {};
    const result = db.exec(`
    SELECT tower, type, MIN(total_explosives)
    FROM attempts
    WHERE is_success = 1 AND tower != 'Unknown'
    GROUP BY tower, type
  `);
    const pbMap = {};
    if (result.length > 0) {
        for (const row of result[0].values) {
            pbMap[`${row[0]}_${row[1]}`] = row[2];
        }
    }
    return pbMap;
}

export function getSessionIndex() {
    const db = getDb();
    if (!db) return [];

    const filesResult = db.exec(`
    SELECT session_id, MIN(timestamp), MAX(timestamp), COUNT(*), SUM(is_success)
    FROM attempts
    WHERE session_id IS NOT NULL
    GROUP BY session_id
  `);

    const splitsResult = db.exec(`
    SELECT split_tag, MIN(timestamp), MAX(timestamp), COUNT(*), SUM(is_success)
    FROM attempts
    WHERE split_tag IS NOT NULL
    GROUP BY split_tag
    HAVING SUM(is_success) > 0
  `);

    const results = [];
    if (filesResult.length > 0) {
        for (const row of filesResult[0].values) {
            results.push({
                id: row[0], type: 'file', start_time: row[1],
                end_time: row[2], count: row[3], success_count: row[4] || 0
            });
        }
    }
    if (splitsResult.length > 0) {
        for (const row of splitsResult[0].values) {
            results.push({
                id: row[0], type: 'split', start_time: row[1],
                end_time: row[2], count: row[3], success_count: row[4] || 0
            });
        }
    }

    results.sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''));
    return results;
}

export function getRunsBySession(sessionId, sessionType) {
    if (sessionType === 'file') {
        return safeQuery(
            "SELECT * FROM attempts WHERE session_id = ? ORDER BY timestamp DESC",
            [sessionId]
        );
    } else {
        return safeQuery(
            "SELECT * FROM attempts WHERE split_tag = ? ORDER BY timestamp DESC",
            [sessionId]
        );
    }
}

export function getHeightStats() {
    const db = getDb();
    if (!db) return [];
    return resultToArrays(db.exec(`
    SELECT height, COUNT(*), MIN(time_sec), MIN(total_explosives)
    FROM attempts
    WHERE is_success = 1 AND height > 0
    GROUP BY height
    ORDER BY height ASC
  `));
}

export function getRunsByHeight(height) {
    return safeQuery(
        "SELECT * FROM attempts WHERE height = ? AND is_success = 1 ORDER BY timestamp ASC",
        [height]
    );
}
