import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "node:fs";
import { toolDefinitions, runTool, mode } from "./tools.js";
import { mockModelCall } from "./mockModel.js";

const MAX_STEPS = 15; // safety: a loop with no limit can run (and cost money) forever

// 1) Build the SYSTEM PROMPT from the three files. The model has no memory
//    between runs, so we hand it these instructions every single time.
function loadSystemPrompt(): string {
  const read = (f: string) => readFileSync(new URL(`../prompts/${f}`, import.meta.url), "utf8");
  // USER.md is private (git-ignored). If it doesn't exist, fall back to the generic example so the project still runs.
  const user = existsSync(new URL("../prompts/USER.md", import.meta.url)) ? read("USER.md") : read("USER.example.md");
  return [read("SOUL.md"), read("IDENTITY.md"), user].join("\n\n---\n\n");
}

// PROMPT CACHING: the instruction files + tool list are identical on every call, so we ask the API to
// cache them. Cached input is billed at a fraction of the normal price. We also mark the end of the
// conversation so each step only pays full price for what is NEW since the previous step.
export function withCacheMarker(msgs: any[]): any[] {
  return msgs.map((m, i) => {
    if (i !== msgs.length - 1) return m;
    const blocks =
      typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content.map((b: any) => ({ ...b }));
    blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" } };
    return { ...m, content: blocks };
  });
}

export async function runAgent(task: string, useMock: boolean): Promise<string | null> {
  const system = loadSystemPrompt();
  const client = useMock ? null : new Anthropic(); // reads ANTHROPIC_API_KEY from env

  // 2) `messages` is the whole conversation so far. It grows each turn.
  //    This list IS the agent's short-term memory.
  const messages: any[] = [{ role: "user", content: task }];
  let tokensIn = 0;
  let tokensOut = 0;
  let cacheWrite = 0;
  let cacheRead = 0;
  let digest: string | null = null;

  for (let step = 1; step <= MAX_STEPS; step++) {
    console.log(`\n--- step ${step}: asking the model ---`);

    // 3) Ask the model: "given everything so far, what next?"
    const response: any = useMock
      ? mockModelCall(messages)
      : await client!.messages.create({
          model: process.env.MODEL ?? "claude-sonnet-5-5",
          max_tokens: 3000,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          tools: toolDefinitions,
          messages: withCacheMarker(messages),
        });

    tokensIn += response.usage?.input_tokens ?? 0;
    tokensOut += response.usage?.output_tokens ?? 0;
    cacheWrite += response.usage?.cache_creation_input_tokens ?? 0;
    cacheRead += response.usage?.cache_read_input_tokens ?? 0;

    // 4) Save what the model said into the conversation.
    messages.push({ role: "assistant", content: response.content });

    const finished = response.stop_reason !== "tool_use";

    for (const block of response.content) {
      if (block.type !== "text") continue;
      if (finished) {
        // The final answer is the digest: show it clearly, set apart from the step-by-step log.
        console.log("\n==================== YOUR INBOX DIGEST ====================\n");
        // The model must not count emails itself (it gets this wrong). Force the header to the real number.
        const text =
          mode.lastUnreadCount === null
            ? block.text
            : block.text.replace(/^(INBOX DIGEST - )\d+( unread)/m, `$1${mode.lastUnreadCount}$2`);
        digest = text;
        console.log(text);
        console.log("\n===========================================================");
      } else {
        console.log(`[model] ${block.text}`);
      }
    }

    // 5) If the model didn't ask for a tool, it's finished. Exit the loop.
    if (finished) {
      if (tokensIn || tokensOut) {
        console.log(
          `\nTokens this run: ${tokensIn} new input, ${cacheWrite} cache-write, ${cacheRead} cache-read (cheap), ${tokensOut} output.` +
            `\nCheck the Console for the exact cost.`
        );
      }
      return digest;
    }

    // 6) The model asked for tool(s). WE run them (the model can't).
    //    Then we send the results back as the next message, and loop again.
    const results: any[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        console.log(`[model wants] ${block.name}(${JSON.stringify(block.input)})`);
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: await runTool(block.name, block.input),
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  console.log("Stopped: hit MAX_STEPS without finishing.");
  return null;
}
