-- ============================================================================
-- TACIZIN · SCHEMA DO BANCO (Supabase / PostgreSQL)
-- ============================================================================
-- Como usar:
--   1. Crie um projeto em https://supabase.com
--   2. Abra o SQL Editor e cole TODO este arquivo
--   3. Clique em Run (pode rodar novamente; o script é idempotente)
--   4. Cadastre-se pelo site e promova sua conta a administrador (final do arquivo)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensão de remoção de acentos (necessária para busca e ordenação)
-- ----------------------------------------------------------------------------
do $$
declare
  ext_schema text;
begin
  select n.nspname into ext_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'unaccent';

  if ext_schema is null then
    -- No Supabase, o schema "extensions" já existe e é o local recomendado.
    if exists (select 1 from pg_namespace where nspname = 'extensions') then
      execute 'create extension unaccent with schema extensions';
    else
      execute 'create extension unaccent';
    end if;

    select n.nspname into ext_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'unaccent';
  end if;

  execute format($fmt$
    create or replace function public.tz_unaccent(value text)
    returns text
    language sql
    immutable
    strict
    parallel safe
    as $fn$ select %I.unaccent($1) $fn$;
  $fmt$, ext_schema);
end $$;

-- ----------------------------------------------------------------------------
-- 1. PERFIS (1:1 com auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null check (char_length(btrim(username)) between 3 and 24),
  role       text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- Cria o perfil automaticamente quando alguém se cadastra.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_username text;
begin
  desired_username := btrim(
    coalesce(
      new.raw_user_meta_data->>'username',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  );

  if desired_username is null or char_length(desired_username) < 3 then
    desired_username := 'usuario_' || substr(new.id::text, 1, 6);
  end if;

  insert into public.profiles (id, username)
  values (new.id, desired_username);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Consulta pública usada no formulário de cadastro (evita erro de nome repetido).
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.profiles
    where lower(username) = lower(btrim(p_username))
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. DICIONÁRIO
-- ----------------------------------------------------------------------------
create table if not exists public.words (
  id            uuid primary key default gen_random_uuid(),
  word          text not null check (char_length(btrim(word)) between 1 and 80),
  word_norm     text not null default '',
  meaning       text not null check (char_length(btrim(meaning)) between 1 and 600),
  pronunciation text check (pronunciation is null or char_length(pronunciation) <= 120),
  notes         text check (notes is null or char_length(notes) <= 600),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

create unique index if not exists words_word_norm_key
  on public.words (word_norm);

create index if not exists words_word_norm_idx
  on public.words (word_norm);

create or replace function public.words_before_write()
returns trigger
language plpgsql
as $$
begin
  new.word := btrim(new.word);
  new.meaning := btrim(new.meaning);
  new.word_norm := lower(public.tz_unaccent(new.word));

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists words_before_write on public.words;
create trigger words_before_write
  before insert or update on public.words
  for each row execute function public.words_before_write();

-- ----------------------------------------------------------------------------
-- 3. SUGESTÕES
-- ----------------------------------------------------------------------------
create table if not exists public.suggestions (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles(id) on delete cascade,
  kind          text not null default 'new_word'
                check (kind in ('new_word', 'edit_word', 'other')),
  word_id       uuid references public.words(id) on delete set null,
  word          text check (word is null or char_length(word) <= 80),
  meaning       text check (meaning is null or char_length(meaning) <= 600),
  pronunciation text check (pronunciation is null or char_length(pronunciation) <= 120),
  note          text check (note is null or char_length(note) <= 600),
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  review_note   text check (review_note is null or char_length(review_note) <= 400),
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint suggestions_fields_check check (
    kind = 'other'
    or (
      btrim(coalesce(word, '')) <> ''
      and btrim(coalesce(meaning, '')) <> ''
    )
  )
);

create index if not exists suggestions_status_idx
  on public.suggestions (status, created_at desc);

create index if not exists suggestions_author_idx
  on public.suggestions (author_id, created_at desc);

-- Limite simples anti-spam: 10 sugestões pendentes por pessoa.
create or replace function public.suggestions_limit_pending()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from public.suggestions
    where author_id = new.author_id
      and status = 'pending'
  ) >= 10 then
    raise exception 'Limite de 10 sugestões pendentes. Aguarde a análise do administrador.';
  end if;

  return new;
end;
$$;

drop trigger if exists suggestions_limit_pending on public.suggestions;
create trigger suggestions_limit_pending
  before insert on public.suggestions
  for each row execute function public.suggestions_limit_pending();

-- ----------------------------------------------------------------------------
-- 4. PERSONALIZAÇÃO DO PORTAL (linha única)
-- ----------------------------------------------------------------------------
create table if not exists public.site_settings (
  id           integer primary key default 1 check (id = 1),
  site_name    text not null default 'Tacizin' check (char_length(site_name) between 1 and 40),
  tagline      text not null default 'Idimus Donv Zan' check (char_length(tagline) between 1 and 60),
  hero_phrase  text not null default '“Uma língua. Uma identidade. Uma civilização.”',
  about        text,
  accent       text not null default '#c9b68c' check (accent ~ '^#[0-9a-fA-F]{6}$'),
  accent2      text not null default '#8f7f60' check (accent2 ~ '^#[0-9a-fA-F]{6}$'),
  footer_text  text not null default '© TACIZIN · IDIMUS DONV ZAN',
  logo_url     text,
  updated_by   uuid references public.profiles(id) on delete set null,
  updated_at   timestamptz not null default now()
);

insert into public.site_settings (id)
values (1)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 5. AUTORIZAÇÃO
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- Aprovação atômica: publica/atualiza a palavra e marca a sugestão.
create or replace function public.approve_suggestion(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  suggestion public.suggestions;
  target_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Apenas o administrador pode aprovar sugestões.';
  end if;

  select * into suggestion
  from public.suggestions
  where id = p_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Sugestão não encontrada ou já analisada.';
  end if;

  if suggestion.kind = 'edit_word' then
    if suggestion.word_id is null then
      raise exception 'A palavra original não existe mais.';
    end if;

    update public.words
       set word = coalesce(nullif(btrim(suggestion.word), ''), word),
           meaning = coalesce(nullif(btrim(suggestion.meaning), ''), meaning),
           pronunciation = coalesce(nullif(btrim(suggestion.pronunciation), ''), pronunciation)
     where id = suggestion.word_id
     returning id into target_id;

    if target_id is null then
      raise exception 'A palavra original não existe mais.';
    end if;

  elsif suggestion.kind = 'other' then
    raise exception 'Sugestões do tipo "outro" devem ser recusadas ou excluídas.';

  else
    insert into public.words (word, word_norm, meaning, pronunciation, created_by)
    values (
      btrim(suggestion.word),
      '',
      btrim(suggestion.meaning),
      nullif(btrim(suggestion.pronunciation), ''),
      auth.uid()
    )
    returning id into target_id;
  end if;

  update public.suggestions
     set status = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         word_id = target_id
   where id = p_id;

  return target_id;

exception
  when unique_violation then
    raise exception 'Já existe uma palavra com esse nome no dicionário.';
  when check_violation then
    raise exception 'Palavra ou significado fora do tamanho permitido.';
end;
$$;

create or replace function public.reject_suggestion(p_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas o administrador pode recusar sugestões.';
  end if;

  update public.suggestions
     set status = 'rejected',
         review_note = nullif(btrim(p_note), ''),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_id
     and status = 'pending';

  if not found then
    raise exception 'Sugestão não encontrada ou já analisada.';
  end if;
end;
$$;

-- Importação em lote do backup antigo (somente administrador).
create or replace function public.import_words(p_words jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  w text;
  m text;
  p text;
  inserted integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Apenas o administrador pode importar palavras.';
  end if;

  if jsonb_typeof(p_words) <> 'array' then
    raise exception 'Formato inválido: esperado um array de palavras.';
  end if;

  for item in select value from jsonb_array_elements(p_words) as t(value) loop
    w := btrim(coalesce(item->>'word', ''));
    m := btrim(coalesce(item->>'meaning', ''));
    p := nullif(btrim(coalesce(item->>'pronunciation', '')), '');

    if char_length(w) < 1 or char_length(w) > 80 then
      continue;
    end if;

    if char_length(m) < 1 or char_length(m) > 600 then
      continue;
    end if;

    insert into public.words (word, word_norm, meaning, pronunciation, created_by)
    values (w, '', m, p, auth.uid())
    on conflict (word_norm) do nothing;

    if found then
      inserted := inserted + 1;
    end if;
  end loop;

  return inserted;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.words         enable row level security;
alter table public.suggestions   enable row level security;
alter table public.site_settings enable row level security;

-- Perfis: cada pessoa vê o próprio; o administrador vê todos.
drop policy if exists profiles_read_own_or_admin on public.profiles;
create policy profiles_read_own_or_admin
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid() and role = 'user');

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Dicionário: leitura pública, escrita apenas do administrador.
drop policy if exists words_read_all on public.words;
create policy words_read_all
  on public.words for select
  to anon, authenticated
  using (true);

drop policy if exists words_admin_write on public.words;
create policy words_admin_write
  on public.words for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Sugestões: o autor cria e lê as suas; o administrador lê e decide tudo.
drop policy if exists suggestions_insert_own on public.suggestions;
create policy suggestions_insert_own
  on public.suggestions for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

drop policy if exists suggestions_read_own_or_admin on public.suggestions;
create policy suggestions_read_own_or_admin
  on public.suggestions for select
  to authenticated
  using (author_id = auth.uid() or public.is_admin());

drop policy if exists suggestions_admin_update on public.suggestions;
create policy suggestions_admin_update
  on public.suggestions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists suggestions_admin_delete on public.suggestions;
create policy suggestions_admin_delete
  on public.suggestions for delete
  to authenticated
  using (public.is_admin());

-- Personalização: leitura pública, escrita apenas do administrador.
drop policy if exists settings_read_all on public.site_settings;
create policy settings_read_all
  on public.site_settings for select
  to anon, authenticated
  using (true);

drop policy if exists settings_admin_write on public.site_settings;
create policy settings_admin_write
  on public.site_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 7. PERMISSÕES DE COLUNA / TABELA
-- ----------------------------------------------------------------------------
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant insert on public.profiles to authenticated;
grant update (username) on public.profiles to authenticated;

revoke all on public.words from anon;
revoke all on public.words from authenticated;
grant select on public.words to anon, authenticated;
grant insert, update, delete on public.words to authenticated;

revoke all on public.suggestions from anon;
revoke all on public.suggestions from authenticated;
grant select, insert on public.suggestions to authenticated;
grant update, delete on public.suggestions to authenticated;

revoke all on public.site_settings from anon;
revoke all on public.site_settings from authenticated;
grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

revoke all on function public.approve_suggestion(uuid) from public;
grant execute on function public.approve_suggestion(uuid) to authenticated;

revoke all on function public.reject_suggestion(uuid, text) from public;
grant execute on function public.reject_suggestion(uuid, text) to authenticated;

revoke all on function public.import_words(jsonb) from public;
grant execute on function public.import_words(jsonb) to authenticated;

grant execute on function public.is_admin() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. STORAGE (logo do portal)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assets',
  'assets',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tacizin_assets_read on storage.objects;
create policy tacizin_assets_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'assets');

drop policy if exists tacizin_assets_insert on storage.objects;
create policy tacizin_assets_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'assets' and public.is_admin());

drop policy if exists tacizin_assets_update on storage.objects;
create policy tacizin_assets_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'assets' and public.is_admin())
  with check (bucket_id = 'assets' and public.is_admin());

drop policy if exists tacizin_assets_delete on storage.objects;
create policy tacizin_assets_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'assets' and public.is_admin());

-- ----------------------------------------------------------------------------
-- 9. REALTIME (atualização automática do dicionário e das sugestões)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'words'
  ) then
    alter publication supabase_realtime add table public.words;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'suggestions'
  ) then
    alter publication supabase_realtime add table public.suggestions;
  end if;
exception
  when undefined_object then
    raise notice 'Publicação supabase_realtime não encontrada; configure o Realtime manualmente no painel.';
  when insufficient_privilege then
    raise notice 'Sem permissão para alterar a publicação; ative o Realtime manualmente no painel.';
end $$;

-- ============================================================================
-- PRIMEIRO ADMINISTRADOR
-- ============================================================================
-- 1. Cadastre-se pelo site (ex.: usuário "Zani").
-- 2. Execute:
--
--    update public.profiles
--    set role = 'admin'
--    where username = 'Zani';
--
-- 3. Saia e entre novamente. O item "Administração" aparecerá no menu.
--
-- Para adicionar outro administrador, repita o update com o username desejado.
-- Nunca permita que o papel "admin" seja escolhido pela interface: o grant
-- acima só permite ao usuário alterar o próprio username.
-- ============================================================================
