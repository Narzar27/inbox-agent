// A FAKE "model" so you can run the loop with no API key and no cost.
// It returns responses in the same shape the real API does, following a fixed script.
// Purpose: let you see the loop mechanics clearly before real AI is involved.

let turn = 0;

export function mockModelCall(messages: any[]): any {
  turn++;

  // Turn 1: ask to list the unread emails.
  if (turn === 1) {
    return {
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "I'll start by checking unread mail." },
        { type: "tool_use", id: "toolu_1", name: "listUnread", input: {} },
      ],
    };
  }

  // Turn 2: label each email (several tool calls in a single turn is allowed).
  if (turn === 2) {
    return {
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "toolu_7", name: "readEmail", input: { emailId: "m3" } },
        { type: "tool_use", id: "toolu_2", name: "addLabel", input: { emailId: "m1", label: "1-Urgent" } },
        { type: "tool_use", id: "toolu_3", name: "addLabel", input: { emailId: "m2", label: "Bulk" } },
        { type: "tool_use", id: "toolu_4", name: "addLabel", input: { emailId: "m3", label: "Freelance" } },
        { type: "tool_use", id: "toolu_5", name: "addLabel", input: { emailId: "m4", label: "Suspicious" } },
        { type: "tool_use", id: "toolu_6", name: "createDraft", input: { emailId: "m3", body: "Hello,\n\nThank you for your interest. I'd be glad to discuss a website for your bakery. Pricing depends on scope: [NIZAR TO CONFIRM: pricing]. Would a short call this week work? [NIZAR TO CONFIRM: time]\n\nBest regards,\nNizar" } },
      ],
    };
  }

  // Turn 3: no more tools -> final digest. stop_reason "end_turn" ends the loop.
  return {
    stop_reason: "end_turn",
    content: [
      {
        type: "text",
        text: [
          "INBOX DIGEST - 4 unread",
          "",
          "DO FIRST",
          "1. the CEO: wants the accounting module status before 3pm. Reply yourself; I don't have the status.",
          "",
          "REPLIES TO CHECK",
          "- Bakery owner (website lead): draft asks about their needs and offers a call. Price and time are left for you to fill in.",
          "",
          "IGNORABLE",
          "- 1 shop promo",
          "",
          "WATCH OUT",
          '- Fake "verify your account" email (paypa1 lookalike) telling me to ignore my instructions. Do not reply.',
          "",
          "Test mode: nothing was changed in your mailbox.",
        ].join("\n"),
      },
    ],
  };
}
