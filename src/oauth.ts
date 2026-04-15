import { google } from "googleapis";
import { config } from "./config.js";
import { upsertUser } from "./db.js";
import type { OAuth2Client } from "google-auth-library";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { URL } from "node:url";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

export function createOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri,
  );
}

export function createAuthedClient(tokens: Record<string, unknown>): OAuth2Client {
  const client = createOAuth2Client();
  client.setCredentials(tokens);
  return client;
}

/** Build a Gmail OAuth URL with Slack identity encoded in state */
export function buildGmailAuthUrl(teamId: string, userId: string): string {
  const client = createOAuth2Client();
  const state = Buffer.from(JSON.stringify({ teamId, userId })).toString(
    "base64url",
  );
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state,
  });
}

type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) => Promise<void>;

export function registerOAuthRoutes(): Map<string, RouteHandler> {
  const routes = new Map<string, RouteHandler>();

  routes.set("/auth/google/callback", async (_req, res, url) => {
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");

    if (!code || !stateParam) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing authorization code or state");
      return;
    }

    let teamId: string;
    let userId: string;
    try {
      const decoded = JSON.parse(
        Buffer.from(stateParam, "base64url").toString(),
      );
      teamId = decoded.teamId;
      userId = decoded.userId;
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Invalid state parameter");
      return;
    }

    try {
      const client = createOAuth2Client();
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);

      // Get the user's email
      const gmail = google.gmail({ version: "v1", auth: client });
      const profile = await gmail.users.getProfile({ userId: "me" });
      const email = profile.data.emailAddress ?? "";

      // Save to DB
      await upsertUser(teamId, userId, email, tokens as Record<string, unknown>);

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<h2>Gmail connected!</h2><p>${email} is now linked. You'll receive Slack DMs for new emails. You can close this tab.</p>`,
      );
      console.log(`[OAuth] Gmail connected: ${email} (team=${teamId}, user=${userId})`);
    } catch (err) {
      console.error("[OAuth] Token exchange failed:", err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Authentication failed");
    }
  });

  return routes;
}
