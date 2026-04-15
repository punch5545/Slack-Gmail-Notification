import { google } from "googleapis";
import { readFile, writeFile } from "node:fs/promises";
import { config } from "./config.js";
import type { Credentials } from "google-auth-library";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { URL } from "node:url";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri,
  );
}

export const oauth2Client = createOAuth2Client();

export async function loadSavedToken(): Promise<boolean> {
  try {
    const content = await readFile(config.tokenPath, "utf-8");
    const credentials: Credentials = JSON.parse(content);
    oauth2Client.setCredentials(credentials);
    console.log("[OAuth] Loaded saved token");
    return true;
  } catch {
    return false;
  }
}

async function saveToken(credentials: Credentials) {
  await writeFile(config.tokenPath, JSON.stringify(credentials, null, 2));
  console.log("[OAuth] Token saved");
}

oauth2Client.on("tokens", async (tokens) => {
  const existing = oauth2Client.credentials;
  const merged = { ...existing, ...tokens };
  oauth2Client.setCredentials(merged);
  await saveToken(merged);
  console.log("[OAuth] Token refreshed and saved");
});

type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) => Promise<void>;

export function registerOAuthRoutes(): Map<string, RouteHandler> {
  const routes = new Map<string, RouteHandler>();

  routes.set("/auth/google", async (_req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
    });
    res.writeHead(302, { Location: url });
    res.end();
  });

  routes.set("/auth/google/callback", async (_req, res, url) => {
    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing authorization code");
      return;
    }
    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      await saveToken(tokens);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("Gmail authentication successful! You can close this tab.");
    } catch (err) {
      console.error("[OAuth] Token exchange failed:", err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Authentication failed");
    }
  });

  return routes;
}
