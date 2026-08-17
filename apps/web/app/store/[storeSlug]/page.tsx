import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { catalogImageFor, findPublicItems, findStoreBySlug, itemState, storageBucket, storageSign } from "../../../lib/supabase-server";
import type { StoreRecord } from "../../../lib/types";

export const dynamic = "force-dynamic";

async function logoFor(store: StoreRecord) {
  if (!store.logo_path) return null;
  if (/^https?:\/\//i.test(store.logo_path)) return store.logo_path;
  return storageSign(storageBucket("catalog"), store.logo_path, 900).catch(() => null);
}

export async function generateMetadata({ params }: { params: { storeSlug: string } }): Promise<Metadata> {
  const store = await findStoreBySlug(params.storeSlug).catch(() => null);
  if (!store) return { title: "Store not found — RackStage" };
  const description = `One-of-one pieces from ${store.name}. Visual try-on and pickup reservation on RackStage.`;
  const logo = await logoFor(store);
  return { title: `${store.name} — RackStage`, description, openGraph: { title: store.name, description, images: logo ? [{ url: logo }] : undefined } };
}

export default async function StorePage({ params }: { params: { storeSlug: string } }) {
  const store = await findStoreBySlug(params.storeSlug).catch(() => null);
  if (!store) notFound();
  const items = await findPublicItems(store.id).catch(() => []);
  const imageEntries = await Promise.all(items.map(async (item) => [item.id, await catalogImageFor(item.id)] as const));
  const imageById = new Map(imageEntries);
  const logo = await logoFor(store);
  const color = store.brand_color && /^#[0-9a-f]{6}$/i.test(store.brand_color) ? store.brand_color : "#e26b45";
  return <>
    <header className="topbar"><div className="shell topbar-inner"><Link className="wordmark" href="/"><span className="wordmark-mark" style={{ backgroundColor: color }}>R</span><span>RackStage</span></Link><span className="soft-link">One-of-one, online</span></div></header>
    <main className="shell" style={{ ["--accent" as string]: color } as CSSProperties}>
      <section className="store-head">
        <div><div className="eyebrow">Independent vintage</div><h1 className="display">{store.name}</h1><p className="store-meta">{store.pickup_instructions || "Browse the current rack. Every piece is one of one and available for pickup."}</p></div>
        <div className="store-logo" aria-label={store.name}>{logo ? <img src={logo} alt="" /> : store.name.slice(0, 1).toUpperCase()}</div>
      </section>
      <div className="inventory-bar"><span className="inventory-count">{items.length} {items.length === 1 ? "piece" : "pieces"} on the rack</span><span>Updated as items move</span></div>
      {items.length === 0 ? <div className="empty"><h2 className="display">The rack is between drops.</h2><p>Check back soon for the next one-of-one piece.</p></div> : <section className="item-grid" aria-label={`${store.name} inventory`}>{items.map((item) => {
        const state = itemState(item); const image = imageById.get(item.id) ?? null; const label = state === "available" ? "Available" : state === "reserved" ? "Reserved" : "Sold";
        return <Link className="item-card" href={`/store/${store.slug}/item/${item.id}`} key={item.id}>
          <div className="item-image">{image ? <img src={image} alt={`${item.brand || "Vintage"} ${item.category}`} /> : <div className="image-fallback">Image coming soon</div>}</div>
          <div className="item-card-body"><div className="item-card-kicker">{item.category || "Garment"} · {item.size || "One size"}</div><div className="item-card-title">{item.brand || "Unlabeled vintage"}</div><div className="item-card-bottom"><span className="price">${Number(item.price || 0).toFixed(2)}</span><span className={`status-pill ${state}`}>{label}</span></div></div>
        </Link>;
      })}</section>}
    </main>
    <footer className="footer"><div className="shell">Visual try-on is a style preview, not a fit guarantee.</div></footer>
  </>;
}
