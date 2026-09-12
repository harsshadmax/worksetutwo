CREATE INDEX IF NOT EXISTS idx_worker_home_location
  ON worker_profiles USING GIST ("homeLocation");

CREATE INDEX IF NOT EXISTS idx_worker_current_location
  ON worker_profiles USING GIST ("currentLocation");

CREATE INDEX IF NOT EXISTS idx_booking_customer_location
  ON bookings USING GIST ("customerLocation");
