-- Bot eventi (Edge Function events-bot, vedi supabase/functions/events-bot):
-- colonne di servizio su public.events, registro dei giri, archiviazione
-- degli eventi del bot finiti da tempo e pianificazione notturna con
-- pg_cron + pg_net (una categoria per giro, a 10 minuti di distanza, così
-- ogni chiamata resta ben sotto il limite di durata delle Edge Function).

-- Tipi di evento: oltre a quelli del cosplay servono quelli delle altre
-- categorie che mostrano eventi (teatro, mostre, concerti, tornei).
alter table public.events drop constraint if exists events_tipo_check;
alter table public.events add constraint events_tipo_check check (
  tipo is null or tipo = any (array[
    'fiera', 'gara', 'raduno', 'shooting', 'workshop', 'altro',
    'spettacolo', 'mostra', 'concerto', 'festival', 'torneo'
  ])
);

-- Chiave di deduplica del bot (mondo|categoria|titolo|anno|città
-- normalizzati) e data dell'ultima verifica.
alter table public.events add column if not exists bot_key text;
alter table public.events add column if not exists bot_checked_at timestamptz;
create unique index if not exists events_bot_key_idx on public.events (bot_key) where bot_key is not null;

-- Registro dei giri: lo legge la scheda "Bot eventi" del pannello Backend.
create table if not exists public.events_bot_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  avviato_da text not null default 'cron',
  categoria text,
  inseriti integer not null default 0,
  aggiornati integer not null default 0,
  scartati integer not null default 0,
  archiviati integer not null default 0,
  errore text,
  dettaglio jsonb
);
create index if not exists events_bot_runs_started_idx on public.events_bot_runs (started_at desc);
alter table public.events_bot_runs enable row level security;
drop policy if exists events_bot_runs_select_staff on public.events_bot_runs;
create policy events_bot_runs_select_staff on public.events_bot_runs
  for select using (public.is_owner_or_moderator((select auth.uid())));
-- Scrive solo la Edge Function con la service role: nessuna policy di insert/update.

-- Archivia (deleted_at) gli eventi del bot finiti da più di p_days giorni.
-- Solo quelli del bot: gli eventi curati a mano o degli utenti non si toccano.
create or replace function public.events_bot_housekeeping(p_days integer default 60)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n integer;
begin
  update public.events
     set deleted_at = now()
   where fonte = 'bot'
     and deleted_at is null
     and coalesce(data_fine, data_evento + interval '1 day') < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.events_bot_housekeeping(integer) from public, anon, authenticated;

-- Pianificazione: una chiamata per categoria, ogni notte. La chiave anon è
-- pubblica (è nel bundle del sito): la funzione stessa rifiuta i giri
-- anonimi troppo ravvicinati (vedi MIN_HOURS_BETWEEN_RUNS).
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_url text := 'https://bxcwwtydlaodntvilhik.supabase.co/functions/v1/events-bot';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4Y3d3dHlkbGFvZG50dmlsaGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MTU5NzQsImV4cCI6MjEwNTE5MTk3NH0.XJwgOKIkcAwoMaQdaQQacTQ5wdokzQAEkkZ5H4Ba7iQ';
  v_cat text;
  v_min integer := 10;
  r record;
begin
  for r in select jobid, jobname from cron.job where jobname like 'events-bot-%' loop
    perform cron.unschedule(r.jobid);
  end loop;
  foreach v_cat in array array['cosplay', 'nerd-live', 'teatro', 'arti-visive', 'live'] loop
    perform cron.schedule(
      'events-bot-' || v_cat,
      v_min::text || ' 4 * * *',
      format(
        $job$select net.http_post(
          url := %L,
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || %L),
          body := jsonb_build_object('categoria', %L),
          timeout_milliseconds := 150000
        );$job$,
        v_url, v_anon, v_cat
      )
    );
    v_min := v_min + 10;
  end loop;
end $$;
