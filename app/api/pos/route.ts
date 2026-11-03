import { env } from "cloudflare:workers";
import { actionSchema } from "@/lib/pos/validation";
import { commitAction, readState } from "@/lib/pos/repository";
import { StoreError } from "@/lib/pos/service";
export const dynamic = "force-dynamic";
const reply = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET() {
  try {
    if (!env.DB) throw new Error("Database unavailable");
    return reply(await readState(env.DB));
  } catch (error) {
    console.error("POS read failed", error);
    return reply({ error: "Unable to load the store. Please try again." }, 503);
  }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return reply({ error: "Invalid origin." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply({ error: "Send a JSON request." }, 415);
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 100_000)
      return reply({ error: "The request is too large." }, 413);
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return reply({ error: "Invalid JSON." }, 400);
    }
    const parsed = actionSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return reply({ error: `${issue.path.join(".")}: ${issue.message}` }, 400);
    }
    if (!env.DB) throw new Error("Database unavailable");
    const action = parsed.data;
    if(action.type==="createOrder"||action.type==="editOrder"||action.type==="cancelOrder"||action.type==="discardOrder"||action.type==="archiveOrder"||action.type==="orderGiven"||action.type==="orderDelivery"||action.type==="orderPaid")action.actor=request.headers.get("x-rollit-user")||"Admin";
    const attachment =
      action.type === "product"
        ? action.product.billId
        : action.type === "restock" || action.type === "ingredientReceipt" || action.type === "ingredient"
          ? action.billId
          : action.type === "trackedBill"
            ? action.bill.billId
            : undefined;
    if (attachment) {
      if (!env.BUCKET) throw new Error("Bill storage unavailable");
      const stored = await env.BUCKET.head("bills/" + attachment);
      if (!stored)
        return reply(
          { error: "The attached bill is missing. Upload it again." },
          400,
        );
      if (action.type === "trackedBill")
        action.bill.attachmentType = stored.httpMetadata?.contentType;
    }
    return reply(await commitAction(env.DB, parsed.data));
  } catch (error) {
    if (error instanceof StoreError)
      return reply({ error: error.message }, error.status);
    console.error("POS write failed", error);
    return reply(
      {
        error:
          "Unable to save changes. Refresh to check the last operation before retrying.",
      },
      503,
    );
  }
}
