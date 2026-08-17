import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";
import QRCode from "qrcode";
import { SellerOnboarding } from "../../components/seller-onboarding";
import { SellerSettings } from "../../components/seller-settings";
import { ItemStatusActions } from "../../components/item-status-actions";
import { ensureClerkProfile } from "../../lib/clerk-server";
import { storesForUser } from "../../lib/seller";
import { catalogImageFor, findSellerItems, itemState } from "../../lib/supabase-server";
import { createCaptureToken } from "../../lib/capture-token";

export const dynamic = "force-dynamic";

export default async function SellerPage() {
  const { userId } = await auth();
  if (!userId) return <main className="seller-shell seller-welcome">
    <section><div className="eyebrow">Seller workspace</div><h1 className="display">Your store, from anywhere.</h1><p className="lede">Create your storefront, manage every one-of-one item, and turn any phone into your inventory camera. No app installation required.</p>
      <div className="welcome-actions"><SignUpButton mode="modal" forceRedirectUrl="/seller"><button className="button button-accent">Create your store</button></SignUpButton><SignInButton mode="modal" forceRedirectUrl="/seller"><button className="button button-quiet">Sign in</button></SignInButton></div>
      <p className="trust-line"><span>✓</span> Free to start <span>✓</span> Live in minutes <span>✓</span> Your existing mobile app still works</p>
    </section>
    <aside className="welcome-preview"><div className="preview-top"><span>Seller dashboard</span><i /></div><div className="preview-store"><small>Good morning</small><strong>North Loop Vintage</strong><p>12 live items · 2 reserved</p></div><div className="preview-cards"><div>QR<span>Scan to add</span></div><div>+<span>New garment</span></div></div></aside>
  </main>;
  await ensureClerkProfile(userId).catch(() => undefined);
  const stores = await storesForUser(userId).catch(() => []);
  const store = stores[0];
  if (!store) return <SellerOnboarding />;
  const items = await findSellerItems(store.id).catch(() => []);
  const imageEntries = await Promise.all(items.map(async (item) => [item.id, await catalogImageFor(item.id)] as const));
  const images = new Map(imageEntries);
  const requestHeaders = headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto") || (forwardedHost?.includes("localhost") ? "http" : "https");
  const site = (process.env.NEXT_PUBLIC_SITE_URL || (forwardedHost ? `${forwardedProtocol}://${forwardedHost}` : "https://rackstage.netlify.app")).replace(/\/$/, "");
  const captureUrl = `${site}/seller/capture/${createCaptureToken(store.id)}`;
  const qr = await QRCode.toDataURL(captureUrl, { width: 360, margin: 1, color: { dark: "#201e1b", light: "#fffdf9" }, errorCorrectionLevel: "M" });
  const live = items.filter((item) => item.status === "available").length;
  const reserved = items.filter((item) => item.status === "reserved").length;
  const drafts = items.filter((item) => item.status === "draft" || item.status === "processing").length;
  return <main className="seller-shell seller-dashboard">
    <section className="dashboard-head"><div><div className="eyebrow">Seller workspace</div><h1 className="display">{store.name}</h1><p>Your rack at a glance. Keep it fresh from this browser or the mobile app.</p></div><div className="dashboard-head-actions"><Link className="button button-quiet" href={`/store/${store.slug}`} target="_blank">View storefront ↗</Link><Link className="button button-accent" href="/seller/add">+ Add item</Link></div></section>
    <section className="metric-row"><div><strong>{live}</strong><span>Live items</span></div><div><strong>{reserved}</strong><span>Reserved</span></div><div><strong>{drafts}</strong><span>Needs attention</span></div><div><strong>{items.length}</strong><span>Total inventory</span></div></section>
    <section className="dashboard-grid">
      <div className="inventory-panel"><div className="panel-heading"><div><h2>Inventory</h2><p>Manage every item in one place.</p></div><Link href="/seller/add">Add garment →</Link></div>
        {items.length ? <div className="seller-inventory-list">{items.map((item) => <article className="seller-inventory-item" key={item.id}>
          <div className="seller-thumb">{images.get(item.id) ? <img src={images.get(item.id)!} alt="" /> : <span>{item.status === "processing" ? "Preparing…" : "No preview"}</span>}</div>
          <div className="seller-item-copy"><div><span className={`seller-status ${itemState(item)}`}>{item.status}</span><h3>{item.brand || item.category || "Untitled garment"}</h3><p>{[item.category, item.size, item.condition].filter(Boolean).join(" · ") || "Add item details"}</p></div><strong>{item.price != null ? `$${Number(item.price).toFixed(2)}` : "—"}</strong></div>
          <ItemStatusActions id={item.id} status={itemState(item)} />
        </article>)}</div> : <div className="seller-empty"><span>◇</span><h3>Your rack is ready.</h3><p>Add your first garment here, or scan the code from a phone.</p><Link className="button button-primary" href="/seller/add">Add first item</Link></div>}
      </div>
      <aside className="dashboard-side"><div className="qr-card"><div className="eyebrow">Use any phone</div><h2>Scan to add inventory</h2><p>Open the camera on any phone and point it here. This private link opens the camera for this store only—nothing to install or sign in to.</p><div className="qr-image"><img src={qr} alt="Private QR code that opens this store's add-item flow" /></div><small>Treat this code like a staff key. Each link expires after 30 days.</small></div><SellerSettings store={store} /></aside>
    </section>
  </main>;
}
