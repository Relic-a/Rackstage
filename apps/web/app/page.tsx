import Link from "next/link";

export default function HomePage() {
  return <>
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">Photograph → publish → try on</div>
        <h1 className="display">The fastest way to put a rare garment online.</h1>
        <p className="lede">RackStage gives vintage and consignment stores a beautiful storefront for every one-of-one piece—with visual try-on built in.</p>
        <div className="hero-actions"><Link className="button button-accent" href="/seller">Create your store</Link><a className="button button-quiet" href="#how-it-works">See how it works</a></div>
      </section>
      <section className="landing-grid" id="how-it-works" aria-label="How RackStage works">
        <article className="landing-card"><span className="number">01</span><strong>Make the rack shoppable</strong><p>Capture a garment, remove the background, and publish the exact piece in under a minute.</p></article>
        <article className="landing-card"><span className="number">02</span><strong>Let shoppers see it on</strong><p>A shopper uploads one suitable photo. A visual preview helps them decide before they visit.</p></article>
        <article className="landing-card"><span className="number">03</span><strong>Reserve for pickup</strong><p>One garment means one clear outcome. A successful reservation takes it off the rack.</p></article>
      </section>
      <section className="browser-seller-callout"><div><div className="eyebrow">No download required</div><h2 className="display">Turn any phone into your inventory camera.</h2><p>Scan from your dashboard, photograph the garment in the browser, and publish while the catalog image processes. The native seller app remains available whenever you prefer it.</p><Link className="button button-primary" href="/seller">Open seller workspace</Link></div><div className="phone-mock"><div className="phone-speaker"/><div className="phone-camera-mark">◎</div><strong>Frame one garment</strong><span>Full item · even light · clear background</span><button>Take photo</button></div></section>
    </main>
    <footer className="footer"><div className="shell">RackStage is a visual style preview—not a guarantee of fit.</div></footer>
  </>;
}
