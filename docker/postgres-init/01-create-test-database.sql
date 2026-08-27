-- The integration suite runs against its own database so a test run can never
-- truncate development data.
CREATE DATABASE afh_portal_test OWNER afh;
