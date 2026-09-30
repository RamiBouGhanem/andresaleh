# Andre Saleh Coach + Physio Platform — v6.1.0

A React / Express website with SQLite storage, member accounts, a coach dashboard,
program delivery, weekly check-ins, private messages, transformation publishing and
physiotherapy appointment requests. Node.js 22.5 through 24 is supported.

## Start in VS Code

1. Use Node.js 22.5 or newer (your Node.js 22.12.0 is supported).
2. Extract the project and open its folder in VS Code.
3. Run `npm install`, then `npm run dev`.
4. Open http://127.0.0.1:5173 exactly. Stop any older server using that port first.

The dev command starts the API and frontend together. No separate database install
is needed. Local SQLite data is created in `data/coach.sqlite`.

- Website: `/`
- Members (register / sign in): `/member`
- Coach dashboard: `/admin`
- Local demo admin email: `coach@demo.com`
- Local demo admin password: `CoachDemo2026!`

There are no pre-created member accounts. Register one through the website to test.
Admin fields are deliberately not prefilled. You can set different admin credentials
in a local `.env` file copied from `.env.example`. Never commit `.env`.

## Upgrade without losing your programs

Stop the old server first. Back up your old `data` folder before changing files.
Extract the new code into a separate directory, then copy your old `data` folder into
that directory BEFORE starting the new server. Do not replace it with an empty folder.
The archive intentionally contains no customer database or test accounts.

On the first run, if there is no SQLite database, the app imports the old
`data/store.json` automatically. Program definitions, orders, leads and view counts
are preserved. The original JSON is left untouched. Old sample clients are retained
as `legacyClients` in the stored document; they are not treated as member accounts.
Members register normally and the coach assigns their programs. Legacy orders are
not automatically attached to accounts simply by matching an unverified email.

If `data/coach.sqlite` already exists, it is used without re-importing JSON. For a
legacy JSON file at another location, set `LEGACY_DATA_FILE` to its absolute path.

## What the coach can do

### Programs

Add, edit, publish or hide programs. Enter member-only instructions in the program
editor (workouts, sets/reps, nutrition guidance, resource references). Those instructions
are excluded from the public API and are available only to assigned members.
Programs appear in a horizontal carousel. Phones use native touch swiping with a
next-card preview, navigation dots and arrow controls.
A program already assigned to a member cannot be deleted; hide it by choosing Draft.

### Members

Members appear automatically after registration. Select a member to:
- Read check-in history and session completion.
- Reply to a check-in or send a private message.
- Grant or revoke program access.
- Deactivate/reactivate an account.
- Generate a private, one-use password-reset link (valid for 30 minutes).

Verify the member's identity and share reset links through your established private
contact channel. The app does not send recovery email automatically. Members can
also change their passwords from Account. Deactivation and password resets revoke
old sessions. Messages refresh every 30 seconds in the member area; admin has Refresh.

### Orders

Members can request programs. Prices are read from the server, not accepted from
the browser. Actual revenue metrics derive from orders marked Paid; visit counts
are page views, not unique-person analytics.

### Online payments (Visa / card) and cash

Both programs and post-rehab sessions offer two payment paths: hosted card checkout and a cash request to the coach. Card numbers never pass through this application. A program unlocks only after the server verifies payment with the provider. A paid session creates a request; the coach confirms its appointment time separately.

The implemented card processor is Stripe. This package is not connected to a live merchant account and contains no payment credentials. Card availability is determined by the backend configuration, not a frontend toggle.

To connect card payments:

1. Use the coach's approved Stripe merchant account and begin in test mode
2. Set `STRIPE_SECRET_KEY` in the hosting environment — never in frontend code
3. Set `APP_ORIGIN` to the site's public HTTPS origin
4. Add `https://YOUR_DOMAIN/api/webhooks/stripe` as a Stripe webhook endpoint for `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`
5. Set the endpoint signing secret as `STRIPE_WEBHOOK_SECRET`, then restart/redeploy
6. Test a successful and cancelled checkout and confirm the order history and access before switching to live credentials

