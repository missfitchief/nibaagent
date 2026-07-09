import "server-only";
import { resolvePlatform } from "./platform";

/**
 * Resolved Meta configuration status for the admin "Meta konfiguracija" panel
 * and the Connect button. Everything is resolved DB (platform_settings) → env →
 * missing, so a value set in /admin/settings enables the flow even when no env
 * var exists. Never returns secret plaintext — only whether it is set + source.
 */
export interface MetaConfigCheck {
  items: { key: string; label: string; set: boolean; source: "db" | "env" | "missing"; value?: string }[];
  appUrl: string;
  callbackUrl: string;
  webhookUrl: string;
  dataDeletionUrl: string;
  mode: string;
  requireSignature: boolean;
  /** appId + appSecret both present → one-click OAuth can start. */
  ready: boolean;
}

export async function metaConfigCheck(): Promise<MetaConfigCheck> {
  const [appId, appSecret, verifyToken, appUrlR, mode, reqSig] = await Promise.all([
    resolvePlatform("META_APP_ID"),
    resolvePlatform("META_APP_SECRET"),
    resolvePlatform("META_VERIFY_TOKEN"),
    resolvePlatform("APP_URL"),
    resolvePlatform("META_MODE"),
    resolvePlatform("META_REQUIRE_SIGNATURE")
  ]);
  const appUrl = (appUrlR.value || "http://localhost:3000").replace(/\/$/, "");
  return {
    items: [
      // non-secret: show the actual value; secret: only set/source
      { key: "META_APP_ID", label: "Meta App ID", set: Boolean(appId.value), source: appId.source, value: appId.value || undefined },
      { key: "META_APP_SECRET", label: "Meta App Secret", set: Boolean(appSecret.value), source: appSecret.source },
      { key: "META_VERIFY_TOKEN", label: "Verify Token", set: Boolean(verifyToken.value), source: verifyToken.source },
      { key: "APP_URL", label: "APP_URL", set: Boolean(appUrlR.value), source: appUrlR.source, value: appUrlR.value || undefined }
    ],
    appUrl,
    callbackUrl: `${appUrl}/api/meta/callback`,
    webhookUrl: `${appUrl}/api/meta/webhook`,
    dataDeletionUrl: `${appUrl}/api/meta/data-deletion`,
    mode: mode.value || "live",
    requireSignature: reqSig.value !== "false",
    ready: Boolean(appId.value && appSecret.value)
  };
}
