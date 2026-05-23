# SmartStock — Supabase Setup (Plain-English Checklist)

You only need to do this **once**. It takes about 5 minutes. Follow the steps in order.

---

## Step 1 — Create a free Supabase project

1. Go to https://supabase.com and sign in (free tier is fine).
2. Click **New project**.
3. Give it a name (e.g. `smartstock`), set a database password (save it somewhere), pick the closest region, click **Create new project**.
4. Wait ~1 minute for it to finish provisioning.

---

## Step 2 — Find your Project URL and anon key

Inside your new Supabase project:

1. In the left sidebar click the **gear icon (Project Settings)**.
2. Click **API** (or **API Keys** on newer dashboards).
3. You will see two values you need to copy:
   - **Project URL** — looks like `https://abcdefghijk.supabase.co`
   - **anon public** key — a long string starting with `eyJ...`

> Do **not** copy the `service_role` key. Only `anon public`.

Keep this tab open — you'll paste these into Rork next.

---

## Step 3 — Add the keys to Rork

In Rork, open this project, then:

1. Click the **Secrets / Environment Variables** panel (left sidebar, key icon — sometimes labelled "Env" or "Variables").
2. Add (or update) these two **public** variables exactly as named:

| Variable name                    | Value to paste                |
| -------------------------------- | ----------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`       | Your Project URL from Step 2  |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`  | Your anon public key from Step 2 |

3. Save. Both must start with `EXPO_PUBLIC_` (already pre-filled if they were created before — just update the values).
4. **Restart the preview** (close the Expo Go preview and reopen it) so the new values are picked up.

> If you can't find the variables panel, ask Rork: "open env vars" — they live in the project sidebar.

---

## Step 4 — Create all the database tables

Back in the Supabase dashboard:

1. Left sidebar → **SQL Editor** → **New query**.
2. Open the file **`supabase-full-setup.sql`** from this repo.
3. Copy the **entire contents** and paste them into the SQL editor.
4. Click **Run** (bottom-right). Wait for "Success. No rows returned." (it usually finishes in a few seconds).

That single script creates every table, index, trigger, and security policy SmartStock needs. It is safe to re-run if anything goes wrong.

---

## Step 5 — Verify the tables exist

Still in Supabase:

1. Left sidebar → **Table Editor**.
2. You should see these 7 tables under the `public` schema:
   - `users`
   - `products`
   - `purchase_orders`
   - `order_items`
   - `stocktakes`
   - `stocktake_items`
   - `reorder_log`
3. Click any table → it should open with empty rows and the right column names. That confirms the schema is good.

Optional (paranoid check): SQL Editor → New query → run:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public';
```

Every row should show `rowsecurity = true`. That confirms data isolation between users is on.

---

## Step 6 — Test signup

In your SmartStock app preview:

1. Open the app — you should land on the **Sign In / Sign Up** screen.
2. Tap **Sign Up**, enter an email + password (real or fake — Supabase doesn't require email verification by default).
3. If signup succeeds you'll land on the main app screen with empty state.
4. Back in Supabase → **Authentication** → **Users**: you should see your new user.
5. Open **Table Editor → users**: you should also see one row with the same email (created automatically by the signup trigger).

If you see the user in both places — auth is wired correctly.

---

## Step 7 — Test CSV import

1. In SmartStock open **Setup Guide** (or wherever the "Import CSV" button lives).
2. Tap **Download sample template** and save the file.
3. Either use it as-is or paste a few of your own rows into it.
4. Tap **Import CSV** and pick the file.
5. You should see "Imported N products" toast/summary.
6. Back in Supabase → **Table Editor → products**: your rows should appear, each with your `user_id`.

If you see your products in the Supabase table — the full pipeline works.

---

## Common problems

| Symptom | Fix |
| --- | --- |
| "Supabase URL and Anon Key are required" | Step 3 was skipped or the preview wasn't restarted after saving the env vars. |
| "relation public.products does not exist" | Step 4 was skipped — run `supabase-full-setup.sql`. |
| "new row violates row-level security policy" | You're calling Supabase without being logged in. Sign up / sign in first. |
| Tables exist but signup user is not in `public.users` | Re-run `supabase-full-setup.sql` — the trigger ensures it. |
| Sample template button missing | You're on an older build — pull latest, the template lives in `csvImportService`. |

---

## What's still required from you (only these)

1. Create the Supabase project (Step 1).
2. Paste `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` into Rork (Step 3).
3. Run `supabase-full-setup.sql` once in the Supabase SQL editor (Step 4).
4. Restart the preview, sign up, and import a CSV (Steps 6–7).

Everything else (table creation, RLS, triggers, indexes, supplier_email support) is handled by the one SQL script.
