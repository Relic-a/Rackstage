"use client";

export default function ItemError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="shell"><div className="empty"><h1 className="display">We lost this piece for a moment.</h1><p>Try loading the item again.</p><button className="button button-primary" onClick={() => reset()}>Try again</button></div></main>;
}
