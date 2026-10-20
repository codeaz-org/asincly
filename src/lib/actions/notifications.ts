"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { markAllReadForUser, markReadForUser } from "@/lib/notifications";
import { requireUser } from "@/lib/session";

export async function markAllRead() {
  const user = await requireUser();
  await markAllReadForUser(user.id);
  revalidatePath("/", "layout");
}

// Opening a notification reads it. Your own rows only (RLS and the filter).
export async function markRead(id: unknown) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return;
  const user = await requireUser();
  await markReadForUser(user.id, parsed.data);
  revalidatePath("/", "layout");
}
