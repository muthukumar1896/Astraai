-- ============================================================================
-- AstraAI Production Database Schema (PostgreSQL 15+ with pgvector)
-- Designed for Multi-Tenant Mobile AI Assistant
-- Compatible with Supabase Free Tier & Self-Hosted PostgreSQL
-- ============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. Users Table (Multi-Tenant Master)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE,
    phone_number VARCHAR(32) UNIQUE,
    display_name VARCHAR(128) NOT NULL,
    preferred_language VARCHAR(16) DEFAULT 'en-IN', -- Supports 'en-IN', 'ta-IN' (Tanglish), etc.
    timezone VARCHAR(64) DEFAULT 'Asia/Kolkata',
    fcm_token TEXT, -- Firebase Cloud Messaging push token
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast user lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);

-- 3. User Preferences (Context for Personalization)
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    wake_up_time TIME DEFAULT '06:30:00',
    sleep_time TIME DEFAULT '23:00:00',
    commute_style VARCHAR(64) DEFAULT 'cab_or_metro', -- 'bike', 'car', 'metro', 'cab'
    food_choices VARCHAR(64) DEFAULT 'flexible_south_indian', -- dietary preferences
    favorite_movie_theaters TEXT[] DEFAULT ARRAY['PVR Cinemas', 'INOX', 'SPI Cinemas'],
    default_apps JSONB DEFAULT '{
        "cab": "uber",
        "food": "swiggy",
        "movie": "bookmyshow",
        "music": "spotify"
    }'::JSONB,
    notification_channels JSONB DEFAULT '{
        "alarm_native": true,
        "push_fcm": true,
        "sound_enabled": true
    }'::JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. User Long-Term Memories (pgvector 768-dim Embeddings for Gemini)
CREATE TABLE IF NOT EXISTS user_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    memory_text TEXT NOT NULL,
    embedding vector(768) NOT NULL, -- Compatible with Google gemini-embedding-2 / text-embedding-004
    category VARCHAR(64) NOT NULL DEFAULT 'general', -- 'routine', 'preference', 'health', 'travel', 'people'
    importance_score FLOAT DEFAULT 0.5, -- 0.0 to 1.0
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create HNSW Vector Index for sub-millisecond approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_user_memories_embedding_hnsw 
ON user_memories USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Composite index for multi-tenant filtering by user and category
CREATE INDEX IF NOT EXISTS idx_user_memories_user_cat ON user_memories(user_id, category);
CREATE INDEX IF NOT EXISTS idx_user_memories_created_at ON user_memories(created_at DESC);

-- 5. Scheduled Proactive Reminders Table
CREATE TABLE IF NOT EXISTS scheduled_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    cron_schedule VARCHAR(64), -- e.g., '0 20 * * *' (Every day at 8:00 PM)
    execute_at TIMESTAMPTZ, -- For one-off scheduled actions
    status VARCHAR(32) NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'processing', 'dispatched', 'completed', 'cancelled'
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    recurrence_rule VARCHAR(128), -- e.g., 'DAILY', 'WEEKDAYS', 'EVERY_2_HOURS'
    action_type VARCHAR(64) DEFAULT 'fcm_alert', -- 'fcm_alert', 'native_alarm', 'deep_link_prompt'
    payload JSONB DEFAULT '{}'::JSONB, -- Context data for the action
    retry_count INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user_status ON scheduled_reminders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_execute_at ON scheduled_reminders(execute_at) WHERE status = 'scheduled';

-- 6. System Health & Keep-Alive Log (Prevents Free Supabase Pause & Render Spin-Down)
CREATE TABLE IF NOT EXISTS system_keep_alive (
    id SERIAL PRIMARY KEY,
    source VARCHAR(64) NOT NULL, -- e.g., 'render_worker', 'supabase_cron'
    ping_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active_tenants_count INT DEFAULT 0,
    notes TEXT
);

-- Keep only the last 500 ping rows to prevent DB bloat
CREATE OR REPLACE FUNCTION clean_old_keepalive_pings() 
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM system_keep_alive WHERE id < (SELECT MAX(id) - 500 FROM system_keep_alive);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_clean_keepalive ON system_keep_alive;
CREATE TRIGGER trigger_clean_keepalive
    AFTER INSERT ON system_keep_alive
    FOR EACH STATEMENT
    EXECUTE FUNCTION clean_old_keepalive_pings();

-- 7. Stored Procedure: Multi-Tenant Vector Similarity Search
-- Used by FastAPI to fetch relevant long-term memories before prompting Gemini
CREATE OR REPLACE FUNCTION match_user_memories(
    p_user_id UUID,
    query_embedding vector(768),
    match_threshold FLOAT DEFAULT 0.65,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    memory_text TEXT,
    category VARCHAR(64),
    similarity FLOAT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        um.id,
        um.memory_text,
        um.category,
        1 - (um.embedding <=> query_embedding) AS similarity,
        um.created_at
    FROM user_memories um
    WHERE um.user_id = p_user_id
      AND 1 - (um.embedding <=> query_embedding) >= match_threshold
    ORDER BY um.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;

-- 8. Row Level Security (RLS) Configuration for Supabase
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reminders ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage only their own data
CREATE POLICY "Users can only read and update own profile" 
ON users FOR ALL 
USING (auth.uid() = id);

CREATE POLICY "Users can only access own preferences" 
ON user_preferences FOR ALL 
USING (auth.uid() = user_id);

CREATE POLICY "Users can only access own memories" 
ON user_memories FOR ALL 
USING (auth.uid() = user_id);

CREATE POLICY "Users can only access own reminders" 
ON scheduled_reminders FOR ALL 
USING (auth.uid() = user_id);

-- 9. Seed Sample Data for Instant Testing
INSERT INTO users (id, email, phone_number, display_name, preferred_language, timezone)
VALUES 
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'muthu@example.com', '+919876543210', 'Muthukumar', 'ta-IN', 'Asia/Kolkata'),
    ('b1ffcd88-8b1a-4fe7-aa5c-5aa8ac271b22', 'sarah@example.com', '+14155552671', 'Sarah Chen', 'en-US', 'America/Los_Angeles')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_preferences (user_id, wake_up_time, commute_style, food_choices)
VALUES 
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '06:00:00', 'bike', 'Chettinad Non-Veg & Filter Coffee'),
    ('b1ffcd88-8b1a-4fe7-aa5c-5aa8ac271b22', '07:30:00', 'metro', 'Vegan & Matcha Latte')
ON CONFLICT (user_id) DO NOTHING;
