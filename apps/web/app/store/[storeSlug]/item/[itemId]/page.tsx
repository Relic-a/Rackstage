import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { catalogImageFor, findPublicItem, findStoreBySlug, itemState } from "../../../../../lib/supabase-server";
import { ItemActions } from "../../../../../components/item-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { storeSlug: string; itemId: string } }): Promise<Metadata> {
  const item = await findPublicItem(params.itemId).catch(() => null);
  const store = await findStoreBySlug(params.storeSlug).catch(() => null);
  if (!item || !store) return { title: "Piece not found — RackStage" };
  const title = `${item.brand || "Vintage piece"} ${item.category || "garment"} — ${store.name}`;
  const image = await catalogImageFor(item.id);
  return { title, description: `${item.size || "One size"} · ${item.condition || "Pre-owned"} · Visual try-on available on RackStage.`, openGraph: { title, images: image ? [{ url: image }] : undefined } };
}

export default async function ItemPage({ params }: { params: { storeSlug: string; itemId: string } }) {
  const [item, store] = await Promise.all([findPublicItem(params.itemId).catch(() => null), findStoreBySlug(params.storeSlug).catch(() => null)]);
  if (!item || !store || item.store_id !== store.id) notFound();
  const image = await catalogImageFor(item.id);
  const state = itemState(item);
  return <>
    <header className="topbar"><div className="shell topbar-inner"><Link className="wordmark" href="/"><span className="wordmark-mark">R</span><span>RackStage</span></Link><Link className="soft-link" href={`/store/${store.slug}`}>← Back to {store.name}</Link></div></header>
    <main className="shell"><div className="item-layout"><div className="item-hero-image">{image ? <img src={image} alt={`${item.brand || "Vintage"} ${item.category || "garment"}`} /> : <div className="image-fallback">Catalog image coming soon</div>}</div><div className="item-info"><div className="eyebrow">{item.category || "Garment"} · {item.size || "One size"}</div><h1 className="display">{item.brand || "Unlabeled vintage"}</h1><div className="item-price">${Number(item.price || 0).toFixed(2)}</div><dl className="detail-list"><div className="detail-row"><dt>Condition</dt><dd>{item.condition || "Pre-owned"}</dd></div><div className="detail-row"><dt>Size</dt><dd>{item.size || "One size"}</dd></div><div className="detail-row"><dt>Pickup</dt><dd>{store.pickup_instructions ? "Store pickup" : "Ask the store"}</dd></div></dl>{item.notes ? <p className="notes">{item.notes}</p> : null}<ItemActions itemId={item.id} state={state} /></div></div></main>
    <footer className="footer"><div className="shell">Try-on images are private and expire automatically. RackStage previews style, not physical fit.</div></footer>
  </>;
}
