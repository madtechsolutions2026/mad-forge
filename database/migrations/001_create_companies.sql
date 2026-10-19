CREATE TABLE public.companies (
    id UUID PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    address VARCHAR(500),
    phone VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT companies_name_not_blank CHECK (char_length(btrim(name)) > 0),
    CONSTRAINT companies_address_not_blank CHECK (
        address IS NULL OR char_length(btrim(address)) > 0
    ),
    CONSTRAINT companies_phone_not_blank CHECK (
        phone IS NULL OR char_length(btrim(phone)) > 0
    )
);
