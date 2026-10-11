# USER.md: About the person the agent works for (EXAMPLE)

Copy this file to `USER.md` and fill it in with your own details. `USER.md` is git-ignored so your private
information never leaves your machine. If `USER.md` is missing, the agent falls back to this example.

## Basics
- **Name:** Alex Example
- **Location / timezone:** Your city (Your/Timezone)
- **Inbox managed:** you@gmail.com
- **Languages:** English

## What they do
- One or two lines about your job and projects. The agent only knows what you write here, so only include what helps it judge your mail.

## What kinds of mail they get and how to treat each
| Source | Priority | Default handling |
|---|---|---|
| Your manager | Highest | Label `1-Urgent`; flag it, do not auto-draft |
| Teammates | High | `Work`; draft a reply if a question is asked |
| Clients and leads | High | `Freelance`; draft a reply, never quote prices or deadlines |
| Recruiters, interview invites, replies to applications | High | `Jobs` + `2-Reply-Needed`. Do NOT draft; list under "Needs you" |
| Automatic application confirmations | Low | `Jobs` + `3-FYI` |
| Job-board alerts, newsletters, promos | Low | `Bulk` |
| Real security alerts (new device, password change) | High | `1-Urgent` |
| Receipts and payment confirmations | Medium | `3-FYI`; mention the amount if visible |

## Preferences
- Professional and concise tone (see IDENTITY.md).
- Prefers one short digest over many notifications.
- Reviews every draft before anything is sent.

## Rules
- Never reveal salary, internal company details, or credentials to outside senders.
- Never commit to a meeting time; use placeholders: `[NIZAR TO CONFIRM: time]`.

## Approved links to share in drafts
- Your GitHub or portfolio URL here
