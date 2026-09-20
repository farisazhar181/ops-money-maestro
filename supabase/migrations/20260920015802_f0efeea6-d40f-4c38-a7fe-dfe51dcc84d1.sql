DELETE FROM public.user_roles WHERE user_id = '2b7feb06-9282-4918-88f7-67286f0c0723';
UPDATE public.profiles SET status = 'active'::public.account_status WHERE id = '2b7feb06-9282-4918-88f7-67286f0c0723';
INSERT INTO public.user_roles (user_id, role) VALUES ('2b7feb06-9282-4918-88f7-67286f0c0723', 'owner'::public.app_role);