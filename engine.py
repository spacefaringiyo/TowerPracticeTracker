import re
import gzip
from datetime import datetime, date, timedelta
import database

# REGEX PATTERNS
patterns = {
    "log_time": re.compile(r"^\[(\d{2}:\d{2}:\d{2})\]"), 
    "bed": re.compile(r"(\d+\.\d+)s 1st Bed Placed"),
    "dragon_kill": re.compile(r"Dragon Killed!"),
    "pearl": re.compile(r"Pearled to .*? \((\d+\.\d+) Blocks\)"),
    "time": re.compile(r"Time: (\d+\.\d+)s"),
    "expl": re.compile(r"Explosives: (.+)"),
    "tower": re.compile(r"Tower: (.+)"),
    "type": re.compile(r"Type: (.+)"),
    "height": re.compile(r"Standing Height: (\d+)"),
    "advancement_reset": re.compile(r"Loaded \d+ advancements"),
    "death": re.compile(r"was slain by|was killed by|fell from a high place|hit the ground too hard"),
    "manual_reset": re.compile(r"Saving and pausing game"),
    "gz_filename": re.compile(r"(\d{4}-\d{1,2}-\d{1,2})-\d+\.log\.gz"),
    "split_start": re.compile(r"\[CHAT\].*?split start\s*(.*)", re.IGNORECASE),
    "split_end": re.compile(r"\[CHAT\].*?split end", re.IGNORECASE)
}

class RunParser:
    def __init__(self, callback_func, is_live=False, session_id="unknown"):
        self.callback = callback_func
        self.is_live = is_live
        self.session_id = session_id
        self.buffer = {}
        self.current_track_date = date.today()
        self.last_parsed_time = None
        self.attempt_start_time = None
        self.is_attempting = False
        self.bed_time = None
        self.current_split_tag = None
        self.dragon_killed = False

    def set_date_context(self, date_obj):
        self.current_track_date = date_obj
        self.last_parsed_time = None

    def process_line(self, line):
        t_match = patterns['log_time'].search(line)
        timestamp_str = ""
        current_dt = None
        
        if t_match:
            time_str = t_match.group(1)
            try:
                t_obj = datetime.strptime(time_str, "%H:%M:%S").time()
                if self.last_parsed_time is not None:
                    if t_obj < self.last_parsed_time:
                         self.current_track_date += timedelta(days=1)
                self.last_parsed_time = t_obj
                current_dt = datetime.combine(self.current_track_date, t_obj)
                timestamp_str = current_dt.strftime("%Y-%m-%d %H:%M:%S")
                self.buffer['timestamp'] = timestamp_str
            except ValueError:
                pass
        
        if not current_dt: return 

        s_match = patterns['split_start'].search(line)
        if s_match:
            custom_name = s_match.group(1).strip()
            self.current_split_tag = custom_name if custom_name else f"Session {timestamp_str}"
            return
        elif patterns['split_end'].search(line):
            self.current_split_tag = None
            return

        pearl_match = patterns['pearl'].search(line)
        if pearl_match:
            try:
                distance = float(pearl_match.group(1))
                if not self.is_attempting and distance > 10.0:
                    self.is_attempting = True
                    self.attempt_start_time = current_dt
                    self.bed_time = None
                    self.buffer = {'timestamp': timestamp_str}
            except (ValueError, IndexError):
                pass

        if "1st Bed Placed" in line:
            m = patterns['bed'].search(line)
            if m: self.bed_time = float(m.group(1))

        if "Time:" in line:
            m = patterns['time'].search(line)
            if m: self.buffer['time'] = float(m.group(1))
        
        if "Explosives:" in line:
            m = patterns['expl'].search(line)
            if m: self.buffer['expl'] = m.group(1).strip()
            
        if "Tower:" in line:
            m = patterns['tower'].search(line)
            if m: self.buffer['tower'] = m.group(1).strip()
            
        if "Type:" in line:
            m = patterns['type'].search(line)
            if m: self.buffer['type'] = m.group(1).strip()

        if "Standing Height:" in line:
            m = patterns['height'].search(line)
            if m: 
                self.buffer['height'] = int(m.group(1))
                self.finish_success()

        if "Dragon Killed!" in line:
            self.dragon_killed = True
            self.buffer['dragon_killed'] = True

        if self.is_attempting and "Dragon Killed!" not in line and "Time:" not in line:
            fail_reason = None
            if patterns['death'].search(line): fail_reason = "Death"
            elif patterns['manual_reset'].search(line): fail_reason = "Reset"
            elif patterns['advancement_reset'].search(line): fail_reason = "World Load"

            if fail_reason:
                duration = (current_dt - self.attempt_start_time).total_seconds() if self.attempt_start_time else 0.0
                self.finish_fail(duration, fail_reason, timestamp_str)

    def finish_success(self):
        self.buffer['is_success'] = True
        self.buffer['session_id'] = self.session_id
        self.buffer['split_tag'] = self.current_split_tag
        self.buffer['bed_time'] = self.bed_time
        database.save_run(self.buffer)
        if self.callback: self.callback()
        self.reset_state()

    def finish_fail(self, duration, reason, timestamp):
        if duration < 2.0: return
        fail_data = {
            'timestamp': timestamp, 'time': round(duration, 2), 'expl': '?',
            'tower': 'Unknown', 'type': 'Unknown', 'height': 0, 'bed_time': self.bed_time,
            'is_success': False, 'fail_reason': reason,
            'session_id': self.session_id, 'split_tag': self.current_split_tag
        }
        database.save_run(fail_data)
        if self.callback: self.callback()
        self.reset_state()

    def reset_state(self):
        self.is_attempting = False
        self.attempt_start_time = None
        self.bed_time = None
        self.dragon_killed = False
        self.buffer = {}

# ===========================
# FILE IMPORT (replaces LogWatcher + import_history_archives)
# ===========================

def process_file_content(filename, content_bytes, callback_func=None):
    """
    Process a single uploaded file's content (bytes).
    filename: original filename (e.g., '2025-01-15-1.log.gz' or 'latest.log')
    content_bytes: raw bytes of the file
    Returns the number of runs saved.
    """
    parser = RunParser(callback_func, is_live=False, session_id=filename)
    
    # Determine date context from filename
    m = patterns['gz_filename'].match(filename)
    if m:
        try:
            file_date = datetime.strptime(m.group(1), "%Y-%m-%d").date()
            parser.set_date_context(file_date)
        except ValueError:
            parser.set_date_context(date.today())
    else:
        parser.set_date_context(date.today())
    
    # Decompress if .gz, otherwise decode directly
    try:
        if filename.endswith('.gz'):
            text = gzip.decompress(content_bytes).decode('utf-8', errors='ignore')
        else:
            text = content_bytes.decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"Error reading {filename}: {e}")
        return
    
    for line in text.splitlines():
        parser.process_line(line)