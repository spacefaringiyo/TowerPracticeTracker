import { ungzip } from 'pako';
import { saveRun } from '../db/database.js';

const patterns = {
    log_time: /^\[(\d{2}:\d{2}:\d{2})\]/,
    bed: /(\d+\.\d+)s 1st Bed Placed/,
    dragon_kill: /Dragon Killed!/,
    pearl: /Pearled to .*? \((\d+\.\d+) Blocks\)/,
    time: /Time: (\d+\.\d+)s/,
    expl: /Explosives: (.+)/,
    tower: /Tower: (.+)/,
    type: /Type: (.+)/,
    height: /Standing Height: (\d+)/,
    advancement_reset: /Loaded \d+ advancements/,
    death: /was slain by|was killed by|fell from a high place|hit the ground too hard/,
    manual_reset: /Saving and pausing game/,
    gz_filename: /(\d{4}-\d{1,2}-\d{1,2})-\d+\.log\.gz/,
    split_start: /\[CHAT\].*?split start\s*(.*)/i,
    split_end: /\[CHAT\].*?split end/i,
};

class RunParser {
    constructor(callbackFunc, isLive = false, sessionId = 'unknown') {
        this.callback = callbackFunc;
        this.isLive = isLive;
        this.sessionId = sessionId;
        this.buffer = {};
        this.currentTrackDate = new Date();
        this.lastParsedSeconds = null;
        this.attemptStartTime = null;
        this.isAttempting = false;
        this.bedTime = null;
        this.currentSplitTag = null;
        this.dragonKilled = false;
    }

    setDateContext(dateObj) {
        this.currentTrackDate = new Date(dateObj);
        this.lastParsedSeconds = null;
    }

    processLine(line) {
        const tMatch = patterns.log_time.exec(line);
        let timestampStr = '';
        let currentDt = null;

        if (tMatch) {
            const timeStr = tMatch[1];
            const parts = timeStr.split(':');
            const hours = parseInt(parts[0]);
            const minutes = parseInt(parts[1]);
            const seconds = parseInt(parts[2]);
            const totalSeconds = hours * 3600 + minutes * 60 + seconds;

            if (this.lastParsedSeconds !== null && totalSeconds < this.lastParsedSeconds) {
                // Day rollover
                this.currentTrackDate.setDate(this.currentTrackDate.getDate() + 1);
            }
            this.lastParsedSeconds = totalSeconds;

            currentDt = new Date(this.currentTrackDate);
            currentDt.setHours(hours, minutes, seconds, 0);

            const y = currentDt.getFullYear();
            const m = String(currentDt.getMonth() + 1).padStart(2, '0');
            const d = String(currentDt.getDate()).padStart(2, '0');
            timestampStr = `${y}-${m}-${d} ${timeStr}`;
            this.buffer.timestamp = timestampStr;
        }

        if (!currentDt) {
            // console.log('Skipping line without timestamp:', line.substring(0, 30));
            return;
        }

        // Split tracking
        const sMatch = patterns.split_start.exec(line);
        if (sMatch) {
            const customName = sMatch[1].trim();
            this.currentSplitTag = customName || `Session ${timestampStr}`;
            return;
        } else if (patterns.split_end.test(line)) {
            this.currentSplitTag = null;
            return;
        }

        // Pearl detection (attempt start)
        const pearlMatch = patterns.pearl.exec(line);
        if (pearlMatch) {
            const distance = parseFloat(pearlMatch[1]);
            if (!isNaN(distance) && !this.isAttempting && distance > 6.0) {
                // console.log('[Parser] Attempt Start (Pearl):', distance);
                this.isAttempting = true;
                this.attemptStartTime = currentDt;
                this.bedTime = null;
                this.buffer = { timestamp: timestampStr };
            }
        }

        // Bed placement
        if (line.includes('1st Bed Placed')) {
            const m = patterns.bed.exec(line);
            if (m) {
                this.bedTime = parseFloat(m[1]);
                // console.log('[Parser] Bed Placed:', this.bedTime);
            }
        }

        // Run data
        if (line.includes('Time:')) {
            const m = patterns.time.exec(line);
            if (m) {
                this.buffer.time = parseFloat(m[1]);
                // console.log('[Parser] Time found:', this.buffer.time);
            }
        }
        if (line.includes('Explosives:')) {
            const m = patterns.expl.exec(line);
            if (m) this.buffer.expl = m[1].trim();
        }
        if (line.includes('Tower:')) {
            const m = patterns.tower.exec(line);
            if (m) this.buffer.tower = m[1].trim();
        }
        if (line.includes('Type:')) {
            const m = patterns.type.exec(line);
            if (m) this.buffer.type = m[1].trim();
        }
        if (line.includes('Standing Height:')) {
            const m = patterns.height.exec(line);
            if (m) {
                this.buffer.height = parseInt(m[1]);
                // console.log('[Parser] Run Finished (Success)! Height:', this.buffer.height);
                this.finishSuccess();
            }
        }

        // Dragon kill
        if (line.includes('Dragon Killed!')) {
            this.dragonKilled = true;
            this.buffer.dragon_killed = true;
            // console.log('[Parser] Dragon Killed');
        }

        // Fail detection
        if (this.isAttempting && !line.includes('Dragon Killed!') && !line.includes('Time:')) {
            let failReason = null;
            if (patterns.death.test(line)) failReason = 'Death';
            else if (patterns.manual_reset.test(line)) failReason = 'Reset';
            else if (patterns.advancement_reset.test(line)) failReason = 'World Load';

            if (failReason) {
                const duration = this.attemptStartTime
                    ? (currentDt.getTime() - this.attemptStartTime.getTime()) / 1000
                    : 0;
                this.finishFail(duration, failReason, timestampStr);
            }
        }
    }

