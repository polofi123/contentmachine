"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

// One field, one insert. Anything else here — niche pickers, format dropdowns,
// confirmation steps — is what makes the tool go unused.
export async function captureIdea(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const { error } = await db.from("ideas").insert({ title });
  if (error) throw new Error(`Could not capture idea: ${error.message}`);

  revalidatePath("/capture");
}

export async function dropIdea(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { error } = await db.from("ideas").update({ status: "dropped" }).eq("id", id);
  if (error) throw new Error(`Could not drop idea: ${error.message}`);

  revalidatePath("/capture");
}
