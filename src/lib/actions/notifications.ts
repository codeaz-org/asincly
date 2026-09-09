"use server";

import { revalidatePath } from "next/cache";
import { markAllReadForUser } from "@/lib/notifications";
import { requireUser } from "@/lib/session";

export async function markAllRead() {
  const user = await requireUser();
  await markAllReadForUser(user.id);
  revalidatePath("/", "layout");
}
