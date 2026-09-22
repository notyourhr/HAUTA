# Hauta TESTV2.0 USER — redeploy guide

This version adds real login and private, per-account scorecards. It changes
the database structure and how the app talks to it, so this is a full
redeploy across all three platforms — not just a file swap.

**Heads up:** this version can't be tested inside Claude chat like earlier
versions, since magic-link login needs a real website address to send you
back to. Testing only really works once it's deployed.

---

## Step 1 — Supabase: replace the database schema

1. Open your Supabase project → **SQL Editor**.
2. Open `supabase-schema.sql` (included in this package), copy the whole
   thing, paste it in, and click **Run**.
   - This **drops your old `hauta_sessions` table** and recreates it with
     the new structure (each session now belongs to a specific logged-in
     owner, has its own unique ID, and several sessions can exist side by
     side). Any old test data will be gone — expected, since the old
     structure can't hold ownership information anyway.
   - It also creates three small database functions that let participants
     and interviewers keep using their codes without ever logging in,
     while keeping the raw table itself locked to its owner only.

## Step 2 — Supabase: turn on email login

1. Go to **Authentication → Providers**, and make sure **Email** is enabled
   (it usually is by default — just confirm).
2. Go to **Authentication → URL Configuration**. This step matters — skipping
   it is the most common reason a magic link "doesn't work":
   - **Site URL**: set this to your deployed Vercel URL (e.g.
     `https://your-project.vercel.app`). If you don't have that URL yet,
     come back and set this after Step 4.
   - **Redirect URLs**: add that same URL here too (and `http://localhost:5173`
     if you ever want to run it on your own machine for testing).
3. That's it — no separate email service to configure. Supabase sends the
   login emails itself on the free tier.

## Step 3 — GitHub: replace the project files

Your existing repo needs several files added or replaced. Easiest way:
delete the old files in your repo and re-upload everything fresh from this
package (same drag-and-drop upload method as before), so you don't miss
anything.

Files in this package, and where they go in your repo:

```
your-repo/
├── index.html
├── vite.config.js
├── package.json
├── .gitignore
├── .env.example
├── supabase-schema.sql      (new — reference only, not used by the app itself)
├── README.md
└── src/
    ├── App.jsx              (fully rewritten)
    ├── main.jsx
    ├── index.css
    └── lib/
        └── hautaStorage.js  (fully rewritten)
```

Commit the changes once everything's uploaded.

## Step 4 — Vercel: redeploy

Your existing environment variables (`VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`) don't need to change — same project, same values.

1. Vercel should automatically start a new deployment as soon as it sees
   your GitHub commit. If it doesn't within a minute or two, go to your
   project in Vercel and manually trigger **Redeploy**.
2. Once it's live, copy the deployed URL and make sure it matches exactly
   what you set as the **Site URL** and **Redirect URL** back in Supabase
   (Step 2) — if you set those before you had the URL, go update them now.

## Step 5 — Try it

1. Open your deployed site. You should see a **"Log in to manage your
   scorecards"** box on the left instead of the old session banner.
2. Enter your email, click **Send link**, check your inbox, click the link.
   You should land back on the site logged in, with an empty **"Your
   scorecards"** list.
3. Click **New scorecard** and build one as usual — it'll now show up in
   your list, tied to your account.
4. The **"I have a code"** box on the right still works exactly as before,
   with no login required — that's unchanged for participants and
   interviewers.

## What changed under the hood (for your reference)

- Sessions are no longer a single global slot — each one is its own row,
  owned by whoever created it. Multiple people (or you, running several
  hiring cycles) can now have separate scorecards that never collide.
- The old **organizer code** is gone — logging in replaces it. Only you can
  see or open your own sessions.
- Participant and interviewer codes still work exactly as before, but now
  go through small, tightly-scoped database functions instead of open
  table access — so a code can only ever touch its own entry, nothing else
  in the session.
