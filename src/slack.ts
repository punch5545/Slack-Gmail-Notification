import {
  App,
  type BlockAction,
  type ButtonAction,
  type SlackCommandMiddlewareArgs,
} from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import { config } from "./config.js";
import { installationStore } from "./store.js";
import { buildGmailAuthUrl } from "./oauth.js";
import { markAsRead, buildGmailUrl, type EmailInfo } from "./gmail.js";
import { getUserById, getUserBySlack } from "./db.js";
import { createAuthedClient } from "./oauth.js";

export const slackApp = new App({
  socketMode: true,
  appToken: config.slack.appToken,
  clientId: config.slack.clientId,
  clientSecret: config.slack.clientSecret,
  signingSecret: config.slack.signingSecret,
  stateSecret: config.slack.stateSecret,
  installationStore,
  installerOptions: {
    directInstall: true,
  },
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

// --- /connect-gmail command ---

slackApp.command(
  "/connect-gmail",
  async ({ command, ack, client }: SlackCommandMiddlewareArgs & { client: WebClient }) => {
    await ack();

    const teamId = command.team_id;
    const userId = command.user_id;
    const authUrl = buildGmailAuthUrl(teamId, userId);

    await client.chat.postMessage({
      channel: userId,
      text: "Click the link below to connect your Gmail account:",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: ":envelope: *Connect your Gmail*\nClick the button to authorize Gmail notifications.",
          },
          accessory: {
            type: "button",
            text: { type: "plain_text", text: "Connect Gmail" },
            url: authUrl,
            style: "primary",
            action_id: "connect_gmail_link",
          },
        },
      ],
    });
  },
);

slackApp.action("connect_gmail_link", async ({ ack }) => {
  await ack();
});

// --- /disconnect-gmail command ---

slackApp.command(
  "/disconnect-gmail",
  async ({ command, ack, client }: SlackCommandMiddlewareArgs & { client: WebClient }) => {
    await ack();

    const user = await getUserBySlack(command.team_id, command.user_id);
    if (!user || !user.is_active) {
      await client.chat.postMessage({
        channel: command.user_id,
        text: "You don't have a connected Gmail account.",
      });
      return;
    }

    const { deactivateUser } = await import("./db.js");
    await deactivateUser(user.id);

    await client.chat.postMessage({
      channel: command.user_id,
      text: `:white_check_mark: Gmail notifications disabled for ${user.gmail_email}. Use \`/connect-gmail\` to reconnect.`,
    });
  },
);

// --- Send email notification ---

export async function sendEmailNotification(
  botToken: string,
  slackUserId: string,
  dbUserId: number,
  email: EmailInfo,
) {
  const client = new WebClient(botToken);
  const gmailUrl = buildGmailUrl(email.userEmail, email.threadId);

  await client.chat.postMessage({
    channel: slackUserId,
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
            value: `${dbUserId}:${email.id}`,
          },
        ],
      },
    ],
  });
}

// --- Button handlers ---

slackApp.action("open_gmail", async ({ ack }) => {
  await ack();
});

slackApp.action<BlockAction<ButtonAction>>(
  "mark_as_read",
  async ({ ack, action, body, client }) => {
    await ack();

    const value = action.value;
    if (!value) return;

    const [userIdStr, messageId] = value.split(":");
    const dbUserId = Number(userIdStr);
    if (!dbUserId || !messageId) return;

    try {
      const user = await getUserById(dbUserId);
      if (!user?.gmail_tokens) return;

      const auth = createAuthedClient(user.gmail_tokens);
      await markAsRead(auth, messageId);

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
