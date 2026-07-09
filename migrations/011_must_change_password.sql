-- Admin/seller accounts created via provisioning (given a temporary password
-- by the system) must change their own password on first login. Defaults to false
-- so old accounts and accounts that already set their own password aren't forced.
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT false;
