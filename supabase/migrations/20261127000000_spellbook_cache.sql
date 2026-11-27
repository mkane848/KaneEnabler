-- Shared, persistent cache for Commander Spellbook lookups
-- (docs/api-policy.md "Known violations" #2, docs/KimiAudit.md W9).
--
-- The recommender server used to cache answers in one process's memory, so
-- every restart — and every other instance — asked Spellbook again. This
-- table lets one answer serve every user until it expires.
--
-- Written and read only by the server, with the service-role key. RLS is on
-- with no policies, so the anon and authenticated roles the browser apps use
-- can neither read nor write it.

create table if not exists public.spellbook_cache (
  -- SHA-256 of the server's cache key (sorted commander and card names), so
  -- the table holds no deck contents in the clear.
  key text primary key,
  value jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.spellbook_cache enable row level security;

-- Expired rows are pruned by fetched_at on each write.
create index if not exists spellbook_cache_fetched_at_idx on public.spellbook_cache (fetched_at);
