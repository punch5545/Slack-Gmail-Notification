import { google, type gmail_v1 } from "googleapis";
import { oauth2Client } from "./oauth.js";

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

export interface EmailInfo {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  userEmail: string;
}

let lastHistoryId: string | null = null;
let userEmail: string | null = null;

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function getUserEmail(): Promise<string> {
  if (userEmail) return userEmail;
  const profile = await gmail.users.getProfile({ userId: "me" });
  userEmail = profile.data.emailAddress ?? "";
  return userEmail;
}

async function getMessageDetail(messageId: string): Promise<EmailInfo> {
  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["From", "Subject", "Date"],
  });

  const headers = msg.data.payload?.headers;
  const email = await getUserEmail();

  return {
    id: messageId,
    threadId: msg.data.threadId ?? messageId,
    from: getHeader(headers, "From"),
    subject: getHeader(headers, "Subject") || "(no subject)",
    snippet: msg.data.snippet ?? "",
    date: getHeader(headers, "Date"),
    userEmail: email,
  };
}

export async function initPolling(): Promise<void> {
  const profile = await gmail.users.getProfile({ userId: "me" });
  lastHistoryId = profile.data.historyId ?? null;
  userEmail = profile.data.emailAddress ?? null;
  console.log(`[Gmail] Polling initialized for ${userEmail}, historyId: ${lastHistoryId}`);
}

export async function checkNewEmails(): Promise<EmailInfo[]> {
  if (!lastHistoryId) {
    await initPolling();
    return [];
  }

  try {
    const history = await gmail.users.history.list({
      userId: "me",
      startHistoryId: lastHistoryId,
      historyTypes: ["messageAdded"],
    });

    if (history.data.historyId) {
      lastHistoryId = history.data.historyId;
    }

    const newMessages: EmailInfo[] = [];
    const seenIds = new Set<string>();

    for (const record of history.data.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        const msg = added.message;
        if (!msg?.id || seenIds.has(msg.id)) continue;

        // Skip messages in SENT or DRAFT
        const labels = msg.labelIds ?? [];
        if (labels.includes("SENT") || labels.includes("DRAFT")) continue;

        // Only process INBOX messages
        if (!labels.includes("INBOX")) continue;

        seenIds.add(msg.id);
        const detail = await getMessageDetail(msg.id);
        newMessages.push(detail);
      }
    }

    return newMessages;
  } catch (err: unknown) {
    const error = err as { code?: number };
    if (error.code === 404) {
      // historyId expired, re-initialize
      console.log("[Gmail] History expired, re-initializing...");
      await initPolling();
      return [];
    }
    throw err;
  }
}

export async function markAsRead(messageId: string): Promise<void> {
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      removeLabelIds: ["UNREAD"],
    },
  });
}

export function buildGmailUrl(email: string, messageId: string): string {
  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}#inbox/${messageId}`;
}
