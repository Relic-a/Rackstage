import Link from "next/link";
import { notFound } from "next/navigation";
import { WebAddItem } from "../../../../components/web-add-item";
import { verifyCaptureToken } from "../../../../lib/capture-token";
import { findStoreById } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add inventory" };

export default async function CapturePage({ params }: { params: { token: string } }) {
  const claims = verifyCaptureToken(params.token);
  if (!claims) notFound();
  const store = await findStoreById(claims.storeId).catch(() => null);
  if (!store) notFound();

  return <main className="seller-shell add-item-page capture-link-page">
    <div className="seller-subnav"><span>Private inventory camera</span><span>Adding to <strong>{store.name}</strong></span></div>
    <div className="add-heading"><div><div className="eyebrow">{store.name}</div><h1 className="display">Add a garment.</h1></div><p>Allow camera access, frame one complete piece, and take the photo.</p></div>
    <WebAddItem store={store} captureToken={params.token} />
    <p className="capture-security-note">This staff link can add inventory to {store.name}. <Link href="/">Leave inventory camera</Link></p>
  </main>;
}
