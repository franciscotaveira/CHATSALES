-- Channel removal now archives instead of deleting operational records.
-- Restore the transactional producer boundary: runtime app cannot delete outbox commands.
REVOKE DELETE ON TABLE public.outbound_commands FROM sos_app_user;
