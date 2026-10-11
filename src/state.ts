// state.json = the agent's long-term memory between runs. It remembers which emails it has already
// handled, so a scheduled run never re-processes (and re-pays for) the same mail, and never drafts twice.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const STATE_PATH = new URL("../state.json", import.meta.url);

interface State {
  processed: Record<string, string>; // emailId -> ISO time handled
  drafted: Record<string, string>; // emailId -> Gmail draft id
}

function load(): State {
  if (!existsSync(STATE_PATH)) return { processed: {}, drafted: {} };
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { processed: {}, drafted: {} };
  }
}

function save(s: State) {
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

export const isProcessed = (id: string) => id in load().processed;
export const hasDrafted = (id: string) => id in load().drafted;

export function markProcessed(ids: string[]) {
  const s = load();
  const now = new Date().toISOString();
  for (const id of ids) s.processed[id] = now;
  save(s);
}

export function markDrafted(emailId: string, draftId: string) {
  const s = load();
  s.drafted[emailId] = draftId;
  save(s);
}