Official setup references: https://docs.stripe.com/payments/checkout/quickstarts and https://docs.stripe.com/webhooks

Cash requests are tied to the signed-in member and priced from the server catalog. They remain pending until an authenticated coach confirms receipt in Admin → Orders. Online orders cannot be manually marked paid. The monitor records payment attempts, verification and access delivery.

The customer interface presents one card path. The currently implemented processor is Stripe; a different merchant gateway requires its official API contract and a verified adapter. There is no separate Whish customer option or simulated payment success.

### Transformation stories

The three demo transformation cards include emotional example quotes and stories in a white and blue popup. A message icon on each photo opens it; Escape, the close button or the backdrop closes it. Each is explicitly labeled as an example, not client feedback. Replace these with the clients' own approved words using Admin → Transformations. Publishing a real transformation requires feedback, photos and recorded consent.

### Physiotherapy

Three editable example services are included: assessment, follow-up and return-to-sport
consultation. Adjust session names, durations, descriptions and prices before launch.
Members request a future date/time and can cancel requested/confirmed appointments.
The coach confirms, completes or cancels requests. Confirming overlapping appointments
is blocked. Times are stored in UTC and shown in each device's local time zone.
This is an appointment-request system, not automatic real-time availability booking,
a clinical record system or a diagnosis tool.

### Transformations / The Shift

Create a story, add actual before/after JPEG, PNG or WebP images (max 2 MB each),
record the client's permission and publish. Drafts are admin-only. Publication requires
both photos and permission. Unpublish or delete to remove a story from the website.
Photos are stored in the database. No fabricated transformation photos are included.

## Render deployment (persistent database)

Use a Render **Web Service**, not a Static Site. The included `render.yaml` uses a
paid Starter service and a 1 GB persistent disk mounted at `/var/data`. Review Render's
current price before deploying. No hosting service was purchased or deployed for you.

1. Push the source to your GitHub repository (exclude data, .env and node_modules).
2. Create a Render Blueprint from the repository.
3. Set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of at least 12 characters.
4. The blueprint sets Node 24, NODE_ENV=production and DATA_DIR=/var/data.
5. Build: `npm ci && npm run build`. Start: `npm start`.
6. After adding your domain, use its HTTPS address for the public site and admin.

Production startup refuses the demo password or missing admin credentials. HTTPS
is required because production session cookies are Secure. If needed for a proxy,
set APP_ORIGIN to the exact website origin (no trailing slash).

SQLite is appropriate for one small coaching business with a single server instance.
Keep this deployment single-instance. Horizontal scaling would require migrating to
an external database such as Postgres. A free service without persistent storage will
lose local data; do not use it for customer accounts.

To migrate local data to Render, use a database backup and transfer it privately to
the disk as coach.sqlite before starting the service. Do not put customer data in Git.

## Backup / restore

`npm run backup` creates a consistent SQLite snapshot in `backups/`. Set BACKUP_DIR
to change the destination. Transfer backups to a separate protected location; a
backup on the same disk alone does not protect against disk loss. Schedule the
command in your hosting operations if you need automatic backups.

To restore: stop the service, preserve the existing database and any WAL/SHM files
as a backup, remove those old files from the active data directory, and copy a
snapshot there as `coach.sqlite`. Restart and verify member/admin access. Do not
replace a live database file while the server is running.

Instagram buttons link to https://www.instagram.com/andresaleh10/. This is a profile link, not an authenticated feed or posting integration.

## Photography

The demo uses real free stock photography from Pexels and Unsplash. Replace these
files with Andre's approved photographs before launch while keeping the same names:
`real-coach.webp`, `real-coaching.webp`, `real-physio.webp` and
`stock-training.webp`.

## Branding and content

- `src/config.js`: name, social links and contact information; initial program seed.
- Admin Programs: program edits after the first database initialization.
- Admin Physiotherapy: session types, prices and visibility.
- Admin Transformations: before/after content.
- `public/images/`: replaceable demo photography.
- `index.html`: title and description.

