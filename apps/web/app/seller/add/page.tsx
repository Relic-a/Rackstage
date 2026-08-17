import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WebAddItem } from "../../../components/web-add-item";
import { storesForUser } from "../../../lib/seller";

export const dynamic = "force-dynamic";

export default async function AddItemPage() {
  const { userId } = await auth();
  if (!userId) redirect("/seller?intent=add");
  const stores = await storesForUser(userId).catch(() => []);
  const store = stores[0];
  if (!store) redirect("/seller");
  return <main className="seller-shell add-item-page">
    <div className="seller-subnav"><Link href="/seller">← Dashboard</Link><span>Adding to <strong>{store.name}</strong></span></div>
    <div className="add-heading"><div><div className="eyebrow">New inventory</div><h1 className="display">Add a garment.</h1></div><p>No app needed. Your phone’s browser is all you need.</p></div>
    <WebAddItem store={store} />
  </main>;
}
