# RackStage

RackStage is a small hackathon MVP for thrift, vintage, and consignment stores:

`photograph → remove background → publish → virtual try-on → reserve`

The repository is a pnpm TypeScript monorepo:

- `apps/mobile` — Expo Router seller app (camera, onboarding, garment entry).
- `apps/web` — Next.js public storefront and server-side YouCam/Supabase routes.
- `packages/shared` — validation schemas, API contracts, category mappings, and
  inventory business rules.
- `supabase` — the Postgres migration, RLS policies, private storage buckets,
  and atomic reservation functions.

## Required configuration

Copy `.env.example` to `.env` and fill the values supplied for this workspace:

```text
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_DATABASE_CONNECTION_STRING=
YOUCAM_API_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

`SUPABASE_DATABASE_CONNECTION_STRING` is only needed by the Supabase CLI or a
direct migration tool; the running apps use Supabase for database/storage and
Clerk for web and mobile authentication. `NEXT_PUBLIC_SITE_URL` and
the `EXPO_PUBLIC_*` values are non-secret URL/client settings and are included
in `.env.example` for local development. Expo reads
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_BASE_URL`, and
`EXPO_PUBLIC_AUTH_REDIRECT_URL`; the root `pnpm dev:mobile` script can also
pass the web publishable key into Expo through `app.config.ts`.

Never put `SUPABASE_SECRET_KEY`, `SUPABASE_DATABASE_CONNECTION_STRING`, or
`YOUCAM_API_KEY` in `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, client-side code, logs,
screenshots, or API responses. `.env*` is ignored by Git except for the empty
`.env.example` template. Verify with `git check-ignore .env` before committing.

## Local setup

1. Install Node.js 22.13+, pnpm, the Expo CLI, and the Supabase CLI.
2. Run `pnpm install` from the repository root.
3. Copy and fill the environment file described above.
4. Start a local Supabase instance with `supabase start`, then apply both
   migrations with `supabase db push` (or run `0001_rackstage_initial.sql`
   followed by `0002_clerk_auth.sql` in the Supabase SQL editor). For a hosted project, link it first with
   `supabase link --project-ref <project-ref>`.
   If the hosted direct database hostname is unavailable on an IPv4-only
   network, use the **Session Pooler** connection string shown by Supabase
   Connect instead of the direct `db.<project-ref>.supabase.co` URL.
5. In separate terminals, start the web app and seller app with
   `pnpm dev:web` and `pnpm dev:mobile`. The root mobile script loads the root
   `.env` before starting Expo; if Expo is launched directly from
   `apps/mobile`, export the public variables in that shell or add an ignored
   `apps/mobile/.env` containing only the `EXPO_PUBLIC_*` values. For an
   Expo device, set
   `EXPO_PUBLIC_API_BASE_URL` to a LAN-reachable Next.js URL rather than
   `localhost`, and set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (or use the
   root `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` fallback) for the seller app.
6. In Clerk, enable the sign-in methods you want to offer and add the local
   development origin when prompted. The Next.js app loads
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in the browser and keeps
   `CLERK_SECRET_KEY` server-only. The Expo seller app uses the same Clerk
   identity and sends its short-lived Clerk session token to the Next.js API.

## Deploy the web app to Netlify

The repository includes a root `netlify.toml` for the pnpm monorepo. It builds
only `apps/web`, publishes the Next.js output, uses Node 22, and enables the
pnpm hoisting mode required by Netlify's Next.js runtime.

1. Import the GitHub repository in Netlify. If Netlify asks which monorepo app
   to deploy, choose `apps/web`. Leave the base directory unset so dependency
   installation and the build run from the repository root.
2. Keep the build command and publish directory from `netlify.toml`:

   ```text
   pnpm --filter @rackstage/web build
   apps/web/.next
   ```

3. Add these production environment variables in **Project configuration >
   Environment variables**. Never commit their values:

   ```text
   SUPABASE_URL
   SUPABASE_PUBLISHABLE_KEY
   SUPABASE_SECRET_KEY
   YOUCAM_API_KEY
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
   CLERK_SECRET_KEY
   NEXT_PUBLIC_SITE_URL
   ```

   Do not configure `E2E_TEST_USER_ID` in Netlify. The database connection
   string is only needed when applying migrations and is not required by the
   deployed app.
4. For the first deploy, set `NEXT_PUBLIC_SITE_URL` to the Netlify production
   URL, for example `https://rackstage.netlify.app`. If Netlify assigns the URL
   after the first build, add it then and trigger one more production deploy.
5. Add the Netlify production origin and the mobile callback URL to the Clerk
   application's allowed URLs. Keep the Clerk secret server-only.
6. Point the Expo app at the deployed API before producing a mobile build:

   ```text
   EXPO_PUBLIC_API_BASE_URL=https://rackstage.netlify.app
   ```

