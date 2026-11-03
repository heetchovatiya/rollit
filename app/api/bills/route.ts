import { env } from "cloudflare:workers";
import { billFingerprint, detectBillType, readBillBody } from "@/lib/pos/bills";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return reply({ error: "Invalid origin." }, 403);
  if (!env.BUCKET)
    return reply(
      { error: "Bill storage is unavailable. Please retry later." },
      503,
    );
  let bytes: Uint8Array, name: string;
  try {
    bytes = await readBillBody(request);
    name =
      decodeURIComponent(request.headers.get("x-bill-name") || "Bill")
        .replace(/[\x00-\x1f\x7f/\\]/g, "_")
        .slice(0, 180) || "Bill";
  } catch (error) {
    return reply(
      {
        error:
          error instanceof Error ? error.message : "Unable to read this bill.",
      },
      400,
    );
  }
  const type = detectBillType(bytes);
  if (!type)
    return reply({ error: "Upload a PDF, JPEG, PNG or WebP bill." }, 415);
  try {
    const id = await billFingerprint(bytes);
    const existing = await env.BUCKET.head("bills/" + id);
    if (!existing)
      await env.BUCKET.put("bills/" + id, bytes, {
        httpMetadata: { contentType: type },
        customMetadata: { name, uploadedAt: new Date().toISOString() },
      });
    return reply({
      id,
      name: existing?.customMetadata?.name || name,
      size: existing?.size || bytes.length,
      type,
      driveStatus: "not-connected",
    });
  } catch (error) {
    console.error("Bill upload failed", error);
    return reply(
      {
        error:
          "Bill upload could not be confirmed. Retry the same file safely.",
      },
      503,
    );
  }
}
