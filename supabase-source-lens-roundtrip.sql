-- Source Lens SL-3: allow only the two registered local source operation kinds.
-- No source body is added to the database; plans and results remain bounded metadata.

alter table public.local_connector_operations
  drop constraint if exists local_connector_operations_action_check;

alter table public.local_connector_operations
  add constraint local_connector_operations_action_check
  check (action in ('push', 'pull_ff_only', 'source_edit', 'source_edit_rollback'));
