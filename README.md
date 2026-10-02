# Hauta TESTV2.1 USER — what's new and how to redeploy

## What changed
- **Login codes.** Every "send link" email now also carries a typeable code —
  click the link or type the code, either one logs you in. No database
  changes needed for this, just one small email-template edit (Step 2 below).
- **2 scorecards per account.** Once you have 2 saved, "New scorecard" is
  replaced with a note to delete one first.
- **Numbered competency placeholders.** The first three boxes show real
  examples; from the 4th box on, the placeholder just shows "Competency #4",
  "#5", and so on.
- **Flag threshold explanation**, right under the threshold control.
- **A second way to override a weight**: besides the raw-points override,
  you can now type the exact final percentage (out of 100) you want a
  competency pinned at — every other competency rescales to fill what's left.
- **Interview notes** on the candidate-rating screen, with a checkbox to
  include them in the candidate's report (or keep them private to you).
- **Competency colors on the ranking screen** — each competency keeps its
  own color as you reorder it; the number next to it still reflects its
  current rank, exactly as before.

## Step 1 — Database: run the small migration

In Supabase → SQL Editor, run `supabase-schema-v2.1.sql` from this package.

**This one is additive — it does NOT touch your existing scorecards or the
hauta_sessions table.** It only updates one function so it can also store
interview notes.

## Step 2 — Required: add the login code to your email template

This is the one manual step that makes the "login code" feature actually
show up — without it, the code is generated but never displayed anywhere.

1. In Supabase, go to **Authentication → Email Templates → Magic Link**.
2. Find the line with `{{ .ConfirmationURL }}` (the clickable link).
3. Add this somewhere below it in the template:
   ```
   Or enter this code: {{ .Token }}
   ```
4. Save.

## Step 3 — GitHub: replace your files

Replace at least these files in your repo (or re-upload everything from
this package to be safe):
```
src/App.jsx
src/lib/hautaStorage.js
supabase-schema-v2.1.sql   (reference only — already run in Step 1)
README.md
```

## Step 4 — Vercel

No new environment variables needed. Vercel should redeploy automatically
once it sees your GitHub commit; if not, trigger Redeploy manually.

## Step 5 — Test it

1. Log out, then log back in with your email — confirm the new email
   contains both a link and a code, and that typing the code logs you in.
2. Confirm "New scorecard" disables itself once you have 2 saved.
3. Open a scorecard's weighted results and try the new "total points"
   override on one row.
4. Rate a candidate, add interview notes, try both with and without the
   "include in report" checkbox ticked, and confirm the notes show up (or
   don't) on the result screen and in the combined interviewer view.
