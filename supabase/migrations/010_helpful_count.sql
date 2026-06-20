-- TASK-034: helpful_count column + increment_trip_helpful RPC
-- Pattern follows 009_view_count.sql (SECURITY DEFINER, anon GRANT)

ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS helpful_count INTEGER DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_trip_helpful(trip_id_param UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE itineraries
  SET helpful_count = helpful_count + 1
  WHERE id = trip_id_param;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_trip_helpful(UUID) TO anon;
