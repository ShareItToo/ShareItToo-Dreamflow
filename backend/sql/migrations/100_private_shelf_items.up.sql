-- P3-A adds owner-only private shelf items and purpose-bound private media.
-- Nothing in these tables is a listing, searchable offer, reservation or booking.

CREATE TABLE private_shelf_items (
  id TEXT PRIMARY KEY CHECK (
    id ~ '^shelf_item_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_version TEXT NOT NULL CHECK (domain_version = 'P3-A-2026-10-01.1'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  category_key TEXT NOT NULL CHECK (category_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{1,79}$'),
  condition TEXT NOT NULL CHECK (condition IN ('new', 'like-new', 'good', 'acceptable', 'worn', 'used')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id)
);

CREATE INDEX private_shelf_items_owner_updated_idx
  ON private_shelf_items(owner_id, updated_at DESC, id);

CREATE TABLE private_shelf_item_commands (
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_.:-]{8,160}$'),
  request_sha256 CHAR(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  shelf_item_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, idempotency_key),
  FOREIGN KEY (shelf_item_id, owner_id)
    REFERENCES private_shelf_items(id, owner_id) ON DELETE CASCADE
);

CREATE INDEX private_shelf_item_commands_item_idx
  ON private_shelf_item_commands(shelf_item_id, created_at);

CREATE TABLE private_shelf_media (
  id UUID PRIMARY KEY,
  shelf_item_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  storage_name TEXT NOT NULL UNIQUE CHECK (
    storage_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-full[.]webp$'
  ),
  thumbnail_storage_name TEXT NOT NULL UNIQUE CHECK (
    thumbnail_storage_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-thumb[.]webp$'
  ),
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/webp'),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  thumbnail_byte_size INTEGER NOT NULL CHECK (thumbnail_byte_size > 0),
  image_width INTEGER NOT NULL CHECK (image_width > 0),
  image_height INTEGER NOT NULL CHECK (image_height > 0),
  content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  thumbnail_content_sha256 CHAR(64) NOT NULL CHECK (thumbnail_content_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (shelf_item_id, owner_id)
    REFERENCES private_shelf_items(id, owner_id) ON DELETE CASCADE
);

CREATE INDEX private_shelf_media_owner_item_idx
  ON private_shelf_media(owner_id, shelf_item_id, created_at, id);

-- File deletion happens after the owning database transaction commits.  Keep a
-- durable, owner-free retry record so a transient filesystem failure cannot
-- turn a cascaded media row into an untraceable orphan.
CREATE TABLE private_shelf_media_cleanup_outbox (
  id UUID PRIMARY KEY,
  storage_name TEXT NOT NULL UNIQUE CHECK (
    storage_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-(full|thumb)[.]webp$'
  ),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('reserved', 'pending', 'retry')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code TEXT CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,80}$'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX private_shelf_media_cleanup_outbox_ready_idx
  ON private_shelf_media_cleanup_outbox(status, updated_at, created_at, id);
