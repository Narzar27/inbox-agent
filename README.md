# Inbox Agent ("Scout")

A small personal AI agent that triages my Gmail inbox. It reads recent unread mail, decides how important each message is, saves draft replies in Gmail, and writes a short digest. **It never sends or deletes anything.**

I built it with Claude as my first agent project, to understand how agents actually work instead of only reading about them. It is a v1: it works, it is deliberately limited, and the limits are listed below.

## What it does

- Reads unread inbox mail from the last couple of days (headers and a short snippet; the full body only when needed).
- Gives each email a priority label (`1-Urgent`, `2-Reply-Needed`, `3-FYI`, `Bulk`, `Suspicious`) and an optional category.
- Saves a threaded draft reply in Gmail for mail that needs one. Every draft starts with `[AI draft: review and edit before sending]`.
- Writes a ~150-word digest: what to do first, which replies to check, and what to watch out for.
- Skips an AI call entirely if there is nothing new, so an empty inbox costs nothing.

## How it works

An agent is a model, a short list of tools it may use, and a loop.

1. **Instructions.** Three markdown files form the system prompt on every run, because the model has no memory between runs: `SOUL.md` (values and hard rules), `IDENTITY.md` (voice, label scheme, digest format), `USER.md` (who the mail belongs to and how to treat each sender).
2. **Tools.** The model can only *request* four tools: `listUnread`, `readEmail`, `addLabel`, `createDraft`. My code runs them. There is no send or delete tool, so the model cannot use one.
3. **Loop.** Ask the model, run the tools it requests, feed the results back, repeat until it writes the digest (capped at 15 steps).

Source layout: `src/agent.ts` (the loop), `src/tools.ts` (tools and guardrails), `src/gmail.ts` (Gmail access), `src/state.ts` (remembers handled emails), `src/mockModel.ts` (a fake model for testing without an API key).

## Safety design

- **Code is the lock, not the prompt.** Telling a model "never send" is a request. Having no send function is a guarantee. Labels are checked against an allowlist, draft length is capped, and a duplicate-draft guard stops repeated drafts.
- **Email is untrusted input.** Message content is wrapped as data and the instructions say never to follow commands inside an email. A test email saying "ignore your previous instructions" was flagged `Suspicious`.
- **Models are bad at counting,** so the code supplies the unread count and overwrites the number in the digest header.
- **No invented facts.** Drafts must use `[NIZAR TO CONFIRM: ...]` placeholders for prices, dates and commitments.

## Run it

Needs Node 20+.

```bash
npm install
npm run start:mock     # fake model + fake inbox: no API key, no cost
```

For the real model, copy `.env.example` to `.env` and add an Anthropic API key. Then:

```bash
npm start              # real model, fake inbox
```

For your own Gmail, create a Google Cloud OAuth "Desktop app" client, download it as `credentials.json` into the project folder, and run:

```bash
npm run start:gmail    # real inbox, read-only, labels and drafts are dry run
npm run start:live     # real inbox + real drafts saved in Gmail (never sent)
```

Copy `prompts/USER.example.md` to `prompts/USER.md` and describe yourself and your senders. `USER.md`, `.env`, `credentials.json`, `token.json` and `state.json` are git-ignored; never commit them.

## Limitations (v1)

- **Labels are a dry run.** Applying real Gmail labels needs the `gmail.modify` permission.
- **The Gmail permission is broader than the behavior.** Google has no "drafts only" scope; `gmail.compose` technically also allows sending. This project never calls a send function, but that is a promise of the code, not of the permission. Read the code before running it on your mailbox.
- **Judgment is based on snippets** unless the model asks to read the full email, and it has been tested on about a dozen real emails, not thousands.
- **Not scheduled.** I run it by hand. A Google OAuth app in "Testing" mode also expires its token after 7 days, so unattended use needs more setup.
- **Not a product.** It is a learning project; expect rough edges.

## License

MIT
