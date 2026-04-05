-- ==============================================================================
-- 📊 GLASSBOX TELEMETRY DATABASE (Warm Storage Rollups)
-- ==============================================================================

-- Drop the old table if it exists so we can rebuild it without the student_hash
DROP TABLE IF EXISTS daily_rollups;

CREATE TABLE IF NOT EXISTS daily_rollups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL,        -- Format: YYYY-MM-DD
    target TEXT NOT NULL,          -- The domain or specific URL path
    status TEXT NOT NULL,          -- 'approved' or 'unapproved'
    total_minutes REAL DEFAULT 0,  -- Aggregate Time spent 
    total_hits INTEGER DEFAULT 0,  -- Aggregate Number of visits 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- This UNIQUE constraint prevents duplicating data for the same target on the same day
    UNIQUE(log_date, target)
);

-- 🚀 PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_rollups_date ON daily_rollups(log_date);
CREATE INDEX IF NOT EXISTS idx_rollups_target ON daily_rollups(target);