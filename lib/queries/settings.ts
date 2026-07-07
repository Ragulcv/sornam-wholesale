import "server-only";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { settings } from "../db/schema";

export async function updateSettings(data: {
  autoLogoffMinutes?: number;
  gstin?: string | null;
  taxPercent?: number;
  tdsPercent?: number;
  defaultGoldRate?: number | null;
  defaultSilverRate?: number | null;
}): Promise<void> {
  await db
    .update(settings)
    .set({
      ...(data.autoLogoffMinutes != null ? { autoLogoffMinutes: data.autoLogoffMinutes } : {}),
      ...(data.gstin !== undefined ? { gstin: data.gstin?.trim() || null } : {}),
      ...(data.taxPercent != null ? { taxPercent: String(data.taxPercent) } : {}),
      ...(data.tdsPercent != null ? { tdsPercent: String(data.tdsPercent) } : {}),
      ...(data.defaultGoldRate !== undefined
        ? { defaultGoldRate: data.defaultGoldRate == null ? null : String(data.defaultGoldRate) }
        : {}),
      ...(data.defaultSilverRate !== undefined
        ? { defaultSilverRate: data.defaultSilverRate == null ? null : String(data.defaultSilverRate) }
        : {}),
    })
    .where(eq(settings.id, 1));
}

export async function updatePrices(data: {
  goldRate?: number | null;
  silverRate?: number | null;
  at?: Date;
}): Promise<void> {
  await db
    .update(settings)
    .set({
      ...(data.goldRate != null ? { defaultGoldRate: String(data.goldRate) } : {}),
      ...(data.silverRate != null ? { defaultSilverRate: String(data.silverRate) } : {}),
      priceUpdatedAt: data.at ?? new Date(),
    })
    .where(eq(settings.id, 1));
}
