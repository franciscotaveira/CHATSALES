-- AI Receptionist creates outbound commands inside withWorkerTransaction.
-- The worker already has SELECT/UPDATE, but enqueueing also requires INSERT.
-- Keep FORCE RLS and the existing workspace-scoped worker policy unchanged.
GRANT INSERT ON TABLE public.outbound_commands TO sos_worker_user;
