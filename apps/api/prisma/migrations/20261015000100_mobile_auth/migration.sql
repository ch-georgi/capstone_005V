ALTER TABLE users ADD COLUMN credentials_version INTEGER NOT NULL DEFAULT 0 CHECK (credentials_version >= 0);
CREATE TABLE auth_sessions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
 expires_at TIMESTAMPTZ(3) NOT NULL, revoked_at TIMESTAMPTZ(3), created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (expires_at > created_at), CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX auth_sessions_user_id_revoked_at_idx ON auth_sessions(user_id,revoked_at);
ALTER TABLE refresh_tokens ADD COLUMN session_id UUID REFERENCES auth_sessions(id) ON DELETE RESTRICT;
-- Previously unused refresh credentials have no verifiable device/context.
UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE revoked_at IS NULL;
CREATE TABLE auth_challenges (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
 purpose TEXT NOT NULL CHECK (purpose IN ('CLINIC_SELECTION','PASSWORD_CODE','PASSWORD_RESET')),
 secret_hash VARCHAR(64) NOT NULL CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
 credentials_version INTEGER NOT NULL CHECK (credentials_version >= 0), attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 expires_at TIMESTAMPTZ(3) NOT NULL, consumed_at TIMESTAMPTZ(3), created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (expires_at > created_at)
);
CREATE INDEX auth_challenges_user_id_purpose_idx ON auth_challenges(user_id,purpose);
CREATE TABLE auth_rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL CHECK (count > 0), reset_at TIMESTAMPTZ(3) NOT NULL);