    finishSuccess() {
        this.buffer.is_success = true;
        this.buffer.session_id = this.sessionId;
        this.buffer.split_tag = this.currentSplitTag;
        this.buffer.bed_time = this.bedTime;
        const saved = saveRun(this.buffer);
        if (this.callback) this.callback(saved ? 'new' : 'duplicate');
        this.resetState();
    }

    finishFail(duration, reason, timestamp) {
        if (duration < 2.0) return;
        const failData = {
            timestamp,
            time: Math.round(duration * 100) / 100,
            expl: '?',
            tower: 'Unknown',
            type: 'Unknown',
            height: 0,
            bed_time: this.bedTime,
            is_success: false,
            fail_reason: reason,
            session_id: this.sessionId,
            split_tag: this.currentSplitTag,
        };
        const saved = saveRun(failData);
        if (this.callback) this.callback(saved ? 'new_fail' : 'duplicate_fail');
        this.resetState();
    }

    resetState() {
        this.isAttempting = false;
        this.attemptStartTime = null;
        this.bedTime = null;
        this.dragonKilled = false;
        this.buffer = {};
    }
}

export function processFileContent(filename, contentBytes, callbackFunc = null) {
    const parser = new RunParser(callbackFunc, false, filename);

    // Determine date context from filename
    const m = patterns.gz_filename.exec(filename);
    if (m) {
        try {
            // Parse date parts manually to avoid timezone issues
            const dateParts = m[1].split('-');
            const fileDate = new Date(
                parseInt(dateParts[0]),
                parseInt(dateParts[1]) - 1,
                parseInt(dateParts[2])
            );
            if (!isNaN(fileDate.getTime())) {
                parser.setDateContext(fileDate);
            } else {
                parser.setDateContext(new Date());
            }
        } catch {
            parser.setDateContext(new Date());
        }
    } else {
        parser.setDateContext(new Date());
    }

    // Decompress if .gz (must use ungzip, not inflate, for gzip format)
    let text;
    try {
        if (filename.endsWith('.gz')) {
            const decompressed = ungzip(new Uint8Array(contentBytes));
            text = new TextDecoder('utf-8').decode(decompressed);
        } else {
            text = new TextDecoder('utf-8').decode(contentBytes);
        }
    } catch (e) {
        console.error(`Error decompressing/reading ${filename}:`, e);
        return;
    }

    const lines = text.split('\n');
    console.log(`[Parser] ${filename}: ${lines.length} lines`);
    for (const line of lines) {
        parser.processLine(line);
    }
}
