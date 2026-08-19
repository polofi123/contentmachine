"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

// Components are archived, never deleted. A component referenced by a past
// video must not vanish from history — that would silently rewrite the
// analysis later.

export async function createComponent(formData: FormData) {
  const layerId = String(formData.get("layer_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!layerId || !name) return;

  const { data: last } = await db
    .from("components")
    .select("sort_order")
    .eq("layer_id", layerId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await db.from("components").insert({
    layer_id: layerId,
    name,
    body: body || null,
    sort_order: (last?.sort_order ?? 0) + 1,
    // source_id stays null and is_seeded stays false: that flag is the only
    // thing distinguishing this from a seeded component, exactly as specified.
  });

  if (error) throw new Error(`Could not create component: ${error.message}`);
  revalidatePath("/library");
}

export async function updateComponent(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const body = String(formData.get("body") ?? "");

  if (!id || !name) return;

  const { error } = await db
    .from("components")
    .update({ name, body: body.trim() || null })
    .eq("id", id);

  if (error) throw new Error(`Could not update component: ${error.message}`);
  revalidatePath("/library");
}

export async function setArchived(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const archived = String(formData.get("archived") ?? "") === "true";

  if (!id) return;

  const { error } = await db
    .from("components")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) throw new Error(`Could not archive component: ${error.message}`);
  revalidatePath("/library");
}

// Naming a placeholder is a real event: CHK-04 or HACK-12 stops being an open
// slot and becomes part of the model. Clearing is_placeholder is what records
// that, so the library's "N more exist, not yet named" count stays honest.
export async function namePlaceholder(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!id || !name) return;

  const { error } = await db
    .from("components")
    .update({ name, body: body || null, is_placeholder: false })
    .eq("id", id);

  if (error) throw new Error(`Could not name placeholder: ${error.message}`);
  revalidatePath("/library");
}
