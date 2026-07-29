"use server";

import { revalidatePath } from "next/cache";
import { requireSession, currentOperatorName } from "@/lib/auth";
import { createTransaction } from "@/lib/queries/transactions";
import type { ActionState } from "@/app/actions";

export interface BuyGoldInput {
  weight: number;      // grams bought
  touch: number;       // purity / touch (%)
  rate: number;        // price per gram paid
  cashPaid?: number;
  bankPaid?: number;
  bankName?: string;
  narration?: string;
}

/**
 * Records a gold PURCHASE: one transaction + one purchase line (metal=gold) +
 * cash/bank settlements paid out. The purchase line flows into gold stock via
 * getStock()'s transaction aggregation (purchase lines add pure metal). The
 * price/gram is stored on the line `rate`.
 */
export async function buyGoldAction(input: BuyGoldInput): Promise<ActionState> {
  await requireSession();

  const weight = Number(input.weight) || 0;
  const touch = Number(input.touch) || 0;
  const rate = Number(input.rate) || 0;
  const cash = Number(input.cashPaid) || 0;
  const bank = Number(input.bankPaid) || 0;

  if (weight <= 0) return { error: "Enter the weight bought (g)." };
  if (touch <= 0) return { error: "Enter the purity / touch." };
  if (rate <= 0) return { error: "Enter the price per gram." };

  const operatorName = await currentOperatorName();
  const { id, serialNo } = await createTransaction({
    trnType: "purchase",
    partyId: null,
    metal: "gold",
    barRate: rate,
    narration: input.narration?.trim() || "Buy Gold",
    operatorName,
    lines: [
      {
        kind: "purchase",
        particulars: "Gold purchase",
        weight,
        touch,
        rate,
      },
    ],
    movements: [],
    settlements: [
      { mode: "cash" as const, direction: "paid" as const, amount: cash },
      { mode: "bank" as const, direction: "paid" as const, amount: bank, bankName: input.bankName },
    ].filter((s) => s.amount > 0),
  });

  revalidatePath("/stock");
  revalidatePath("/history");
  revalidatePath("/");

  return { ok: true, id, serialNo };
}
