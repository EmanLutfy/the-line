-- THE LINE — WISHLIST
-- Run once in the Supabase SQL editor.

create table if not exists wishlist_config (
  draw_id text primary key,
  status  text not null default 'open'
);

create table if not exists wishlist_entry (
  id             bigserial   primary key,   -- join order, and so the list position
  draw_id        text        not null references wishlist_config(draw_id),
  wallet_address text        not null,
  twitter_handle text        not null,
  ip_hash        text,
  created_at     timestamptz not null default now(),
  -- The real guarantee. Application code can have bugs; the database cannot
  -- let the same wallet on the list twice.
  unique (draw_id, wallet_address)
);

-- Indexed, deliberately not unique. A handle is typed in, never proved, so a
-- unique constraint would let anyone lock a real person out by registering
-- their handle first. Duplicates are caught in review instead.
create index if not exists wishlist_twitter_idx on wishlist_entry (draw_id, twitter_handle);

insert into wishlist_config (draw_id, status)
values ('the-line-wishlist-001', 'open')
on conflict (draw_id) do nothing;

-- No browser talks to these tables; only the server, with the service role key.
-- RLS on with no policies denies everyone else by default.
alter table wishlist_config enable row level security;
alter table wishlist_entry  enable row level security;
