CREATE INDEX IF NOT EXISTS foods_name_trgm_idx ON foods USING GIN(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS foods_brand_trgm_idx ON foods USING GIN(brand gin_trgm_ops);