Replace the fictional coach, example pricing and sample testimonials with approved
client content. The public testimonials are explicitly labeled as sample feedback.

## Validation and boundaries

`npm test` checks authentication, role isolation, assigned content, check-ins,
messages, server-controlled prices, booking conflicts, transformation consent,
database/session persistence after restart, password-reset reuse and deactivation.
`npm run build` produces the production frontend. Production preview: `npm start`.

Implemented account security includes scrypt password hashes, hashed server-side
session tokens, HttpOnly/SameSite cookies, production Secure cookies, API access
checks, input validation and basic authentication throttling. Keep the host and
backups protected; SQLite is not encrypted at rest by this application.

Online card processing, subscriptions, automated email/SMS, calendar sync, video
calls and insurance/clinical workflows are not integrated. They require separate
provider setup and implementation. Do not describe those as included live services
in a client quotation. Before handling real client health information, agree the
privacy/retention policy, appropriate consent and operational access arrangements.

## Design and motion

Scroll reveals, card hover feedback, horizontal carousels and member-area entrance
transitions are included. No automatic carousel rotation interrupts reading. Reduced
motion preferences disable animation and smooth scrolling.


## v6.0.0 presentation

The mobile hero uses a full-height gym photo with overlaid text and visible contact buttons. The header remains in document flow. Program photos use native image elements and deliberate framing. The name mark has its own two-line layout, and the coach profile displays eight years of coaching.

Carousels show a next-card preview, navigation arrows, progress dots and one subtle movement cue when they enter view. The cue stops on interaction and respects reduced-motion settings. Physiotherapy uses a photo overview followed by three clearly numbered service cards.

Three fictional transformation diptychs are included as clearly labeled demos. They are replaced automatically by approved, published transformations from the admin area. Inter and Barlow Condensed fonts are bundled locally; the front page has no external image or font dependency.

Contact links: WhatsApp +961 70 439 225 and Instagram @andresaleh10. Change these in src/config.js.

The archive includes a production build in dist/. Run npm install and npm start to present the complete platform. Use npm run dev for editing.


## v6.1.0 compact mobile browsing
Homepage headings are compact on mobile. Swipe dots and the movement cue remain; mobile arrow buttons are hidden. The physiotherapy photo opens /physiotherapy, where sessions can be requested and rehabilitation programs discussed. Successful member sign-in returns physiotherapy visitors to that page. The floating contact button now contains WhatsApp only; Instagram remains in the coach section and footer. The experience image uses the included coaching-action photo.

## Weekly support and client feedback
Template programs include a weekly coach meeting rather than coached sessions for every workout. Set the total eight-week USD prices in Programs before accepting purchases; unset prices show as pending and payment actions stay disabled.

Post-rehab sessions use the same verified online payment or pending cash request flow. After payment, a session request is created and the coach confirms the appointment time separately. Cash session requests appear in Orders with the preferred time and note.

Transformation cards show a short client quote and an optional expandable story. The admin editor stores both, and new publication requires client feedback, photos and recorded permission. Use the client’s own approved words.

## Temporary pricing and payment monitoring
Standard eight-week programs currently cost USD 120; Prenatal Home costs USD 140. These are temporary owner-approved setup values, not market estimates. Change them from Admin → Programs. A one-time upgrade fills zero prices in the existing catalog and preserves nonzero prices and existing order totals.

Admin → Orders shows collected totals, pending cash and online payments, status/method filters, order and provider references, and a timestamped payment timeline. The page refreshes every 15 seconds. Pending online orders can be checked against the payment provider; this action cannot override an unverified payment. Cash confirmation records the coach action before fulfillment. Checkout creation, verification, failure, cancellation and delivery are recorded for new transactions. Historical orders remain available without invented earlier events.

Visa/card checkout requires Stripe credentials and the signed webhook endpoint. A different card gateway requires its verified merchant integration. No real payment is simulated by this package.
