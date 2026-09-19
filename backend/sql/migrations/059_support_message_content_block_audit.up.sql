CREATE OR REPLACE FUNCTION sit_validate_support_message_content_block_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.action <> 'support.message_content_blocked' THEN
    RETURN NEW;
  END IF;

  IF NEW.resource_type <> 'support_case'
     OR NEW.actor_id IS NULL
     OR NEW.actor_role NOT IN ('support', 'admin')
     OR NEW.request_id IS NULL
     OR jsonb_typeof(NEW.metadata) <> 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(NEW.metadata)) <> 8
     OR NOT NEW.metadata ?& ARRAY[
       'reasonCode',
       'contentClass',
       'blockedField',
       'templateId',
       'detectionVersion',
       'inputStored',
       'messageCreated',
       'externalMessageSent'
     ]
     OR NEW.metadata ->> 'reasonCode'
       <> 'support_message_sensitive_content_blocked'
     OR NEW.metadata ->> 'contentClass' NOT IN ('secret', 'personal_data')
     OR NEW.metadata ->> 'blockedField' !~ '^[a-z0-9_]{1,80}$'
     OR NEW.metadata ->> 'templateId' !~ '^T-[0-9]{3}$'
     OR NEW.metadata ->> 'detectionVersion' <> 'sit_support_content_guard_v1'
     OR NEW.metadata -> 'inputStored' <> 'false'::jsonb
     OR NEW.metadata -> 'messageCreated' <> 'false'::jsonb
     OR NEW.metadata -> 'externalMessageSent' <> 'false'::jsonb THEN
    RAISE EXCEPTION 'support message content-block audit must remain exact and minimized'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_log_support_message_content_block_guard
BEFORE INSERT ON audit_log
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_message_content_block_audit();
