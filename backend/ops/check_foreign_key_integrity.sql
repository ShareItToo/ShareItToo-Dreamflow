BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

DO $sit_fk_integrity$
DECLARE
  task_constraint record;
  task_orphan_count bigint;
  task_constraint_count integer := 0;
  task_failed_constraint_count integer := 0;
  task_orphan_total bigint := 0;
  task_where_clause text;
BEGIN
  FOR task_constraint IN
    SELECT
      constraint_row.conname AS constraint_name,
      constraint_row.conrelid::regclass AS child_table,
      constraint_row.confrelid::regclass AS parent_table,
      constraint_row.confmatchtype AS match_type,
      constraint_row.convalidated AS is_validated,
      string_agg(
        format('child_row.%I = parent_row.%I', child_column.attname,
          parent_column.attname),
        ' AND ' ORDER BY key_row.ordinality
      ) AS join_predicate,
      string_agg(
        format('child_row.%I IS NOT NULL', child_column.attname),
        ' AND ' ORDER BY key_row.ordinality
      ) AS all_child_columns_not_null,
      string_agg(
        format('child_row.%I IS NULL', child_column.attname),
        ' AND ' ORDER BY key_row.ordinality
      ) AS all_child_columns_null,
      string_agg(
        format('child_row.%I IS NULL', child_column.attname),
        ' OR ' ORDER BY key_row.ordinality
      ) AS any_child_column_null
    FROM pg_constraint AS constraint_row
    JOIN pg_namespace AS child_namespace
      ON child_namespace.oid = constraint_row.connamespace
    CROSS JOIN LATERAL unnest(
      constraint_row.conkey,
      constraint_row.confkey
    ) WITH ORDINALITY AS key_row(
      child_attribute_number,
      parent_attribute_number,
      ordinality
    )
    JOIN pg_attribute AS child_column
      ON child_column.attrelid = constraint_row.conrelid
     AND child_column.attnum = key_row.child_attribute_number
     AND NOT child_column.attisdropped
    JOIN pg_attribute AS parent_column
      ON parent_column.attrelid = constraint_row.confrelid
     AND parent_column.attnum = key_row.parent_attribute_number
     AND NOT parent_column.attisdropped
    WHERE constraint_row.contype = 'f'
      AND child_namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND child_namespace.nspname !~ '^pg_toast'
    GROUP BY
      constraint_row.oid,
      constraint_row.conname,
      constraint_row.conrelid,
      constraint_row.confrelid,
      constraint_row.confmatchtype,
      constraint_row.convalidated
    ORDER BY constraint_row.conrelid::regclass::text, constraint_row.conname
  LOOP
    task_constraint_count := task_constraint_count + 1;

    IF task_constraint.match_type = 's' THEN
      task_where_clause := format(
        '(%s) AND NOT EXISTS (SELECT 1 FROM %s AS parent_row WHERE %s)',
        task_constraint.all_child_columns_not_null,
        task_constraint.parent_table,
        task_constraint.join_predicate
      );
    ELSIF task_constraint.match_type = 'f' THEN
      task_where_clause := format(
        'NOT (%s) AND ((%s) OR NOT EXISTS (SELECT 1 FROM %s AS parent_row WHERE %s))',
        task_constraint.all_child_columns_null,
        task_constraint.any_child_column_null,
        task_constraint.parent_table,
        task_constraint.join_predicate
      );
    ELSE
      RAISE EXCEPTION
        'SIT_FK_INTEGRITY_UNSUPPORTED_MATCH table=% constraint=% match_type=%',
        task_constraint.child_table,
        task_constraint.constraint_name,
        task_constraint.match_type;
    END IF;

    EXECUTE format(
      'SELECT count(*)::bigint FROM %s AS child_row WHERE %s',
      task_constraint.child_table,
      task_where_clause
    ) INTO task_orphan_count;

    IF task_orphan_count > 0 THEN
      task_failed_constraint_count := task_failed_constraint_count + 1;
      task_orphan_total := task_orphan_total + task_orphan_count;
      RAISE WARNING
        'SIT_FK_INTEGRITY_VIOLATION table=% constraint=% orphan_rows=% validated=%',
        task_constraint.child_table,
        task_constraint.constraint_name,
        task_orphan_count,
        task_constraint.is_validated;
    END IF;
  END LOOP;

  IF task_failed_constraint_count > 0 THEN
    RAISE EXCEPTION
      'SIT_FK_INTEGRITY_FAILED constraints=% orphan_rows=%',
      task_failed_constraint_count,
      task_orphan_total;
  END IF;

  RAISE NOTICE 'SIT_FK_INTEGRITY_OK constraints=%', task_constraint_count;
END;
$sit_fk_integrity$;

COMMIT;
