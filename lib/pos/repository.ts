import {projectState} from "./recipes";
import { applyAction, normalizeState, StoreError } from "./service";
import { emptyState, type StoreState } from "./types";
import type { StoreAction } from "./validation";
/** Single-store optimistic transaction. Readers see only fully committed sales and stock. */
export async function readState(db: D1Database): Promise<StoreState> {
  const row = await db
    .prepare("SELECT payload FROM store WHERE id = ?")
    .bind("main")
    .first<{ payload: string }>();
  return projectState(row ? normalizeState(JSON.parse(row.payload)) : emptyState());
}
export async function commitAction(
  db: D1Database,
  action: StoreAction,
): Promise<StoreState> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO store(id, payload, revision) VALUES(?, ?, 0)",
    )
    .bind("main", JSON.stringify(emptyState()))
    .run();
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db
      .prepare("SELECT payload, revision FROM store WHERE id = ?")
      .bind("main")
      .first<{ payload: string; revision: number }>();
    if (!row) throw new Error("Store initialization failed.");
    const state = normalizeState(JSON.parse(row.payload));
    const next = applyAction(state, action);
    if (next === state) return projectState(state);
    const payload = JSON.stringify(next);
    // D1 limits TEXT values. Keep a margin and fail before any stock or sale is committed.
    if (new TextEncoder().encode(payload).length > 1_500_000) {
      throw new StoreError(
        "Store storage is nearing capacity. Export a backup and contact support to upgrade the database layout.",
        507,
      );
    }
    const result = await db
      .prepare(
        "UPDATE store SET payload = ?, revision = revision + 1 WHERE id = ? AND revision = ?",
      )
      .bind(payload, "main", row.revision)
      .run();
    if (result.meta.changes === 1) return projectState(next);
  }
  throw new StoreError("Another checkout is updating the store. Please retry.");
}
