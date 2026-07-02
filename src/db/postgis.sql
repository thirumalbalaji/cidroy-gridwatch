CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS geom geography(Point, 4326);

UPDATE sites
SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
WHERE lat IS NOT NULL
  AND lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS sites_geom_gix ON sites USING gist (geom);
