import http from "node:http";
import { URL } from "node:url";
import { config } from "./config.js";
import { initDB } from "./db.js";
import { registerOAuthRoutes } from "./oauth.js";
import { slackApp } from "./slack.js";
import { startPoller } from "./poller.js";

const oauthRoutes = registerOAuthRoutes();

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

async function main() {
  // Initialize database schema
  await initDB();

  // Start Slack app (Socket Mode)
  await slackApp.start();
  console.log("[Slack] Connected via Socket Mode");

  // Start HTTP server for Google OAuth callback
  httpServer.listen(config.port, () => {
    console.log(`[HTTP] Running on http://localhost:${config.port}`);
  });

  // Start polling all active users
  startPoller();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
