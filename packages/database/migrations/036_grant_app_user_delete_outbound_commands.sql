-- Migration 036: Grant DELETE on outbound_commands to sos_app_user for clean channel instance unlinking
GRANT DELETE ON TABLE public.outbound_commands TO sos_app_user;
