import { google, type gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

export interface EmailInfo {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  userEmail: string;
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  return (
    headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    ""
  );
}

async function getMessageDetail(
  gmail: gmail_v1.Gmail,
  messageId: string,
  userEmail: string,
): Promise<EmailInfo> {
  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["From", "Subject", "Date"],
  });

  const headers = msg.data.payload?.headers;

  return {
    id: messageId,
    threadId: msg.data.threadId ?? messageId,
    from: getHeader(headers, "From"),
    subject: getHeader(headers, "Subject") || "(no subject)",
    snippet: msg.data.snippet ?? "",
    date: getHeader(headers, "Date"),
    userEmail,
  };
}

export async function getInitialHistoryId(
  auth: OAuth2Client,
): Promise<{ historyId: string; email: string }> {
  const gmail = google.gmail({ version: "v1", auth });
  const profile = await gmail.users.getProfile({ userId: "me" });
  return {
    historyId: profile.data.historyId ?? "",
    email: profile.data.emailAddress ?? "",
  };
}

export async function checkNewEmails(
  auth: OAuth2Client,
  userEmail: string,
  lastHistoryId: string,
): Promise<{ emails: EmailInfo[]; newHistoryId: string }> {
  const gmail = google.gmail({ version: "v1", auth });

  const history = await gmail.users.history.list({
    userId: "me",
    startHistoryId: lastHistoryId,
    historyTypes: ["messageAdded"],
  });

  const newHistoryId = history.data.historyId ?? lastHistoryId;
  const emails: EmailInfo[] = [];
  const seenIds = new Set<string>();

  for (const record of history.data.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      const msg = added.message;
      if (!msg?.id || seenIds.has(msg.id)) continue;

      const labels = msg.labelIds ?? [];
      if (labels.includes("SENT") || labels.includes("DRAFT")) continue;
      if (!labels.includes("INBOX")) continue;

      seenIds.add(msg.id);
      const detail = await getMessageDetail(gmail, msg.id, userEmail);
      emails.push(detail);
    }
  }

  return { emails, newHistoryId };
}

export async function markAsRead(
  auth: OAuth2Client,
  messageId: string,
): Promise<void> {
  const gmail = google.gmail({ version: "v1", auth });
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
