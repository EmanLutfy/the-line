-- Run ONCE if you already created the waitlist_* tables. On a fresh database,
-- schema.sql alone is enough and this file does nothing useful.

alter table if exists waitlist_config rename to wishlist_config;
alter table if exists waitlist_entry  rename to wishlist_entry;
alter index if exists waitlist_twitter_idx rename to wishlist_twitter_idx;

-- The id is stored on every row, so both tables move together.
update wishlist_config set draw_id = 'the-line-wishlist-001' where draw_id = 'the-line-waitlist-001';
update wishlist_entry  set draw_id = 'the-line-wishlist-001' where draw_id = 'the-line-waitlist-001';
