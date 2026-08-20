import "server-only";
import { ApiClient } from "@coin-voyage/paykit/server";
import type { APIEnvironment } from "@coin-voyage/paykit/server";
import { prisma } from "@/lib/prisma";

export const VALID_ENVIRONMENTS: readonly APIEnvironment[] = [
  "production",
  "development",
  "local",
];

export function isValidEnvironment(value: string): value is APIEnvironment {
  return (VALID_ENVIRONMENTS as readonly string[]).includes(value);
}

export type CredentialSource = "settings" | "env" | "unset";

type RawCredentials = {
  apiKey: string | null;
  apiSecret: string | null;
  keyPairSource: CredentialSource;
  environment: string | null;
  environmentSource: CredentialSource;
  webhookSecret: string | null;
  webhookSecretSource: CredentialSource;
};

/**
 * Resolves CoinVoyage credentials, checking the operator-editable Settings
 * row first and falling back to COIN_VOYAGE_* env vars. Re-resolved on every
 * call rather than cached, so a settings update is picked up immediately.
 * apiKey/apiSecret resolve as a pair (never mixed sources) to avoid a
 * mismatched-signature error from CoinVoyage. See coinflip-site/lib/coinvoyage.ts
 * for the full rationale -- this file is copied verbatim from that pattern.
 */
async function resolveRaw(): Promise<RawCredentials> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  const hasSettingsKeyPair = Boolean(
    settings?.coinVoyageApiKey || settings?.coinVoyageApiSecret
  );
  const keyPairSource: CredentialSource = hasSettingsKeyPair
    ? "settings"
    : process.env.COIN_VOYAGE_API_KEY || process.env.COIN_VOYAGE_API_SECRET
      ? "env"
      : "unset";
  const apiKey = hasSettingsKeyPair
    ? (settings?.coinVoyageApiKey ?? null)
    : (process.env.COIN_VOYAGE_API_KEY ?? null);
  const apiSecret = hasSettingsKeyPair
    ? (settings?.coinVoyageApiSecret ?? null)
    : (process.env.COIN_VOYAGE_API_SECRET ?? null);

  const environment = settings?.coinVoyageEnv || process.env.COIN_VOYAGE_ENV || null;
  const environmentSource: CredentialSource = settings?.coinVoyageEnv
    ? "settings"
    : process.env.COIN_VOYAGE_ENV
      ? "env"
      : "unset";

  const webhookSecret =
    settings?.coinVoyageWebhookSecret || process.env.COIN_VOYAGE_WEBHOOK_SECRET || null;
  const webhookSecretSource: CredentialSource = settings?.coinVoyageWebhookSecret
    ? "settings"
    : process.env.COIN_VOYAGE_WEBHOOK_SECRET
      ? "env"
      : "unset";

  return {
    apiKey,
    apiSecret,
    keyPairSource,
    environment,
    environmentSource,
    webhookSecret,
    webhookSecretSource,
  };
}

export async function resolveCredentialsForDisplay(): Promise<RawCredentials> {
  return resolveRaw();
}

type ResolvedCredentials = {
  apiKey: string;
  apiSecret: string;
  environment: APIEnvironment;
  webhookSecret: string | null;
};

async function resolveCredentials(): Promise<ResolvedCredentials> {
  const raw = await resolveRaw();
  const configureHint = "Configure it at /admin (Settings) or in .env -- see .env.example.";

  if (!raw.apiKey || !raw.apiSecret) {
    throw new Error(
      raw.keyPairSource === "settings"
        ? "CoinVoyage API key and secret must both be set in Settings once " +
          `either one is -- they're required as a pair. ${configureHint}`
        : `CoinVoyage API key/secret are not configured. ${configureHint}`
    );
  }
  if (!raw.environment || !isValidEnvironment(raw.environment)) {
    throw new Error(
      `CoinVoyage environment is missing or invalid ("${raw.environment ?? ""}") -- ` +
        `must be one of: ${VALID_ENVIRONMENTS.join(", ")}. This is required ` +
        "explicitly (no default) so a misconfigured deploy fails loudly instead " +
        `of silently routing real entries to the wrong environment. ${configureHint}`
    );
  }

  return {
    apiKey: raw.apiKey,
    apiSecret: raw.apiSecret,
    environment: raw.environment,
    webhookSecret: raw.webhookSecret,
  };
}

let cachedClient: { key: string; env: APIEnvironment; client: ReturnType<typeof ApiClient> } | undefined;

function clientFor(apiKey: string, environment: APIEnvironment) {
  if (!cachedClient || cachedClient.key !== apiKey || cachedClient.env !== environment) {
    cachedClient = { key: apiKey, env: environment, client: ApiClient({ apiKey, environment }) };
  }
  return cachedClient.client;
}

export async function coinvoyageClient() {
  const { apiKey, environment } = await resolveCredentials();
  return clientFor(apiKey, environment);
}

export async function coinvoyageCredentials(): Promise<{
  client: ReturnType<typeof ApiClient>;
  apiSecret: string;
}> {
  const { apiKey, apiSecret, environment } = await resolveCredentials();
  return { client: clientFor(apiKey, environment), apiSecret };
}

export async function coinvoyageWebhookSecret(): Promise<string> {
  const { webhookSecret } = await resolveCredentials();
  if (!webhookSecret) {
    throw new Error(
      "CoinVoyage webhook secret is not configured. Configure it at /admin " +
        "(Settings) or COIN_VOYAGE_WEBHOOK_SECRET in .env."
    );
  }
  return webhookSecret;
}
