"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ItemState } from "../lib/types";

export function ItemStatusActions({ id, status }: { id: string; status: ItemState }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const options = status === "available" ? [{ label: "Mark sold", value: "sold" }, { label: "Archive", value: "archived" }] : status === "reserved" ? [{ label: "Release", value: "available" }, { label: "Mark sold", value: "sold" }] : status === "sold" ? [{ label: "Relist", value: "available" }, { label: "Archive", value: "archived" }] : [{ label: "Archive", value: "archived" }];
  async function update(next: string) {
    setBusy(true);
    const response = await fetch(`/api/items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    setBusy(false);
    if (response.ok) router.refresh();
  }
  return <div className="inventory-actions">{options.map((option) => <button disabled={busy} key={option.value} onClick={() => update(option.value)}>{option.label}</button>)}</div>;
}
