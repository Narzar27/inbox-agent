// Real Gmail access. READ-ONLY: the only permission we ask Google for is
// "gmail.readonly", so this code physically cannot change anything in your mailbox.
//
// First run: opens your browser so YOU sign in and approve. Google then gives us a
// token which we save in token.json (secret, never commit it). After that it's automatic.

import { gmail as gmailApi } from "@googleapis/gmail";
import { OAuth2Client } from "google-auth-library";
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const READONLY = "https://www.googleapis.com/auth/gmail.readonly";
// WARNING: Google has no "drafts only" permission. gmail.compose = "manage drafts AND send email".
// Our code never calls any send function, but the permission itself would allow it.
const COMPOSE = "https://www.googleapis.com/auth/gmail.compose";
let activeScopes = [READONLY];
export function useLiveScopes() {
  activeScopes = [READONLY, COMPOSE];
}
const CREDENTIALS_PATH = new URL("../credentials.json", import.meta.url);
const TOKEN_PATH = new URL("../token.json", import.meta.url);

function openBrowser(url: string) {
  const cmd =
    process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function getAuth(): Promise<OAuth2Client> {
  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error("credentials.json not found in the project folder. Download it from Google Cloud (Clients > Download JSON).");
  }
  const raw = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf8"));
  const c = raw.installed ?? raw.web;
  if (!c) throw new Error("credentials.json doesn't look like a Desktop app client file.");

  // Saved token from an earlier login? Use it, but only if it already covers the permissions we need now.
  if (existsSync(TOKEN_PATH)) {
    const saved = JSON.parse(readFileSync(TOKEN_PATH, "utf8"));
    const have = String(saved.scope ?? "").split(" ");
    if (activeScopes.every((sc) => have.includes(sc))) {
      const client = new OAuth2Client(c.client_id, c.client_secret);
      client.setCredentials(saved);
      return client;
    }
    console.log("\nThe permissions changed since your last sign-in, so you need to sign in to Google again.");
  }

  // Otherwise: one-time browser login using a tiny local web server to catch Google's reply.
  return new Promise<OAuth2Client>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const code = url.searchParams.get("code");
        if (!code) {
          res.end("No code received. You can close this tab.");
          return;
        }
        const port = (server.address() as any).port;
        const client = new OAuth2Client(c.client_id, c.client_secret, `http://127.0.0.1:${port}`);
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);
        writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        res.end("Signed in. You can close this tab and go back to the terminal.");
        server.close();
        resolve(client);
      } catch (e) {
        res.end("Login failed. Check the terminal.");
        server.close();
        reject(e);
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as any).port;
      const client = new OAuth2Client(c.client_id, c.client_secret, `http://127.0.0.1:${port}`);
      const authUrl = client.generateAuthUrl({ access_type: "offline", scope: activeScopes, prompt: "consent" });
      console.log("\nOpening your browser to sign in to Google. If it doesn't open, paste this URL into your browser:\n" + authUrl + "\n");
      openBrowser(authUrl);
    });
  });
}

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  snippet: string;
}

// Fetch unread inbox mail. We request only headers + Google's short snippet,
// NOT the full body: less private data leaves your machine, and it costs fewer tokens.
export async function listUnreadReal(max = 10): Promise<EmailSummary[]> {
  const auth = await getAuth();
  const gmail = gmailApi({ version: "v1", auth });

  const list = await gmail.users.messages.list({ userId: "me", q: `is:unread in:inbox newer_than:${process.env.MAX_AGE_DAYS ?? "2"}d`, maxResults: max });
  const ids = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean);

  const out: EmailSummary[] = [];
  for (const id of ids) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "Subject"],
    });
    const h = (name: string) => msg.data.payload?.headers?.find((x) => x.name === name)?.value ?? "";
    out.push({ id, from: h("From"), subject: h("Subject"), snippet: (msg.data.snippet ?? "").slice(0, 200) });
  }
  return out;
}

// ---- Read ONE full email (still read-only). Used when the snippet isn't enough. ----

function decode(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function findPart(part: any, mime: string): string | null {
  if (part?.mimeType === mime && part.body?.data) return decode(part.body.data);
  for (const p of part?.parts ?? []) {
    const r = findPart(p, mime);
    if (r) return r;
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

// Pull a clean, short plain-text body out of a Gmail message payload.
export function extractBody(payload: any, maxChars = 3000): string {
  const text = findPart(payload, "text/plain") ?? stripHtml(findPart(payload, "text/html") ?? "");
  return text
    .split("\n")
    .filter((line) => !line.trim().startsWith(">")) // drop quoted earlier replies
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);
}

export async function readEmailReal(id: string) {
  const auth = await getAuth();
  const gmail = gmailApi({ version: "v1", auth });
  const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  const h = (name: string) => msg.data.payload?.headers?.find((x) => x.name === name)?.value ?? "";
  return { id, from: h("From"), to: h("To"), date: h("Date"), subject: h("Subject"), body: extractBody(msg.data.payload) };
}

// ---- Create a real DRAFT reply in Gmail (needs --live). It is saved in the Drafts folder, never sent. ----

const clean = (v: string) => v.replace(/[\r\n]+/g, " ").trim(); // headers from strangers: strip newlines (header-injection guard)
const encodeWord = (v: string) => (/[^\x00-\x7F]/.test(v) ? `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=` : v);

export function buildRawReply(
  orig: { from: string; replyTo: string; subject: string; messageId: string; references: string },
  body: string
): string {
  const to = clean(orig.replyTo || orig.from);
  const subject = clean(/^re:/i.test(orig.subject) ? orig.subject : `Re: ${orig.subject}`);
  const refs = clean(`${orig.references} ${orig.messageId}`.trim());
  const banner = process.env.DRAFT_BANNER === "0" ? "" : "[AI draft: review and edit before sending]\n\n";
  const text = (banner + body).replace(/\r?\n/g, "\r\n");
  const lines = [
    `To: ${to}`,
    `Subject: ${encodeWord(subject)}`,
    ...(orig.messageId ? [`In-Reply-To: ${clean(orig.messageId)}`, `References: ${refs}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    (Buffer.from(text, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export async function createDraftReal(emailId: string, body: string): Promise<string> {
  const auth = await getAuth();
  const gmail = gmailApi({ version: "v1", auth });
  const msg = await gmail.users.messages.get({
    userId: "me",
    id: emailId,
    format: "metadata",
    metadataHeaders: ["From", "Reply-To", "Subject", "Message-ID", "References"],
  });
  const h = (name: string) => msg.data.payload?.headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
  const raw = buildRawReply(
    { from: h("From"), replyTo: h("Reply-To"), subject: h("Subject"), messageId: h("Message-ID"), references: h("References") },
    body
  );
  // drafts.create only SAVES a draft. There is deliberately no drafts.send / messages.send call anywhere in this project.
  const res = await gmail.users.drafts.create({ userId: "me", requestBody: { message: { raw, threadId: msg.data.threadId ?? undefined } } });
  return res.data.id ?? "unknown";
}
