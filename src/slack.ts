import { App, ExpressReceiver, type BlockAction, type ButtonAction } from "@slack/bolt";
import { config } from "./config.js";
import { markAsRead, buildGmailUrl, type EmailInfo } from "./gmail.js";
import { registerOAuthRoutes } from "./oauth.js";

const receiver = new ExpressReceiver({
  signingSecret: "unused",
  endpoints: "/slack/events",
});

// Register Google OAuth routes
registerOAuthRoutes(receiver.router);

// Health endpoint
receiver.router.get("/", (_req, res) => {
  res.json({ status: "running", authUrl: "/auth/google" });
});

export const slackApp = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  socketMode: true,
  receiver,
});

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "\u2026";
}

function escapeMarkdown(text: string): string {
  return text.replace(/[&<>]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;",
  );
}

export async function sendEmailNotification(email: EmailInfo) {
  const gmailUrl = buildGmailUrl(email.userEmail, email.threadId);

  await slackApp.client.chat.postMessage({
    channel: config.slack.userId,
    text: `New email from ${email.from}: ${email.subject}`,
    unfurl_links: false,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${escapeMarkdown(email.subject)}*`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `From: *${escapeMarkdown(email.from)}*  \u2022  ${email.date}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: truncate(email.snippet, 300),
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Open in Gmail" },
            url: gmailUrl,
            style: "primary",
            action_id: "open_gmail",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Mark as Read" },
            action_id: "mark_as_read",
            value: email.id,
          },
        ],
      },
    ],
  });
}

// Handle "Open in Gmail" button clicks (URL button - Slack requires a handler)
slackApp.action("open_gmail", async ({ ack }) => {
  await ack();
});

// Handle "Mark as Read" button clicks
slackApp.action<BlockAction<ButtonAction>>(
  "mark_as_read",
  async ({ ack, action, body, client }) => {
    await ack();

    const messageId = action.value;
    if (!messageId) return;

    try {
      await markAsRead(messageId);

      if (body.message && body.channel) {
        const originalBlocks = body.message.blocks as unknown[];
        const updatedBlocks = originalBlocks.map((block: unknown) => {
          const b = block as { type: string };
          if (b.type === "actions") {
            return {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: ":white_check_mark: Marked as read",
                },
              ],
            };
          }
          return block;
        });

        await client.chat.update({
          channel: body.channel.id,
          ts: body.message.ts as string,
          blocks: updatedBlocks as [],
          text: "Email marked as read",
        });
      }
    } catch (err) {
      console.error("[Slack] Failed to mark as read:", err);
    }
  },
);
