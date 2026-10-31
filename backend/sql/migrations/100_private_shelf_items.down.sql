DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM private_shelf_items) THEN
    RAISE EXCEPTION 'private_shelf_rows_active';
  END IF;
  IF EXISTS (SELECT 1 FROM private_shelf_media_cleanup_outbox) THEN
    RAISE EXCEPTION 'private_shelf_media_cleanup_outbox_active';
  END IF;
END;
$$;

DROP TABLE IF EXISTS private_shelf_media;
DROP TABLE IF EXISTS private_shelf_item_commands;
DROP TABLE IF EXISTS private_shelf_items;
DROP TABLE IF EXISTS private_shelf_media_cleanup_outbox;
