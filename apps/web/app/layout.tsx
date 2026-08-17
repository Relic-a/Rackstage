import type { Metadata } from "next";
import { ClerkProvider, SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "RackStage — one-of-one vintage, made shoppable",
  description: "Branded storefronts and visual try-on for thrift, vintage, and consignment stores.",
  openGraph: { title: "RackStage", description: "Give every one-of-one garment a storefront." },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en">
    <body>
      <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
        <header className="topbar">
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
        </header>
        {children}
      </ClerkProvider>
    </body>
  </html>;
}
