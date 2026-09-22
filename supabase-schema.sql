-- ============================================================
-- Hauta TESTV2.0 USER — schema migration
-- Run this whole file in Supabase SQL Editor.
-- If you already have an old "hauta_sessions" table from a
-- previous version, this DROPS it first — any old test data
-- in it will be lost.
-- ============================================================

create extension if not exists pgcrypto;

drop table if exists hauta_sessions cascade;

create table hauta_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table hauta_sessions enable row level security;

-- Only the owner can read, insert, update, or delete their own sessions.
-- Nobody else — logged in or not — can query this table directly.
create policy "Owner full access" on hauta_sessions
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ------------------------------------------------------------
-- Everyone else (participants ranking, interviewers rating) never
-- logs in and never touches the table directly. They go through
-- these three functions instead, which run with elevated rights
-- but only ever expose or change exactly what a valid code allows.
-- ------------------------------------------------------------

-- Look up a session by a participant code or interviewer code.
-- Returns the whole session's data (read-only) so the app can
-- render competencies/weights/notes, or null if the code doesn't match.
create or replace function hauta_get_session_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select data into result
  from hauta_sessions
  where
    exists (
      select 1 from jsonb_array_elements(coalesce(data->'participants', '[]'::jsonb)) p
      where p->>'code' = p_code
    )
    or exists (
      select 1 from jsonb_array_elements(coalesce(data->'interviewerPanel'->'interviewers', '[]'::jsonb)) i
      where i->>'code' = p_code
    )
  limit 1;
  return result;
end;
$$;

grant execute on function hauta_get_session_by_code(text) to anon, authenticated;

-- Submit a participant's ranking by their code. Only ever touches
-- that one participant's entry — nothing else in the session.
create or replace function hauta_submit_ranking(p_code text, p_email text, p_ranking jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row hauta_sessions%rowtype;
  updated_participants jsonb;
begin
  select * into session_row
  from hauta_sessions
  where exists (
    select 1 from jsonb_array_elements(coalesce(data->'participants', '[]'::jsonb)) p
    where p->>'code' = p_code
  )
  limit 1;

  if not found then
    return false;
  end if;

  select jsonb_agg(
    case when p->>'code' = p_code
      then p
        || jsonb_build_object('email', p_email)
        || jsonb_build_object('ranking', p_ranking)
        || jsonb_build_object('status', 'submitted')
        || jsonb_build_object('submittedAt', (extract(epoch from now()) * 1000)::bigint)
      else p
    end
  )
  into updated_participants
  from jsonb_array_elements(session_row.data->'participants') p;

  update hauta_sessions
  set data = jsonb_set(data, '{participants}', updated_participants),
      updated_at = now()
  where id = session_row.id;

  return true;
end;
$$;

grant execute on function hauta_submit_ranking(text, text, jsonb) to anon, authenticated;

-- Submit an interviewer's candidate ratings by their code. Only
-- ever touches that one interviewer's entry.
create or replace function hauta_submit_evaluation(p_code text, p_ratings jsonb, p_total numeric)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row hauta_sessions%rowtype;
  updated_interviewers jsonb;
begin
  select * into session_row
  from hauta_sessions
  where exists (
    select 1 from jsonb_array_elements(coalesce(data->'interviewerPanel'->'interviewers', '[]'::jsonb)) i
    where i->>'code' = p_code
  )
  limit 1;

  if not found then
    return false;
  end if;

  select jsonb_agg(
    case when i->>'code' = p_code
      then i
        || jsonb_build_object('status', 'submitted')
        || jsonb_build_object('ratings', p_ratings)
        || jsonb_build_object('total', p_total)
        || jsonb_build_object('submittedAt', (extract(epoch from now()) * 1000)::bigint)
      else i
    end
  )
  into updated_interviewers
  from jsonb_array_elements(session_row.data->'interviewerPanel'->'interviewers') i;

  update hauta_sessions
  set data = jsonb_set(data, '{interviewerPanel,interviewers}', updated_interviewers),
      updated_at = now()
  where id = session_row.id;

  return true;
end;
$$;

grant execute on function hauta_submit_evaluation(text, jsonb, numeric) to anon, authenticated;
