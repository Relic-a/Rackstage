import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { AppHeader } from "../components/app-header";
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
        <AppHeader />
        {children}
      </ClerkProvider>
    </body>
  </html>;
}
