import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { coinvoyageCredentials } from "@/lib/coinvoyage";
import { applyContestEntryStatus } from "@/lib/contest-fulfillment";

/**
 * Admin action: refund a specific contest entry's payment. Serves two
 * callers -- the general "refund a transaction" admin ask, and the
 * VOIDED-contest queue (an admin reviewing a VOIDED contest's paid entries
 * one at a time, per the locked "admin-reviewed, not automatic" refund
 * decision -- see lib/contest-finalization.ts). Always a deliberate,
 * explicit click; nothing else in this app calls createRefundOrder.
 *
 * --- REFUND request shape: verified for real against the live API ---
 * dental-site's app/api/admin/prescriptions/[id]/route.ts (the only other
 * place in this workspace that calls ApiClient.createRefundOrder) documented
 * omitting `currency` as an UNVERIFIED assumption -- "CoinVoyage infers the
 * settlement currency/chain from the original order." Tested that
 * assumption for real here: CoinVoyage's live API rejected a refund call
 * with `currency` omitted, returning the error `"currency.chain_id is
 * required"`. The assumption was wrong -- it does NOT infer it.
 *
 * Fixed by fetching the order first (`apiClient.getOrder(orderId)`) and
 * reading its settlement currency from `order.fulfillment.asset` (a
 * `Currency extends CurrencyBase = {chain_id, address?}`, confirmed from
 * @coin-voyage/shared/dist/types/model.d.ts -- `fulfillment` is always
 * present on a real Order, unlike the nullable `payment` field). That
 * `CurrencyBase` is passed as `currency` on the refund request. `recipient`
 * is still omitted, on the same original assumption (untested) that
 * CoinVoyage returns funds to whichever wallet actually paid -- flagging
 * that piece as still-unverified rather than re-asserting confidence in it.
 * This finding should also be carried back to dental-site's own refund
 * route, which still has the old, now-known-incorrect assumption baked in.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entry = await prisma.contestEntry.findUnique({ where: { id: params.id } });
  if (!entry) {
    return NextResponse.json({ error: "Contest entry not found." }, { status: 404 });
  }
  if (!entry.coinvoyageOrderId) {
    return NextResponse.json(
      { error: "This entry has no CoinVoyage order (free entry) -- nothing to refund." },
      { status: 409 }
    );
  }
  if (entry.paymentStatus === "REFUNDED") {
    return NextResponse.json({ paymentStatus: "REFUNDED", alreadyRefunded: true });
  }
  if (entry.paymentStatus !== "COMPLETED") {
    return NextResponse.json(
      {
        error: `This entry's payment is "${entry.paymentStatus}", not COMPLETED -- there's ` +
          "no settled payment to refund yet.",
      },
      { status: 409 }
    );
  }

  let apiClient, apiSecret: string;
  try {
    ({ client: apiClient, apiSecret } = await coinvoyageCredentials());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "CoinVoyage is not configured." },
      { status: 500 }
    );
  }

  const { data: order, error: orderError } = await apiClient.getOrder(entry.coinvoyageOrderId);
  if (orderError || !order) {
    console.error(
      `getOrder failed before refund for contestEntryId=${entry.id} coinvoyageOrderId=${entry.coinvoyageOrderId}`,
      orderError
    );
    return NextResponse.json(
      { error: orderError?.message ?? "Failed to look up this order with CoinVoyage before refunding it." },
      { status: 502 }
    );
  }
  if (!order.fulfillment?.asset) {
    console.error(
      `Order ${entry.coinvoyageOrderId} has no fulfillment.asset -- can't determine the settlement ` +
        `currency required for a refund (contestEntryId=${entry.id}).`
    );
    return NextResponse.json(
      { error: "Couldn't determine this order's settlement currency -- refund needs manual review." },
      { status: 502 }
    );
  }

  try {
    const { data, error } = await apiClient.createRefundOrder(
      entry.coinvoyageOrderId,
      {
        amount: (entry.entryFeeCents / 100).toFixed(2),
        currency: { chain_id: order.fulfillment.asset.chain_id, address: order.fulfillment.asset.address },
      },
      apiSecret
    );
    if (error || !data) {
      console.error(
        `createRefundOrder returned an error for contestEntryId=${entry.id} coinvoyageOrderId=${entry.coinvoyageOrderId}`,
        error
      );
      return NextResponse.json(
        { error: error?.message ?? "Failed to create the refund with CoinVoyage." },
        { status: 502 }
      );
    }
  } catch (err) {
    console.error(
      `CoinVoyage createRefundOrder threw for contestEntryId=${entry.id} coinvoyageOrderId=${entry.coinvoyageOrderId}`,
      err
    );
    return NextResponse.json(
      { error: "Failed to reach CoinVoyage to process the refund." },
      { status: 502 }
    );
  }

  // Apply locally immediately rather than waiting on the webhook -- the
  // refund call above just succeeded, so we already know the outcome.
  // Routes through applyContestEntryStatus (not a raw update) so the
  // COMPLETED -> REFUNDED transition also releases the entry's claimed
  // contest slot via the same exactly-once guard every other status change
  // uses (see lib/contest-fulfillment.ts).
  const finalStatus = await applyContestEntryStatus(entry.id, "REFUNDED", new Date());

  return NextResponse.json({ paymentStatus: finalStatus });
}
