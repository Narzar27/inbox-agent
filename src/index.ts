import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { runAgent } from "./agent.js";
import { mode, fetchNewEmails } from "./tools.js";
import { useLiveScopes } from "./gmail.js";
import { markProcessed } from "./state.js";

// Modes:  --mock  fake model, fake emails     --gmail  real emails, read-only, dry run
//         --live  real emails + real DRAFTS saved in Gmail (never sends)
const useMock = process.argv.includes("--mock");
mode.live = process.argv.includes("--live");
mode.gmail = process.argv.includes("--gmail") || mode.live;
if (mode.live) useLiveScopes();

if (mode.live) console.log("LIVE MODE: reading your real inbox and saving real DRAFTS in Gmail. Nothing is sent. Labels are not applied yet.");
else if (mode.gmail) console.log("GMAIL MODE: reading your real inbox (read-only). Labels and drafts are dry run only.");
console.log(useMock ? "Running with the FAKE model (no API key, no cost)." : "Running with the real Claude API.");

try {
  // Check for new mail BEFORE paying for any AI call. A scheduled run with nothing new costs nothing.
  if (mode.gmail) {
    const fresh = await fetchNewEmails();
    if (fresh.length === 0) {
      console.log("No new unread emails. Nothing to do (no AI call was made).");
      process.exit(0);
    }
    console.log(`${fresh.length} new email(s) to triage.`);
  }

  const digest = await runAgent(
    "Triage the unread inbox. Give every email a priority label and, if it fits, a category label. If a snippet is not enough to understand an email, use readEmail on it. For emails that need a reply and are not in an escalation category from SOUL.md, create a draft reply with createDraft. Finish with the digest in the exact format from IDENTITY.md. Do not take any other action.",
    useMock
  );

  if (mode.live && digest) {
    mkdirSync(new URL("../digests/", import.meta.url), { recursive: true });
    const file = new URL(`../digests/digest-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`, import.meta.url);
    writeFileSync(file, digest);
    markProcessed((mode.cache ?? []).map((e) => e.id));
    console.log("\nDigest saved in the digests folder. These emails are now marked as handled.");
  }
} catch (e: any) {
  const msg = String(e?.message ?? e);
  if (msg.includes("invalid_grant")) {
    console.error("\nGoogle says your sign-in expired or was revoked. Delete token.json and run again to sign in.");
    process.exit(1);
  }
  throw e;
}
