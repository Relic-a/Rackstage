"use client";

import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppHeader() {
  const pathname = usePathname();
  if (pathname.startsWith("/store/")) return null;

  return <header className="topbar">
    <div className="shell topbar-inner">
      <Link className="wordmark" href="/"><span className="wordmark-mark">R</span><span>RackStage</span></Link>
      <nav className="auth-nav" aria-label="Account">
        <SignedOut>
          <SignInButton mode="modal"><button className="auth-link" type="button">Sign in</button></SignInButton>
          <SignUpButton mode="modal"><button className="auth-button" type="button">Create account</button></SignUpButton>
        </SignedOut>
        <SignedIn><Link className="auth-link dashboard-link" href="/seller">Dashboard</Link><UserButton afterSignOutUrl="/" /></SignedIn>
      </nav>
    </div>
  </header>;
}
