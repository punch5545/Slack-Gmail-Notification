import { config } from "./config.js";
import { loadSavedToken } from "./oauth.js";
import { initPolling, checkNewEmails } from "./gmail.js";
import { slackApp, sendEmailNotification } from "./slack.js";

let pollingTimer: ReturnType<typeof setInterval> | null = null;

async function startPolling() {
  if (pollingTimer) return;

  await initPolling();
  console.log(`[Polling] Started (every ${config.pollInterval / 1000}s)`);

  pollingTimer = setInterval(async () => {
    try {
      const newEmails = await checkNewEmails();
      for (const email of newEmails) {
        console.log(`[New Email] From: ${email.from} | Subject: ${email.subject}`);
        await sendEmailNotification(email);
      }
    } catch (err) {
      console.error("[Polling] Error:", err);
    }
  }, config.pollInterval);
}

async function main() {
  await slackApp.start(config.port);
  console.log(`[Server] Running on http://localhost:${config.port}`);

  const hasToken = await loadSavedToken();
  if (hasToken) {
    await startPolling();
  } else {
    console.log(
      `[Auth] Visit http://localhost:${config.port}/auth/google to authenticate Gmail`,
    );

    // Poll for token file until OAuth completes
    const check = setInterval(async () => {
      const loaded = await loadSavedToken();
      if (loaded) {
        clearInterval(check);
        await startPolling();
      }
    }, 2000);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
