import { config } from "./config.js";
import {
  getActiveUsers,
  getInstallation,
  updateHistoryId,
  updateUserTokens,
  deactivateUser,
  type UserRow,
} from "./db.js";
import { createAuthedClient } from "./oauth.js";
import {
  checkNewEmails,
  getInitialHistoryId,
  type EmailInfo,
} from "./gmail.js";
import { sendEmailNotification } from "./slack.js";

async function pollUser(user: UserRow) {
  if (!user.gmail_tokens || !user.gmail_email) return;

  const auth = createAuthedClient(user.gmail_tokens);

  // Auto-save refreshed tokens
  auth.on("tokens", async (tokens) => {
    const merged = { ...user.gmail_tokens, ...tokens };
    await updateUserTokens(user.id, merged);
  });

  // Initialize historyId if not set
  if (!user.history_id) {
    try {
      const { historyId } = await getInitialHistoryId(auth);
      await updateHistoryId(user.id, historyId);
      user.history_id = historyId;
      console.log(`[Poller] Initialized historyId for ${user.gmail_email}`);
      return; // Skip first poll to avoid flood
    } catch (err) {
      console.error(`[Poller] Failed to init ${user.gmail_email}:`, err);
      return;
    }
  }

  try {
    const { emails, newHistoryId } = await checkNewEmails(
      auth,
      user.gmail_email,
      user.history_id,
    );

    if (newHistoryId !== user.history_id) {
      await updateHistoryId(user.id, newHistoryId);
    }

    // Get bot token for this team
    const installation = await getInstallation(user.slack_team_id);
    if (!installation) return;

    for (const email of emails) {
      console.log(
        `[New Email] ${user.gmail_email} | From: ${email.from} | Subject: ${email.subject}`,
      );
      await sendEmailNotification(
        installation.bot_token,
        user.slack_user_id,
        user.id,
        email,
      );
    }
  } catch (err: unknown) {
    const error = err as { code?: number; message?: string };

    if (error.code === 404) {
      // historyId expired
      try {
        const { historyId } = await getInitialHistoryId(auth);
        await updateHistoryId(user.id, historyId);
        console.log(`[Poller] Re-initialized historyId for ${user.gmail_email}`);
      } catch {
        console.error(`[Poller] Failed to re-init ${user.gmail_email}`);
      }
    } else if (error.code === 401 || error.code === 403) {
      console.error(
        `[Poller] Auth failed for ${user.gmail_email}, deactivating`,
      );
      await deactivateUser(user.id);
    } else {
      console.error(`[Poller] Error for ${user.gmail_email}:`, err);
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startPoller() {
  if (timer) return;

  console.log(`[Poller] Started (every ${config.pollInterval / 1000}s)`);

  timer = setInterval(async () => {
    try {
      const users = await getActiveUsers();
      await Promise.allSettled(users.map(pollUser));
    } catch (err) {
      console.error("[Poller] Error fetching users:", err);
    }
  }, config.pollInterval);
}
