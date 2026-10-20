-- Default table privileges must not let the application rewrite or erase event receipts.
REVOKE UPDATE,DELETE,TRUNCATE ON public.integration_event_receipts FROM sos_app_user,sos_worker_user,sos_ingress_user;
REVOKE UPDATE,DELETE,TRUNCATE ON public.external_payment_confirmations FROM sos_app_user,sos_worker_user,sos_ingress_user;
