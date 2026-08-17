"use client";

export default function StoreError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="shell"><div className="empty"><h1 className="display">This rack is taking a breather.</h1><p>We could not load the storefront right now.</p><button className="button button-primary" onClick={() => reset()}>Try again</button></div></main>;
}
