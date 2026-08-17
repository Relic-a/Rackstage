"use client";

import { useState } from "react";
import type { StoreRecord } from "../lib/types";

export function SellerSettings({ store }: { store: StoreRecord }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(store.name);
  const [color, setColor] = useState(store.brand_color || "#e26b45");
  const [pickup, setPickup] = useState(store.pickup_instructions || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setMessage("");
    const response = await fetch("/api/stores", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: store.id, name, brand_color: color, pickup_instructions: pickup }) });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) return setMessage(payload?.error?.message || "Changes could not be saved.");
    setMessage("Store settings saved.");
  }
  return <div className="settings-panel">
    <button className="button button-quiet" onClick={() => setOpen(!open)}>{open ? "Close settings" : "Store settings"}</button>
    {open ? <div className="settings-card">
      <label className="field"><span>Store name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>Brand color</span><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
      <label className="field field-wide"><span>Pickup instructions</span><textarea rows={3} value={pickup} onChange={(e) => setPickup(e.target.value)} /></label>
      {message ? <p className="form-message">{message}</p> : null}<button className="button button-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</button>
    </div> : null}
  </div>;
}
