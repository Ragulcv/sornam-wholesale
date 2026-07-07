import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isPinSet } from "@/lib/auth";
import { listOperators } from "@/lib/queries/operators";
import LockClient from "./LockClient";

export const dynamic = "force-dynamic";

export default async function LockPage() {
  const session = await getSession();
  if (session.authed && session.operatorId) redirect("/");
  if (session.authed && !session.operatorId) {
    return (
      <LockClient
        mode="login"
        initialStage="operator"
        initialOperators={await listOperators()}
      />
    );
  }
  return <LockClient mode={(await isPinSet()) ? "login" : "setup"} />;
}
