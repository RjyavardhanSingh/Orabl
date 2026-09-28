"""own auth: app_users + app_sessions (replaces Neon Auth / Better Auth)

Revision ID: 005
Revises: 004
Create Date: 2026-09-28
"""

from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS app_users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            google_sub TEXT NOT NULL UNIQUE,
            email_verified BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email ON app_users (LOWER(email))")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS app_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ,
            last_used_at TIMESTAMPTZ
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON app_sessions(user_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS app_sessions")
    op.execute("DROP TABLE IF EXISTS app_users")
