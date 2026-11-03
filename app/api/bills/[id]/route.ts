import { env } from "cloudflare:workers";
import { billIdPattern } from "@/lib/pos/bills";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!billIdPattern.test(id))
    return new Response("Bill not found.", { status: 404 });
  try {
    const file = await env.BUCKET?.get("bills/" + id);
    if (!file)
      return new Response("Bill not found.", {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    return new Response(file.body, {
      headers: {
        "Content-Type":
          file.httpMetadata?.contentType || "application/octet-stream",
        "Content-Disposition": `${new URL(_request.url).searchParams.get("preview") === "1" && file.httpMetadata?.contentType?.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.customMetadata?.name || "bill")}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Unable to retrieve the bill.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
