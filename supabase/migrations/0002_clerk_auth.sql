-- Move application ownership from Supabase Auth UUIDs to Clerk user IDs.
-- Clerk IDs are opaque strings (for example, user_...), so they cannot be
-- stored in the UUID columns/FKs created by the initial Supabase migration.

begin;

-- Existing Supabase Auth users and their trigger are no longer the source of
-- application identities. Keep the profiles table for optional user metadata,
-- but remove its dependency on auth.users so Clerk users can be used directly.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- PostgreSQL will not change a column type while RLS policies or helper
-- functions depend on it. Remove the owner policies/helpers first, then
-- recreate their Clerk/text equivalents below in the same transaction.
drop policy if exists profiles_owner_select on public.profiles;
drop policy if exists profiles_owner_update on public.profiles;
drop policy if exists stores_owner_all on public.stores;
drop policy if exists items_owner_all on public.items;
drop policy if exists item_images_owner_all on public.item_images;
drop policy if exists processing_jobs_owner_select on public.processing_jobs;
drop policy if exists try_on_sessions_owner_select on public.try_on_sessions;
drop policy if exists reservations_owner_select on public.reservations;
drop policy if exists catalog_owner_manage on storage.objects;
drop function if exists public.storage_path_is_owned(text);
drop function if exists public.is_item_owner(uuid);
drop function if exists public.is_store_owner(uuid);

alter table public.profiles
  drop constraint if exists profiles_id_fkey;
alter table public.stores
  drop constraint if exists stores_owner_id_fkey;
alter table public.profiles
  alter column id type text using id::text;

alter table public.stores
  alter column owner_id type text using owner_id::text;

comment on column public.profiles.id is 'Clerk user ID';
comment on column public.stores.owner_id is 'Clerk user ID';

-- Keep the existing RLS helpers usable for any direct Supabase clients. The
-- trusted Next.js server uses the service key, while Clerk authenticates the
-- request before these helpers are reached.
create or replace function public.is_store_owner(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stores
    where id = p_store_id and owner_id = auth.uid()::text
  );
$$;

create or replace function public.is_item_owner(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.items i
    join public.stores s on s.id = i.store_id
    where i.id = p_item_id and s.owner_id = auth.uid()::text
  );
$$;

create or replace function public.storage_path_is_owned(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  store_id uuid;
begin
  begin
    store_id := split_part(p_path, '/', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return public.is_store_owner(store_id);
end;
$$;

drop policy if exists profiles_owner_select on public.profiles;
create policy profiles_owner_select on public.profiles for select to authenticated
  using (id = auth.uid()::text);
drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles for update to authenticated
  using (id = auth.uid()::text) with check (id = auth.uid()::text);

drop policy if exists stores_owner_all on public.stores;
create policy stores_owner_all on public.stores for all to authenticated
  using (owner_id = auth.uid()::text) with check (owner_id = auth.uid()::text);

create policy items_owner_all on public.items for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
create policy item_images_owner_all on public.item_images for all to authenticated
  using (public.is_item_owner(item_id)) with check (public.is_item_owner(item_id));
create policy processing_jobs_owner_select on public.processing_jobs for select to authenticated
  using (public.is_store_owner(store_id));
create policy try_on_sessions_owner_select on public.try_on_sessions for select to authenticated
  using (public.is_store_owner(store_id));
create policy reservations_owner_select on public.reservations for select to authenticated
  using (public.is_store_owner(store_id));
create policy catalog_owner_manage on storage.objects for all to authenticated
  using (bucket_id = 'catalog' and public.storage_path_is_owned(name))
  with check (bucket_id = 'catalog' and public.storage_path_is_owned(name));

commit;
