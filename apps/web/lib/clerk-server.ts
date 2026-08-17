import "server-only";

import { currentUser } from "@clerk/nextjs/server";
import { supabaseRest } from "./supabase-server";

type ProfileRecord = { id: string; email?: string | null };

/**
 * Create a Clerk profile on first use and relink a legacy Supabase profile by
 * its verified email when one exists. This keeps existing stores attached to
 * their owners while the canonical identity moves to Clerk.
 */
export async function ensureClerkProfile(userId: string) {
  const existing = await supabaseRest<ProfileRecord[]>(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
  );
  if (existing[0]) return;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
  if (!email) return;

  const legacy = await supabaseRest<ProfileRecord[]>(
    `profiles?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
  );
  const legacyId = legacy[0]?.id;
  if (legacyId && legacyId !== userId) {
    await supabaseRest<ProfileRecord[]>(`profiles?id=eq.${encodeURIComponent(legacyId)}`, {
      method: "PATCH",
      prefer: "return=representation",
      body: { id: userId },
    });
    await supabaseRest(`stores?owner_id=eq.${encodeURIComponent(legacyId)}`, {
      method: "PATCH",
      body: { owner_id: userId },
    });
    return;
  }

  await supabaseRest<ProfileRecord[]>("profiles", {
    method: "POST",
    prefer: "return=representation",
    body: { id: userId, email },
  }).catch(() => undefined);
}
