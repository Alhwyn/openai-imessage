#!/usr/bin/env bun
/**
 * Fix agent.alhwyn.com tunnel routing:
 * - Ensure one tunnel owns the hostname ingress
 * - Ensure cloudflared cert is for the hostname's zone (alhwyn.com)
 * - Create the CNAME in the correct zone
 */
import { $ } from "bun";
import path from "node:path";

const root = path.join(import.meta.dir, "..");
const accountId = "d3d5b7c58e2d9b84d3f1d2af320dc73d";
const hostname = process.env.TUNNEL_HOSTNAME ?? "agent.alhwyn.com";
const tunnelName = process.env.TUNNEL_NAME ?? "webhook-automator";
const tunnelId = process.env.TUNNEL_ID ?? "22e507e3-a7e6-494f-b60c-f665415d409f";
const otherTunnelId = "2874637d-38ef-4a0e-8cea-d80df50f324d";
const expectedZoneName = hostname.split(".").slice(-2).join(".");
const alhwynZoneId = "c177c5e9e4c8cc19d3c05ec9a98ec313";
const port = process.env.AGENT_PORT ?? "4001";

type ArgoCert = { zoneID: string; accountID: string; apiToken: string };

async function readArgoCertAsync(): Promise<ArgoCert | null> {
  const certPath = path.join(process.env.HOME ?? "", ".cloudflared/cert.pem");
  if (!(await Bun.file(certPath).exists())) return null;
  const pem = await Bun.file(certPath).text();
  const b64 = pem
    .match(/-----BEGIN ARGO TUNNEL TOKEN-----\n([\s\S]*?)-----END/)?.[1]
    ?.replace(/\s/g, "");
  if (!b64) return null;
  return JSON.parse(Buffer.from(b64, "base64").toString()) as ArgoCert;
}

