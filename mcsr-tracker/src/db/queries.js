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
    return resultToArrays(db.exec(
        `SELECT * FROM attempts ORDER BY timestamp DESC, id DESC LIMIT ${limit}`
    ));
}

export function getHistoryRuns() {
    const db = getDb();
    if (!db) return [];
    return resultToArrays(db.exec(
        `SELECT * FROM attempts ORDER BY timestamp DESC, id DESC`
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

export function getCalendarStats(year, month, gapLimitMins = 30) {
    const db = getDb();
    if (!db) return [];

    // month is 0-indexed in JS (0-11), strftime('%m') is '01'-'12'
    const monthStr = String(month + 1).padStart(2, '0');
    const yearStr = String(year);

    const result = safeQuery(`
        SELECT timestamp, time_sec, total_explosives, is_success
        FROM attempts
        WHERE timestamp LIKE ?
    `, [`${yearStr}-${monthStr}%`]);

    const days = {};
    result.forEach(row => {
        const date = row[0].split(' ')[0]; // YYYY-MM-DD
        if (!days[date]) {
            days[date] = { date, runs: [], successRuns: [] };
        }
        days[date].runs.push({ timestamp: row[0], time_sec: row[1] });
        if (row[3] === 1) {
            days[date].successRuns.push(row[2]);
        }
    });

    return Object.values(days).map(day => {
        const { durationSec, playTimeSec } = calculateSessionDuration(day.runs, gapLimitMins);
        const avgExpl = day.successRuns.length > 0
            ? day.successRuns.reduce((a, b) => a + b, 0) / day.successRuns.length
            : null;

        return {
            date: day.date,
            count: day.runs.length,
            avg_expl: avgExpl,
            duration_sec: durationSec,
            play_time_sec: playTimeSec
        };
    });
}

export function getDailyRuns(date) {
    return safeQuery(
        "SELECT * FROM attempts WHERE timestamp LIKE ? ORDER BY timestamp ASC",
        [`${date}%`]
    );
}

export function getMaxDailyRuns() {
    const db = getDb();
    if (!db) return 0;
    // We look at the top run count among the last 30 active days
    const result = db.exec(`
        SELECT MAX(c) FROM (
            SELECT COUNT(*) as c 
            FROM attempts 
            GROUP BY SUBSTR(timestamp, 1, 10) 
            ORDER BY MIN(timestamp) DESC 
            LIMIT 30
        )
    `);
    if (result.length === 0 || result[0].values.length === 0) return 0;
    return result[0].values[0][0] || 0;
}

export function getNeighboringActiveDate(currentDate, direction) {
    const operator = direction > 0 ? '>' : '<';
    const order = direction > 0 ? 'ASC' : 'DESC';

    const result = safeQuery(`
        SELECT SUBSTR(timestamp, 1, 10) as d
        FROM attempts
        WHERE SUBSTR(timestamp, 1, 10) ${operator} ?
        GROUP BY d
        ORDER BY d ${order}
        LIMIT 1
    `, [currentDate]);

    if (result.length === 0) return null;
    return result[0][0];
}
