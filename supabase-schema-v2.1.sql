-- ============================================================
-- Hauta TESTV2.1 USER — additive migration
-- Run this in Supabase SQL Editor. This does NOT drop
-- hauta_sessions — your existing scorecards are safe.
--
-- This migration only updates hauta_submit_evaluation so it
-- can also store an interviewer's notes and whether they chose
-- to include them in the candidate report. The login-code
-- feature needs no database changes at all — it's a normal
-- Supabase email OTP, just with a template change (see the
-- redeploy notes for the exact step).
-- ============================================================

drop function if exists hauta_submit_evaluation(text, jsonb, numeric);

create or replace function hauta_submit_evaluation(
  p_code text,
  p_ratings jsonb,
  p_total numeric,
  p_notes text default '',
  p_include_notes boolean default false
)
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
        || jsonb_build_object('notes', p_notes)
        || jsonb_build_object('includeNotes', p_include_notes)
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

grant execute on function hauta_submit_evaluation(text, jsonb, numeric, text, boolean) to anon, authenticated;