async function cfFetch<T>(
  token: string,
  apiPath: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/${apiPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const data = (await res.json()) as T;
  return { ok: res.ok, status: res.status, data };
}

async function zoneNameForId(token: string, zoneId: string): Promise<string | null> {
  const { data } = await cfFetch<{ result?: { id: string; name: string }[] }>(
    token,
    `zones?account.id=${accountId}&per_page=50`,
  );
  return data.result?.find((z) => z.id === zoneId)?.name ?? null;
}

async function dedupeTunnelIngress(apiToken: string): Promise<void> {
  const hostIngress = [
    { hostname, service: `http://127.0.0.1:${port}`, originRequest: {} },
    { service: "http_status:404", originRequest: {} },
  ];
  const emptyIngress = [{ service: "http_status:404", originRequest: {} }];

  const owner = await cfFetch<{ success: boolean }>(
    apiToken,
    `accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
    {
      method: "PUT",
      body: JSON.stringify({ config: { ingress: hostIngress } }),
    },
  );
  if (!owner.data.success) {
    console.error("Failed to set ingress on", tunnelName);
    process.exit(1);
  }

  await cfFetch(
    apiToken,
    `accounts/${accountId}/cfd_tunnel/${otherTunnelId}/configurations`,
    {
      method: "PUT",
      body: JSON.stringify({ config: { ingress: emptyIngress } }),
    },
  );

  console.log(`Ingress: ${hostname} -> ${tunnelName} only`);
}

async function ensureDnsCname(cert: ArgoCert): Promise<void> {
  const certZoneName = await zoneNameForId(cert.apiToken, cert.zoneID);
  if (certZoneName !== expectedZoneName && cert.zoneID !== alhwynZoneId) {
    console.error(
      `\ncloudflared is authorized for "${certZoneName ?? cert.zoneID}", but ${hostname} needs zone "${expectedZoneName}".`,
    );
    console.error("Run: cloudflared tunnel login");
    console.error("In the browser, select **alhwyn.com**, then re-run: bun run tunnel:fix\n");
    process.exit(1);
  }

  const zoneId = cert.zoneID === alhwynZoneId ? cert.zoneID : alhwynZoneId;
  const target = `${tunnelId}.cfargotunnel.com`;

  const list = await cfFetch<{
    success: boolean;
    result?: { id: string; type: string; name: string; content: string }[];
    errors?: { message: string }[];
  }>(cert.apiToken, `zones/${zoneId}/dns_records?name=${hostname}`);

  if (!list.data.success) {
    console.error("DNS API error:", list.data.errors?.[0]?.message);
    process.exit(1);
  }

  const records = list.data.result ?? [];
  const cname = records.find((r) => r.type === "CNAME");
  const conflicts = records.filter((r) => r.type === "A" || r.type === "AAAA");

  for (const record of conflicts) {
    console.log(`Deleting conflicting ${record.type} record for ${record.name}`);
    await cfFetch(cert.apiToken, `zones/${zoneId}/dns_records/${record.id}`, {
      method: "DELETE",
    });
  }

  if (cname?.content === target) {
    console.log(`DNS OK: ${hostname} -> ${target}`);
    return;
  }

  if (cname) {
    console.log(`Updating CNAME ${hostname} -> ${target}`);
    await cfFetch(cert.apiToken, `zones/${zoneId}/dns_records/${cname.id}`, {
      method: "PATCH",
      body: JSON.stringify({ type: "CNAME", name: "agent", content: target, proxied: true }),
    });
    return;
  }

  console.log(`Creating CNAME ${hostname} -> ${target}`);
  const created = await cfFetch<{ success: boolean; errors?: { message: string }[] }>(
    cert.apiToken,
    `zones/${zoneId}/dns_records`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "CNAME",
        name: "agent",
        content: target,
        proxied: true,
        ttl: 1,
      }),
    },
  );

  if (!created.data.success) {
    console.error("Failed to create DNS record:", created.data.errors?.[0]?.message);
    process.exit(1);
  }

  console.log(`DNS created: ${hostname} -> ${target}`);
}

async function cleanupWrongZoneRecord(cert: ArgoCert, wrongZoneName: string): Promise<void> {
  const wrongName = `${hostname}.${wrongZoneName}`;
  const list = await cfFetch<{
    success: boolean;
    result?: { id: string; name: string }[];
  }>(cert.apiToken, `zones/${cert.zoneID}/dns_records?name=${wrongName}`);

  for (const record of list.data.result ?? []) {
    console.log(`Removing misplaced DNS record: ${record.name}`);
    await cfFetch(cert.apiToken, `zones/${cert.zoneID}/dns_records/${record.id}`, {
      method: "DELETE",
    });
  }
}

async function verifyPublic(): Promise<void> {
  const res = await fetch(`https://${hostname}/`, { redirect: "follow" });
  console.log(`Probe https://${hostname}/ -> ${res.status}`);
  if (res.status >= 500 || res.status === 530) {
    console.warn("Still failing — ensure the app and `bun run tunnel` are running.");
  }
}

const cert = await readArgoCertAsync();
if (!cert) {
  console.error("Missing ~/.cloudflared/cert.pem. Run: cloudflared tunnel login");
  process.exit(1);
}

await dedupeTunnelIngress(cert.apiToken);

const certZone = await zoneNameForId(cert.apiToken, cert.zoneID);
if (certZone && certZone !== expectedZoneName) {
  await cleanupWrongZoneRecord(cert, certZone);
}

if (certZone === expectedZoneName || cert.zoneID === alhwynZoneId) {
  await ensureDnsCname(cert);
} else {
  console.error(
    `\nRe-authorize cloudflared for ${expectedZoneName}:\n  cloudflared tunnel login\nThen: bun run tunnel:fix\n`,
  );
  process.exit(1);
}

await $`bash ${path.join(root, "scripts/setup-tunnel.sh")}`.quiet();
await verifyPublic();
