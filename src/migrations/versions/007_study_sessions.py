"""Server-owned study sessions from the first step.

Revision ID: 007
Revises: 006
"""

from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS study_sessions (
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
    )""")
    op.execute("CREATE INDEX IF NOT EXISTS idx_study_sessions_owner ON study_sessions(user_id, updated_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS study_sessions")
