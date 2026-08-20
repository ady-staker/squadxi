// Mirrors CoinVoyage's OrderStatus enum (@coin-voyage/paykit/server ->
// @coin-voyage/shared/types). Reused verbatim from the checkout-based apps
// in this repo family -- a ContestEntry's paymentStatus mirrors the exact
// same CoinVoyage order lifecycle as an Order/Bet does elsewhere.
export const ORDER_STATUSES = [
  "PENDING",
  "AWAITING_PAYMENT",
  "AWAITING_CONFIRMATION",
  "OPTIMISTIC_CONFIRMED",
  "EXECUTING_ORDER",
  "COMPLETED",
  "EXPIRED",
  "REFUNDED",
  "FAILED",
  "PARTIAL_PAYMENT",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  "COMPLETED",
  "EXPIRED",
  "REFUNDED",
  "FAILED",
];

export const FAILURE_TERMINAL_STATUSES: readonly OrderStatus[] = [
  "EXPIRED",
  "REFUNDED",
  "FAILED",
];

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_ORDER_STATUSES as readonly string[]).includes(status);
}

export function isFailureTerminalStatus(status: string): boolean {
  return (FAILURE_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function logUnrecognizedStatus(status: string, context: string): void {
  console.error(
    `CoinVoyage returned unrecognized status "${status}" ${context} -- ` +
      "ORDER_STATUSES in lib/order-status.ts may need updating."
  );
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Entry submitted",
  AWAITING_PAYMENT: "Awaiting payment",
  AWAITING_CONFIRMATION: "Confirming payment",
  OPTIMISTIC_CONFIRMED: "Payment detected",
  EXECUTING_ORDER: "Processing payment",
  COMPLETED: "Entry confirmed",
  EXPIRED: "Payment window expired",
  REFUNDED: "Refunded",
  FAILED: "Payment failed",
  PARTIAL_PAYMENT: "Partial payment received",
};
