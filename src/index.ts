import http from "node:http";
import { URL } from "node:url";
import { config } from "./config.js";
import { loadSavedToken, registerOAuthRoutes } from "./oauth.js";
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

// Simple HTTP server for OAuth routes
const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${config.port}`);
  const handler = oauthRoutes.get(url.pathname);
  if (handler) {
    await handler(req, res, url);
  } else {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "running" }));
  }
});

const oauthRoutes = registerOAuthRoutes();

async function main() {
  // Start Slack app (Socket Mode)
  await slackApp.start();
  console.log("[Slack] Connected via Socket Mode");

  // Start HTTP server for OAuth
  httpServer.listen(config.port, () => {
    console.log(`[HTTP] Running on http://localhost:${config.port}`);
  });

  const hasToken = await loadSavedToken();
  if (hasToken) {
    await startPolling();
  } else {
    console.log(
      `[Auth] Visit http://localhost:${config.port}/auth/google to authenticate Gmail`,
    );

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
