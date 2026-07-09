CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(20) NOT NULL,   -- 'create' | 'update' | 'delete'
  entity VARCHAR(50) NOT NULL,   -- Table or entity name
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
