"use client";

import { useEffect, useRef, useState } from "react";

type Props = { itemId: string; state: "draft" | "processing" | "available" | "reserved" | "sold" | "archived" };

async function sanitizeImage(file: File): Promise<File> {
  if (typeof window === "undefined" || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const shortSide = Math.min(bitmap.width, bitmap.height);
    const longSide = Math.max(bitmap.width, bitmap.height);
    if (shortSide < 384 || longSide < 512 || longSide > 4096) throw new Error("Use a photo at least 512 × 384 pixels and no larger than 4096 pixels on either side.");
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); if (!context) return file;
    context.drawImage(bitmap, 0, 0); bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob || blob.size > 10 * 1024 * 1024) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Use a photo")) throw error;
    return file;
  }
}

export function ItemActions({ itemId, state }: Props) {
  const [tryOnOpen, setTryOnOpen] = useState(false);
  const [reserveState, setReserveState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [reserveMessage, setReserveMessage] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [requestToken, setRequestToken] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [tryOnState, setTryOnState] = useState<"idle" | "uploading" | "processing" | "success" | "error">("idle");
  const [tryOnMessage, setTryOnMessage] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); if (pollTimer.current) clearTimeout(pollTimer.current); }, [preview]);
  useEffect(() => {
    try { setRequestToken(window.localStorage.getItem(`rackstage-reservation:${itemId}`)); } catch { /* private browsing */ }
  }, [itemId]);

  const onFile = async (value: File | undefined) => {
    if (!value) return;
    if (!['image/jpeg', 'image/png'].includes(value.type)) { setTryOnMessage("Use a JPG or PNG photo."); setTryOnState("error"); return; }
    if (value.size > 10 * 1024 * 1024) { setTryOnMessage("Images must be smaller than 10 MB."); setTryOnState("error"); return; }
    try { value = await sanitizeImage(value); } catch (error) { setTryOnMessage(error instanceof Error ? error.message : "Use a larger, clear photo."); setTryOnState("error"); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(value); setPreview(URL.createObjectURL(value)); setTryOnMessage(""); setTryOnState("idle"); setResultUrl(null);
  };

  const startTryOn = async () => {
    if (!file) { setTryOnMessage("Choose a clear photo of one person first."); setTryOnState("error"); return; }
    setTryOnState("uploading"); setTryOnMessage("");
    try {
      const body = new FormData(); body.append("photo", file);
      const response = await fetch(`/api/items/${encodeURIComponent(itemId)}/try-on`, { method: "POST", body });
      const data = await response.json() as { session?: { id: string }; error?: { message?: string } };
      if (!response.ok || !data.session?.id) throw new Error(data.error?.message || "Try-on could not be started.");
      setTryOnState("processing"); poll(data.session.id);
    } catch (error) { setTryOnState("error"); setTryOnMessage(error instanceof Error ? error.message : "Try-on could not be started."); }
  };

  const poll = (id: string) => {
    pollTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/items/${encodeURIComponent(itemId)}/try-on/${encodeURIComponent(id)}`, { cache: "no-store" });
        const data = await response.json() as { session?: { status: string; result_url?: string | null; error_message?: string | null }; error?: { message?: string } };
        if (!response.ok || !data.session) throw new Error(data.error?.message || "Could not check try-on status.");
        if (data.session.status === "succeeded" || data.session.status === "success") { setTryOnState("success"); setResultUrl(data.session.result_url ?? null); return; }
        if (data.session.status === "failed" || data.session.status === "error" || data.session.status === "expired") { setTryOnState("error"); setTryOnMessage(data.session.error_message || "The photo could not be processed. Try another image."); return; }
        setTryOnState("processing"); poll(id);
      } catch (error) { setTryOnState("error"); setTryOnMessage(error instanceof Error ? error.message : "Could not check try-on status."); }
    }, 3500);
  };

  const reserve = async () => {
    setReserveState("loading"); setReserveMessage("");
    try {
      const token = requestToken ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null);
      if (token) { setRequestToken(token); try { window.localStorage.setItem(`rackstage-reservation:${itemId}`, token); } catch { /* private browsing */ } }
      const response = await fetch(`/api/items/${encodeURIComponent(itemId)}/reserve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ buyer_name: buyerName, buyer_contact: buyerContact, ...(token ? { request_token: token } : {}) }) });
      const data = await response.json() as { reservation?: { reserved_until?: string }; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message || "This piece is no longer available.");
      setReserveState("success"); setReserveMessage(data.reservation?.reserved_until ? `Held for pickup until ${new Date(data.reservation.reserved_until).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.` : "Reserved for pickup.");
      try { window.localStorage.removeItem(`rackstage-reservation:${itemId}`); } catch { /* private browsing */ }
      setRequestToken(null);
    } catch (error) { setReserveState("error"); setReserveMessage(error instanceof Error ? error.message : "This piece is no longer available."); }
  };

  if (state === "sold") return <div className="notice notice-info">This piece has been sold.</div>;
  if (state === "reserved") return <div className="notice notice-info">This piece is currently reserved. Check back if it returns to the rack.</div>;
  if (state !== "available") return <div className="notice notice-info">This piece is not available yet.</div>;

  return <div className="action-stack">
    {reserveState === "success" ? <div className="notice notice-success">{reserveMessage}</div> : <div className="reserve-panel"><h3>Reserve for pickup</h3><p className="muted" style={{ fontSize: 13 }}>The store will hold this one-of-one piece for you.</p><div style={{ display: "grid", gap: 8, margin: "12px 0" }}><input aria-label="Your name" placeholder="Your name" value={buyerName} onChange={(event) => setBuyerName(event.target.value)} style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "10px 11px", background: "#fffdf9" }} /><input aria-label="Email or phone" placeholder="Email or phone" value={buyerContact} onChange={(event) => setBuyerContact(event.target.value)} style={{ border: "1px solid var(--line)", borderRadius: 9, padding: "10px 11px", background: "#fffdf9" }} /></div><button className="button button-primary button-wide" onClick={reserve} disabled={reserveState === "loading"}>{reserveState === "loading" ? "Reserving…" : "Reserve this piece"}</button>{reserveState === "error" ? <div className="notice notice-error">{reserveMessage}</div> : null}</div>}
    <div className="tryon-panel"><h3>See it on you</h3><p className="tryon-instructions">Upload one clear, upright photo of yourself facing forward. Your photo stays private and is used only for this visual preview.</p>{tryOnOpen ? <>
      {preview ? <div className="preview"><img src={preview} alt="Selected shopper photo" /></div> : null}
      {tryOnState === "success" && resultUrl ? <div className="preview"><img src={resultUrl} alt="Virtual try-on result" /></div> : null}
      <div className="upload-box"><input type="file" accept="image/jpeg,image/png" capture="user" onChange={(event) => onFile(event.target.files?.[0])} /></div>
      {tryOnState === "processing" || tryOnState === "uploading" ? <div className="notice notice-info">{tryOnState === "uploading" ? "Uploading securely…" : "Creating your visual preview…"}</div> : null}
      {tryOnState === "success" ? <div className="notice notice-success">Preview ready. It is a style reference, not a fit guarantee.</div> : null}
      {tryOnState === "error" ? <div className="notice notice-error">{tryOnMessage}</div> : null}
      <button className="button button-accent button-wide" onClick={startTryOn} disabled={tryOnState === "uploading" || tryOnState === "processing"}>{tryOnState === "success" ? "Try another photo" : tryOnState === "processing" ? "Working…" : "Generate visual preview"}</button>
    </> : <button className="button button-quiet button-wide" onClick={() => setTryOnOpen(true)}>Upload a photo to try it on</button>}<p className="disclaimer">RackStage shows how the garment may look on you. It does not guarantee physical fit, color, or drape.</p></div>
  </div>;
}
