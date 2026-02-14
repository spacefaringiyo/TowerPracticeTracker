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

/**
 * Calculates estimated session duration and total active play time.
 * Legacy Parity Logic for duration: Group into chunks where gap < threshold.
 */
export function calculateSessionDuration(runs, gapLimitMins = 30) {
    if (!runs || runs.length === 0) return { durationSec: 0, playTimeSec: 0 };

    // Sort by timestamp asc
    const sorted = [...runs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    let totalDurationSec = 0;
    let totalPlayTimeSec = 0;
    const GAP_LIMIT_SEC = gapLimitMins * 60;

    let chunkStart = new Date(sorted[0].timestamp.replace(' ', 'T')).getTime() / 1000;
    let chunkEnd = chunkStart + (sorted[0].time_sec || 0);

    for (let i = 0; i < sorted.length; i++) {
        const run = sorted[i];
        const duration = run.time_sec || 0;
        totalPlayTimeSec += duration;

        if (i === 0) continue;

        const runStart = new Date(run.timestamp.replace(' ', 'T')).getTime() / 1000;
        const runEnd = runStart + duration;

        const gap = runStart - chunkEnd;

        if (gap > GAP_LIMIT_SEC) {
            // End current chunk, start new one
            totalDurationSec += (chunkEnd - chunkStart);
            chunkStart = runStart;
            chunkEnd = runEnd;
        } else {
            // Extend current chunk if run ends later
            if (runEnd > chunkEnd) {
                chunkEnd = runEnd;
            }
        }
    }

    // Add final chunk
    totalDurationSec += (chunkEnd - chunkStart);

    return {
        durationSec: Math.floor(totalDurationSec),
        playTimeSec: Math.floor(totalPlayTimeSec)
    };
}

export function getSessionIndex(gapLimitMins = 30) {
    const db = getDb();
    if (!db) return [];

    const statsSql = (groupByCol) => `
    SELECT ${groupByCol}, MIN(timestamp), MAX(timestamp), COUNT(*), SUM(is_success),
           MIN(CASE WHEN is_success = 1 THEN time_sec END),
           AVG(CASE WHEN is_success = 1 THEN time_sec END),
           MIN(CASE WHEN is_success = 1 THEN total_explosives END),
           AVG(CASE WHEN is_success = 1 THEN total_explosives END)
    FROM attempts
    WHERE ${groupByCol} IS NOT NULL
    GROUP BY ${groupByCol}
  `;

    const filesResult = db.exec(statsSql('session_id'));
    const splitsResult = db.exec(statsSql('split_tag') + ' HAVING SUM(is_success) > 0');

    const mapRows = (result, type) => {
        if (result.length === 0) return [];
        return result[0].values.map(row => {
            const id = row[0];
            // Fetch all runs for this session to calculate duration
            const runs = getRunsBySession(id, type);
            // Convert tuple to object for helper
            const runObjs = runs.map(r => ({
                timestamp: r[1],
                time_sec: r[2]
            }));

            const { durationSec, playTimeSec } = calculateSessionDuration(runObjs, gapLimitMins);

            return {
                id,
                type,
                start_time: row[1],
                end_time: row[2],
                count: row[3],
                success_count: row[4] || 0,
                best_time: row[5],
                avg_time: row[6],
                best_expl: row[7],
                avg_expl: row[8],
                duration_sec: durationSec,
                play_time_sec: playTimeSec
            };
        });
    };

    const results = [
        ...mapRows(filesResult, 'file'),
        ...mapRows(splitsResult, 'split')
    ];

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
    SELECT height, COUNT(*), MIN(time_sec), AVG(time_sec), MIN(total_explosives), AVG(total_explosives)
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