Apply `supabase/migrations/0001_rackstage_initial.sql` followed by
`supabase/migrations/0002_clerk_auth.sql` to the hosted Supabase project before
testing store creation. The free Netlify subdomain is sufficient; changing to
a custom domain later only requires updating `NEXT_PUBLIC_SITE_URL`, Clerk's
allowed URLs, and the Expo API base URL.

The migration creates `profiles`, `stores`, `items`, `item_images`,
`processing_jobs`, `try_on_sessions`, and `reservations`. Inventory is one per
item. Create-draft accepts a nullable `client_request_token` UUID; when the
seller client supplies it, repeated taps return the existing draft instead of
starting another background-removal job. The `reserve_item` RPC locks the item
update and inserts the reservation atomically, uses a request token for
idempotency, and accepts a reservation window of up to 48 hours. Call
`release_expired_reservations()` from a trusted route before storefront
reads/reservations (or schedule that function with Supabase Cron) to return
expired items to `available`.
Call `cleanup_expired_try_ons()` from a trusted try-on poller or scheduled
server/Edge function; delete each returned path through the Supabase Storage
API, clear the session paths, and let a later call remove old expired markers.

## Demo path

1. Open the Expo seller app and continue through Clerk's hosted sign-in flow.
2. Enter a store name, accept or edit the suggested slug, and optionally add a
   logo, brand color, and pickup instructions. Open the generated public store
   link/QR code.
3. Choose **Add garment**, photograph one complete garment against an evenly
   lit background, and retake if needed. Keep hands and other garments out of
   frame.
4. The original image is retained while the server starts YouCam background
   removal. Complete category, size, brand, condition, price, and optional notes
   while the job runs. The item stays a draft/processing record until the
   catalog image is ready.
5. Publish the item and open its public item page. The storefront shows the
   item as Available.
6. As a shopper, open the item page, choose **Virtual try-on**, and upload or
   take a suitable single-person, upright, forward-facing photo. The server
   validates JPG/PNG type, dimensions, and the 10 MB limit before using API
   units, uploads both files to YouCam, creates a V3 task, polls it, and stores
   the result in private RackStage storage before showing it.
7. Use **Reserve for pickup** and enter a name/contact. The atomic reservation
   changes the exact item to Reserved; refresh the storefront to see the state.

## YouCam integration notes

All YouCam requests run in trusted server code with the secret key. The V3 flow
uses the documented endpoints:

```text
POST /s2s/v2.0/file/cloth-v3
PUT  returned presigned upload URL
POST /s2s/v2.0/task/cloth-v3
GET  /s2s/v2.0/task/cloth-v3/{task_id}
```

The lower-body experiment in `youcam-lowerbody-test/` used the same upload/task
shape and successfully applied a standalone trousers image once. That is a
useful compatibility signal, not a guarantee: current documentation says
standalone lower-body product references are unsupported and recommends an
actual worn outfit. RackStage therefore keeps the original seller image and
surfaces a clear retry path for category/reference errors. The implementation
does not claim that virtual try-on predicts physical fit; it is a visual style
preview.

Provider errors are translated to safe messages for invalid poses or garment
references, source/garment region mismatch, unsupported/oversized images,
download failures, NSFW rejection, processing failures, rate limits, and
insufficient API units. Provider authorization headers and raw response bodies
must never be logged or returned.

The provider result URL may be temporary, so successful results are copied to
the private `private-buyer` bucket. No provider deletion endpoint is assumed;
the trusted `cleanup_expired_try_ons()` RPC marks expired sessions and returns
the private paths for the server to delete through the Supabase Storage API.
After deletion, clear those paths so old marker rows can be removed. Call the
RPC opportunistically from try-on polling/reservation routes or schedule a
trusted server/Edge cleanup with Supabase Cron. Buyer photos and results never
appear in public catalog queries or public storage URLs.

## Privacy and scope

Catalog and buyer buckets are private. Anonymous clients can read only the
column-safe public storefront views for public stores, published (`available`,
`reserved`, or `sold`) items, and catalog-image metadata; base-table anonymous
reads and all sensitive writes are blocked. Original garment photos are
seller-owned data. Shopper uploads are temporary and have metadata minimized
where the runtime supports it; Expo capture disables EXIF for seller photos.
The server deletes shopper sources/results after try-on expiry or a failed task
through the Storage API cleanup path. Do not use real sensitive customer photos
in a hackathon demo.

The MVP intentionally excludes payments, shipping, carts, returns, reviews,
recommendations, custom domains, employee roles, quantity > 1, camera
intelligence, generated descriptions, and a native shopper app.

## Checks

Run the shared contract tests and type checks with:

```bash
pnpm test
pnpm typecheck
```

Run the complete live API suite with configured provider keys using:

```bash
pnpm test:e2e:live
```

The live suite starts the web app on loopback, uses a generated local-only test
identity (never enabled in production), exercises every application route plus
Clerk, Supabase, and YouCam, and removes its database and storage fixtures.

The first live demo should be exercised with a real YouCam key and a real
Supabase project; development-only mocks, if enabled locally, must be explicit
and disabled for the demonstrated path.
