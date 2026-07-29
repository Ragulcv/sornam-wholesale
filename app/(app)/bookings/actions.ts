"use server";

import { requireSession } from "@/lib/auth";
import { getPartyCashBalance } from "@/lib/queries/partyBalance";

/** Running cash balance for a party (used by the delivery view after a sale). */
export async function getPartyBalanceAction(partyId: string): Promise<number> {
  await requireSession();
  return getPartyCashBalance(partyId);
}
