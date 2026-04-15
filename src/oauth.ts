import { google } from "googleapis";
import { readFile, writeFile } from "node:fs/promises";
import { config } from "./config.js";
import type { Credentials } from "google-auth-library";
import type { Router } from "express";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://mail.google.com/",
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
    console.log("[OAuth] No saved token found. Visit /auth/google to authenticate.");
    return false;
  }
}

async function saveToken(credentials: Credentials) {
  await writeFile(config.tokenPath, JSON.stringify(credentials, null, 2));
  console.log("[OAuth] Token saved");
}

// Listen for token refresh and save automatically
oauth2Client.on("tokens", async (tokens) => {
  const existing = oauth2Client.credentials;
  const merged = { ...existing, ...tokens };
  oauth2Client.setCredentials(merged);
  await saveToken(merged);
  console.log("[OAuth] Token refreshed and saved");
});

export function registerOAuthRoutes(router: Router) {
  router.get("/auth/google", (_req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
    });
    res.redirect(url);
  });

  router.get("/auth/google/callback", async (req, res) => {
    const code = req.query.code as string | undefined;
    if (!code) {
      res.status(400).send("Missing authorization code");
      return;
    }
    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      await saveToken(tokens);
      res.send("Gmail authentication successful! You can close this tab.");
    } catch (err) {
      console.error("[OAuth] Token exchange failed:", err);
      res.status(500).send("Authentication failed");
    }
  });
}
