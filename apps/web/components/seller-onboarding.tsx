"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const steps = ["Your store", "Store details", "Ready to sell"];

export function SellerOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [color, setColor] = useState("#e26b45");
  const [pickup, setPickup] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const suggestedSlug = useMemo(() => (slug || name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48), [name, slug]);

  async function createStore() {
    if (!name.trim()) return setError("Give your store a name first.");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/stores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, slug: suggestedSlug, brand_color: color, pickup_instructions: pickup }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "We could not create your store.");
      setStep(2);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not create your store.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="seller-shell onboarding-shell">
    <div className="onboarding-progress" aria-label={`Step ${step + 1} of 3`}>
      {steps.map((label, index) => <div className={index <= step ? "progress-step active" : "progress-step"} key={label}><span>{index + 1}</span><small>{label}</small></div>)}
    </div>
    {step === 0 ? <section className="onboarding-card onboarding-intro">
      <div className="eyebrow">Welcome to RackStage</div>
      <h1 className="display">Let’s open your digital rack.</h1>
      <p className="lede">You’ll get a polished storefront, a simple inventory workspace, and a phone-ready camera flow. It takes about two minutes.</p>
      <div className="onboarding-benefits"><div><b>01</b><span>Choose your store identity</span></div><div><b>02</b><span>Add pickup details</span></div><div><b>03</b><span>Scan, photograph, publish</span></div></div>
      <button className="button button-primary" onClick={() => setStep(1)}>Set up my store <span>→</span></button>
    </section> : null}
    {step === 1 ? <section className="onboarding-card">
      <div className="eyebrow">Make it yours</div><h1 className="display onboarding-title">Your storefront starts here.</h1>
      <div className="seller-form-grid">
        <label className="field field-wide"><span>Store name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="North Loop Vintage" maxLength={100} /></label>
        <label className="field"><span>Store link</span><div className="input-prefix"><small>rackstage.app/store/</small><input value={suggestedSlug} onChange={(event) => setSlug(event.target.value)} placeholder="north-loop-vintage" /></div></label>
        <label className="field color-field"><span>Brand color</span><div><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /><strong>{color.toUpperCase()}</strong></div></label>
        <label className="field field-wide"><span>Pickup instructions <em>optional</em></span><textarea value={pickup} onChange={(event) => setPickup(event.target.value)} placeholder="Where and when can shoppers collect reservations?" maxLength={500} rows={4} /></label>
      </div>
      {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
      <div className="form-actions"><button className="button button-quiet" onClick={() => setStep(0)}>Back</button><button className="button button-primary" disabled={busy} onClick={createStore}>{busy ? "Creating your store…" : "Create store"}</button></div>
    </section> : null}
    {step === 2 ? <section className="onboarding-card onboarding-complete">
      <div className="success-mark">✓</div><div className="eyebrow">You’re ready</div><h1 className="display">Your rack is open.</h1>
      <p className="lede">Next, add your first garment here or use the QR code in your dashboard to continue on any phone.</p>
      <div className="completion-actions"><button className="button button-accent" onClick={() => router.push("/seller/add")}>Add my first item</button><button className="button button-quiet" onClick={() => router.refresh()}>Go to dashboard</button></div>
    </section> : null}
  </main>;
}
