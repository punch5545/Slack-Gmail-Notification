import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  slack: {
    botToken: required("SLACK_BOT_TOKEN"),
    appToken: required("SLACK_APP_TOKEN"),
    userId: required("SLACK_USER_ID"),
  },
  google: {
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET"),
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      "http://localhost:3195/auth/google/callback",
  },
  pollInterval: Number(process.env.POLL_INTERVAL) || 30_000,
  tokenPath: process.env.TOKEN_PATH || "google-token.json",
  port: Number(process.env.PORT) || 3195,
};
