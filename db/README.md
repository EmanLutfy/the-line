# THE DRAW — database

## Setup

1. Create a project at supabase.com (free tier is enough).
2. Open **SQL Editor**, paste `schema.sql`, run it once.
3. Open **Project Settings → API** and copy:
   - Project URL
   - `service_role` key — **server only**. It bypasses row level security.
     Never put it in a `NEXT_PUBLIC_` variable and never ship it to the browser.
4. Put them in `.env.local` at the project root:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ADMIN_EXPORT_TOKEN=pick-a-long-random-string
```

`.env.local` is already covered by `.gitignore`. It must never be committed.

## Google Sheets mirror

Every entry is written to your sheet as soon as it is safely in Postgres. The
sheet is for reading by eye; Postgres remains the ledger, because a spreadsheet
has no unique constraints and no transactions — two people entering at the same
instant could both take the last GTD slot.

1. Create a Google Sheet.
2. Extensions → Apps Script. Paste `sheets-appscript.gs`, replace
   `SHARED_SECRET` with a long random string.
3. Deploy → New deployment → Web app. Execute as **Me**, access **Anyone**.
4. Put the Web app URL in `SHEETS_WEBHOOK_URL` and the same secret in
   `SHEETS_SHARED_SECRET`.

Columns: `created_at`, `result`, `wallet_address`, `twitter_handle`.

If a write to the sheet ever fails, the entry is still safe — rebuild the sheet
from the CSV export below.

## Reviewing winners by hand

The handle is typed in, never proved, so treat it as a claim. Before the mint,
check the GTD winners: does the account exist, does it follow you, does it look
real. Any that fail, clear their slot and redraw it:

```sql
-- release one slot back into the pool
begin;
delete from draw_entry
 where draw_id = 'the-line-draw-001' and wallet_address = '0x...';
update draw_config
   set gtd_remaining = gtd_remaining + 1, slots_remaining = slots_remaining + 1
 where draw_id = 'the-line-draw-001';
commit;
```

## Changing the pool sizes

Before the draw opens, in the SQL editor:

```sql
update draw_config
   set total_slots = 20000, slots_remaining = 20000,
       gtd_limit   = 500,   gtd_remaining   = 500,
       fcfs_limit  = 1500,  fcfs_remaining  = 1500
 where draw_id = 'the-line-draw-001';
```

Each `*_remaining` must start equal to its limit. Do not change these once
entries exist — the pools would no longer add up.

## Closing the draw early

```sql
update draw_config set status = 'closed' where draw_id = 'the-line-draw-001';
```

## Getting the winner list

Either export from the Supabase table editor, or:

```
curl -H "x-admin-token: $ADMIN_EXPORT_TOKEN" https://yoursite.com/api/wishlist/export > winners.csv
```

## Checking the numbers add up

```sql
select result, count(*) from draw_entry
 where draw_id = 'the-line-draw-001' group by result;
```

GTD must never exceed `gtd_limit`, FCFS never `fcfs_limit`.
