"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ItemRecord, ProcessingJobRecord, StoreRecord } from "../lib/types";

const categories = ["shirt", "blouse", "top", "sweater", "hoodie", "cardigan", "coat", "jacket", "dress", "jumpsuit", "pants", "trousers", "skirt"];
type Draft = ItemRecord & { catalog_image_url?: string | null };

export function WebAddItem({ store, captureToken }: { store: StoreRecord; captureToken?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [job, setJob] = useState<ProcessingJobRecord | null>(null);
  const [category, setCategory] = useState("");
  const [size, setSize] = useState("");
  const [brand, setBrand] = useState("");
  const [condition, setCondition] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [published, setPublished] = useState(false);
  const [cameraState, setCameraState] = useState<"requesting" | "live" | "denied" | "unavailable">("requesting");

  const captureHeaders = useMemo(() => captureToken ? { "x-rackstage-capture-token": captureToken } : undefined, [captureToken]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setCameraState("unavailable");
    setCameraState("requesting");
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraState("live");
    } catch {
      setCameraState("denied");
    }
  }, [stopCamera]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    void startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);
  useEffect(() => {
    if (cameraState === "live" && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraState]);
  useEffect(() => {
    if (!draft?.id || job?.status === "succeeded" || job?.status === "failed") return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/items/${draft.id}`, { cache: "no-store", headers: captureHeaders });
      if (!response.ok) return;
      const payload = await response.json();
      setDraft(payload.item); setJob(payload.job);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [draft?.id, job?.status, captureHeaders]);

  async function uploadPhoto(file: File) {
    setError("");
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024) return setError("Choose a JPG or PNG smaller than 10 MB.");
    if (preview) URL.revokeObjectURL(preview);
    stopCamera();
    setPhoto(file); setPreview(URL.createObjectURL(file)); setBusy(true);
    const form = new FormData();
    form.set("original", file); form.set("store_id", store.id); form.set("request_token", crypto.randomUUID());
    try {
      const response = await fetch("/api/items/create-draft", { method: "POST", body: form, headers: captureHeaders });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "We could not upload that photo.");
      setDraft(payload.item); setJob(payload.job ?? null);
      if (payload.error?.message) setError(payload.error.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not upload that photo."); }
    finally { setBusy(false); }
  }

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadPhoto(file);
  }

  async function takePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return setError("The camera is still starting. Try again in a moment.");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return setError("The camera could not capture that photo.");
    await uploadPhoto(new File([blob], `garment-${Date.now()}.jpg`, { type: "image/jpeg" }));
  }

  async function retry() {
    if (!draft) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/seller/items/${draft.id}/process`, { method: "POST", headers: captureHeaders });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setError(payload?.error?.message || "Processing could not be restarted.");
    setJob(payload.job);
  }

  async function publish() {
    if (!draft) return;
    if (!category || !size.trim() || !brand.trim() || !condition || !price.trim()) return setError("Add category, size, brand, condition, and price before publishing.");
    setBusy(true); setError("");
    const response = await fetch(`/api/items/${draft.id}/publish`, { method: "POST", headers: { "Content-Type": "application/json", ...captureHeaders }, body: JSON.stringify({ category, size, brand, condition, price, notes }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return setError(payload?.error?.message || "This item is not ready to publish.");
    setDraft(payload.item); setPublished(true);
  }

  if (published && draft) return <div className="capture-success">
    <div className="success-mark">✓</div><div className="eyebrow">Published</div><h1 className="display">Your item is live.</h1>
    <p>It’s now visible in {store.name} and ready to be reserved.</p>
    <div className="completion-actions"><Link className="button button-accent" href={`/store/${store.slug}/item/${draft.id}`}>View item</Link><button className="button button-quiet" onClick={() => window.location.reload()}>Add another</button><Link className="button button-quiet" href="/seller">Dashboard</Link></div>
  </div>;

  return <div className="capture-layout">
    <section className="capture-stage">
      <div className="mobile-flow-kicker"><span>1</span> Photograph the garment</div>
      <div className={preview ? "camera-frame has-photo" : cameraState === "live" ? "camera-frame camera-live" : "camera-frame"}>
        {preview ? <img src={preview} alt="Garment preview" /> : cameraState === "live" ? <><video ref={videoRef} autoPlay muted playsInline aria-label="Camera preview"/><div className="camera-controls"><button type="button" className="camera-shutter" onClick={takePhoto} aria-label="Take photo"><span /></button><button type="button" className="camera-library" onClick={() => inputRef.current?.click()}>Choose photo</button></div></> : <><div className="camera-icon">◎</div><h2>{cameraState === "requesting" ? "Allow camera access" : "Open your camera"}</h2><p>{cameraState === "denied" ? "Camera access is off. Allow it in your browser settings, or choose an existing photo." : "Place one complete garment in the frame, with even light and a clear background."}</p><div className="camera-fallback-actions">{cameraState !== "requesting" ? <button type="button" className="button button-primary" onClick={() => void startCamera()}>Try camera again</button> : null}<button type="button" className="button button-quiet" onClick={() => inputRef.current?.click()}>Choose photo</button></div></>}
      </div>
      <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png" capture="environment" onChange={choosePhoto} />
      {preview ? <button className="retake-button" onClick={() => inputRef.current?.click()}>Retake or choose another</button> : null}
      <div className="photo-tips"><span>One garment</span><span>Full item visible</span><span>Good lighting</span></div>
    </section>
    <section className={draft ? "item-details active" : "item-details"}>
      <div className="mobile-flow-kicker"><span>2</span> Add the details</div>
      {!draft ? <div className="details-placeholder"><strong>{busy ? "Uploading your photo…" : "Your item details come next"}</strong><p>Once your photo is uploaded, you can describe the piece while we prepare its catalog image.</p></div> : <>
        <div className={`processing-banner ${job?.status || "pending"}`}><span className="processing-dot"/><div><strong>{job?.status === "succeeded" ? "Catalog image ready" : job?.status === "failed" ? "Image processing needs attention" : "Preparing your catalog image"}</strong><small>{job?.status === "succeeded" ? "Everything is ready to publish." : job?.status === "failed" ? job.error_message : "Keep adding details—we’ll work in the background."}</small></div>{job?.status === "failed" ? <button onClick={retry} disabled={busy}>Retry</button> : null}</div>
        <div className="seller-form-grid compact">
          <label className="field"><span>Category</span><select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Choose one</option>{categories.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
          <label className="field"><span>Size</span><input value={size} onChange={(e) => setSize(e.target.value)} placeholder="M, 32, OS…" /></label>
          <label className="field"><span>Brand</span><input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand or vintage" /></label>
          <label className="field"><span>Condition</span><select value={condition} onChange={(e) => setCondition(e.target.value)}><option value="">Choose one</option><option>New with tags</option><option>Excellent</option><option>Good</option><option>Fair</option></select></label>
          <label className="field"><span>Price (USD)</span><div className="price-input"><b>$</b><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="48" /></div></label>
          <label className="field field-wide"><span>Notes <em>optional</em></span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Fit, fabric, flaws, or story…" /></label>
        </div>
        {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
        <button className="button button-accent button-wide publish-button" onClick={publish} disabled={busy || job?.status !== "succeeded"}>{busy ? "Working…" : job?.status === "succeeded" ? "Publish item" : "Catalog image is processing…"}</button>
      </>}
      {!draft && error ? <p className="notice notice-error" role="alert">{error}</p> : null}
    </section>
  </div>;
}
