CREATE TABLE public.users (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL CHECK (char_length(btrim(name)) > 0),
    email VARCHAR(254) NOT NULL UNIQUE CHECK (email = lower(email)),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.company_memberships (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'purchasing', 'warehouse', 'production', 'finance', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, company_id)
);
CREATE INDEX company_memberships_company_idx ON public.company_memberships(company_id, user_id);

CREATE TABLE public.auth_sessions (
    id UUID PRIMARY KEY,
    token_hash CHAR(64) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    csrf_token VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX auth_sessions_user_idx ON public.auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry_idx ON public.auth_sessions(expires_at);
