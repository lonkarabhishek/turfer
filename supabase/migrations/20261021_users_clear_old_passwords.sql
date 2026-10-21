-- The old app's email sign-up left values in users.password that are
-- neither bcrypt hashes nor the current app's placeholders
-- ('phone-auth-no-password', 'oauth-no-password'). Nothing reads the
-- column (public roles have no SELECT on it, and the Next.js app never
-- selects it), so keeping them only adds risk. Clear them.
update public.users
   set password = null
 where password is not null
   and password not in ('phone-auth-no-password', 'oauth-no-password')
   and password !~ '^\$2[aby]\$';
