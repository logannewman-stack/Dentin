-- ---------------------------------------------------------------------------
-- 0011 — take the name Google gives us.
--
-- Google puts the person's name under `name` (and `full_name` only
-- sometimes), so an OAuth signup was landing with the email prefix as their
-- display name — "doc" instead of "Dr. Ana Docherty".
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;
