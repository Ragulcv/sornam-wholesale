"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCollectionAction } from "@/app/actions";

export default function TransactionRowActions({
  collectionId,
}: {
  collectionId: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function doDelete() {
    setDeleting(true);
    await deleteCollectionAction(collectionId);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      {confirm ? (
        <>
          <button
            onClick={doDelete}
            disabled={deleting}
            className="flex h-8 items-center rounded-lg border border-[#f1c9c4] bg-[#fdecea] px-2 text-xs font-bold text-neg disabled:opacity-50"
          >
            {deleting ? "…" : "Delete"}
          </button>
          <button
            onClick={() => setConfirm(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-pearl text-mid hover:bg-cream"
          >
            ✕
          </button>
        </>
      ) : (
        <button
          onClick={() => setConfirm(true)}
          title="Delete transaction"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-pearl text-mute transition hover:border-[#f1c9c4] hover:bg-[#fdecea] hover:text-neg"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 11v6M14 11v6" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
