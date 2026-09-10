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
  bookingTemplate?: string | null;
  salesTemplate?: string | null;
  purchaseTemplate?: string | null;
  deliveredTemplate?: string | null;
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
      ...(data.bookingTemplate !== undefined ? { bookingTemplate: data.bookingTemplate } : {}),
      ...(data.salesTemplate !== undefined ? { salesTemplate: data.salesTemplate } : {}),
      ...(data.purchaseTemplate !== undefined ? { purchaseTemplate: data.purchaseTemplate } : {}),
      ...(data.deliveredTemplate !== undefined ? { deliveredTemplate: data.deliveredTemplate } : {}),
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

// ---- Editable WhatsApp wording ------------------------------------------

export interface MessageTemplates {
  booking: string | null;
  sales: string | null;
  purchase: string | null;
  delivered: string | null;
}

/** NULL means "use the built-in wording" (see lib/whatsapp.ts DEFAULT_*). */
export async function getMessageTemplates(): Promise<MessageTemplates> {
  const [row] = await db
    .select({
      booking: settings.bookingTemplate,
      sales: settings.salesTemplate,
      purchase: settings.purchaseTemplate,
      delivered: settings.deliveredTemplate,
    })
    .from(settings)
    .where(eq(settings.id, 1));
  return {
    booking: row?.booking ?? null,
    sales: row?.sales ?? null,
    purchase: row?.purchase ?? null,
    delivered: row?.delivered ?? null,
  };
}
