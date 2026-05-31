-- Fix: reveal_mode was readable only by the `anon` role (0004). Since the auth
-- identity rework (0010) every player gets an anonymous-auth session and so acts
-- as `authenticated`, for which RLS returned zero rows — silently collapsing the
-- reveal-mode list to the client-side blur/scanner/mosaic fallback. Widen the
-- policy to `public` so both anon and authenticated can read the toggles, like
-- every other public-read table (card, mode, …).
drop policy if exists "reveal_mode public read" on reveal_mode;
create policy "reveal_mode public read" on reveal_mode
  for select to public using (true);
