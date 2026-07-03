import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isPinSet } from "@/lib/auth";
import LockClient from "./LockClient";

export default async function LockPage() {
  const session = await getSession();
  if (session.authed) redirect("/");
  const pinSet = await isPinSet();
  return <LockClient mode={pinSet ? "login" : "setup"} />;
}
