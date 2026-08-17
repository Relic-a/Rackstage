# RackStage seller app

The seller app is an Expo Router app. It contains only publishable client configuration; Clerk secret keys, YouCam, Supabase service-role/database, and other secret credentials remain in the Next.js server.

## Local configuration

Run Expo from this directory (or set the variables in the shell that starts Expo):

```text
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=<publishable-key>
EXPO_PUBLIC_API_BASE_URL=http://<reachable-host>:3000
EXPO_PUBLIC_AUTH_REDIRECT_URL=rackstage://auth/callback # optional for native builds
```

When launched through the root `pnpm dev:mobile` script, the app can also use the root `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`; direct Expo launches should set the `EXPO_PUBLIC_` value explicitly. Never set the Clerk secret key, Supabase service key, database connection string, or `YOUCAM_API_KEY` in an Expo environment. During Expo Go development, an omitted `EXPO_PUBLIC_API_BASE_URL` automatically uses Metro's host computer on port 3000. Native preview and production builds must set a URL reachable from the device; do not use `localhost`.

Clerk's hosted Account Portal handles the enabled sign-in methods. By default the app generates a runtime-aware callback URL, so Expo Go returns to its Expo URL and installed builds return through the registered `rackstage` scheme. Set `EXPO_PUBLIC_AUTH_REDIRECT_URL` only when a deployment needs a fixed native callback. Rebuild native projects after changing the Clerk Expo config plugin or redirect settings.

## Server contract used by the app

- `POST /api/stores` with `{ name, slug, brand_color?, pickup_instructions? }` as JSON when no logo is selected, or the same fields plus a multipart `logo` JPG/PNG when the seller chooses one. The Clerk session token is sent as a Bearer token.
- `POST /api/items/create-draft` as multipart form data with `original`, `store_id`, and an idempotent `request_token` (the category/details can be filled in later). The server retains the original and starts background removal. Reusing the token must return the existing draft rather than creating another YouCam task.
- `GET /api/items/:itemId` for lightweight processing polling.
- `POST /api/items/:itemId/publish` with the final item details. The server publishes only after the catalog image is ready.

The app checks image file size before upload and sends `exif: false` from the camera. It does not perform camera quality scoring or infer seller-provided garment details.
