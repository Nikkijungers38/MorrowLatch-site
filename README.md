# MorrowLatch AI — own website (off Polsia)

Built Nov 1, 2026, on Nikki's go: MorrowLatch moves off Polsia to her own
site, Luna-style (free hosting, no Polsia credits). The Polsia site stays
live until this one is deployed and ready.

## What it is

- `public/index.html` — public site. Same service copy and packages as the
  Polsia site (Foundation $1,200/mo, Operations $2,400/mo, Studio
  $4,800/mo), with three fixes from the Oct 28 review:
  1. The "launch pricing is an assumption" caveat is GONE.
  2. The inquiry form is at the TOP of the page (hero), not buried.
  3. It names the customer: small teams and local businesses.
- Inquiry form fields mirror the old Polsia form (what work repeats /
  desired result / current tools / approval needs) so it feels familiar.
- `public/admin.html` + `/admin` — HER admin dashboard, with the tools
  built in from day one: inquiry counts (Total / New / Reviewing /
  Follow up / Closed) and the full inquiry list with status dropdowns.
  Password sign-in (ADMIN_PASSWORD).
- `server.js` — Express. `POST /api/inquire` validates and saves to
  `data/inquiries.json`; if `RESEND_API_KEY` + `OWNER_EMAIL` are set it
  also emails each new inquiry to the owner (reply-to = the sender).

## Environment variables (set at deploy time)

- `ADMIN_PASSWORD` — her dashboard password (she chooses it; Secure Vault).
- `OWNER_EMAIL` — where inquiry emails go (her business email once
  jungersbusiness@gmail.com exists; Gmail works in the meantime).
- `RESEND_API_KEY` + `EMAIL_FROM` — same Resend setup Luna is waiting on;
  one Resend account can serve both apps.

## Deploy steps (later, with Nikki — her turns)

1. Create a GitHub repo (e.g. `MorrowLatch-site`) under Nikkijungers38 and
   push this folder (GitHub web commits, like Luna — never push the Luna
   clone; this is a new repo).
2. Render: New Web Service from that repo, start command `npm start`,
   free tier. Add the env vars above.
3. Smoke test: open the live URL, send one test inquiry, confirm it lands
   in `/admin` (and in her email once Resend is set).
4. Only then: point outreach/link traffic at the new address and let the
   Polsia site go.

## Notes

- Local store is a JSON file for v1. On Render's free tier the disk is
  ephemeral — inquiries emailed to the owner are the durable copy until
  this is moved to hosted Postgres like Luna. Do the email setup before
  announcing the link so no inquiry is ever only on the server disk.
- `data/` and `node_modules/` are git-ignored.
