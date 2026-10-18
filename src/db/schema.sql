CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  full_text TEXT NOT NULL,
  page_count INTEGER NOT NULL,
  word_count INTEGER NOT NULL,
  object_key TEXT
);

CREATE TABLE IF NOT EXISTS contexts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  subject TEXT NOT NULL,
  target TEXT NOT NULL,
  level TEXT NOT NULL,
  deadline DATE,
  language TEXT DEFAULT 'en',
  source_count INTEGER NOT NULL,
  page_count INTEGER NOT NULL,
  word_count INTEGER NOT NULL,
  reading_minutes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS context_materials (
  context_id TEXT REFERENCES contexts(id) ON DELETE CASCADE,
  material_id TEXT REFERENCES materials(id) ON DELETE CASCADE,
  PRIMARY KEY (context_id, material_id)
);

CREATE TABLE IF NOT EXISTS question_sets (
  context_id TEXT PRIMARY KEY REFERENCES contexts(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'ready', 'failed')),
  requested_count INTEGER NOT NULL,
  questions JSONB,
  error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_question_sets_jobs ON question_sets(status, updated_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  context_id TEXT NOT NULL,
  parent_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  is_retest BOOLEAN DEFAULT FALSE,
  weak_only BOOLEAN DEFAULT FALSE,
  questions JSONB NOT NULL,
  answers JSONB DEFAULT '[]'::jsonb,
  scores JSONB DEFAULT '[]'::jsonb,
  readiness_score INTEGER,
  topic_summary JSONB DEFAULT '{}'::jsonb,
  weak_topics JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS score_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_index INTEGER NOT NULL,
  question_snapshot JSONB NOT NULL,
  transcript TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_score_jobs_pending ON score_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_score_jobs_session ON score_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE TABLE IF NOT EXISTS study_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New session',
  material_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  upload_draft JSONB NOT NULL DEFAULT '{}'::jsonb,
  goal_draft JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_id TEXT,
  practice_id TEXT,
  practice_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_study_sessions_owner ON study_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_materials_user_id ON materials(user_id);
CREATE INDEX IF NOT EXISTS idx_contexts_user_id ON contexts(user_id);

CREATE TABLE IF NOT EXISTS concept_mastery (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  context_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  best_score INTEGER NOT NULL,
  attempts INTEGER DEFAULT 1,
  last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  next_review_at TIMESTAMPTZ,
  UNIQUE(context_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_concept_mastery_review ON concept_mastery(next_review_at);
CREATE INDEX IF NOT EXISTS idx_concept_mastery_user_id ON concept_mastery(user_id);
