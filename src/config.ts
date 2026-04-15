import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN, // Only needed for single-workspace; multi-workspace uses DB tokens
    appToken: required("SLACK_APP_TOKEN"),
    clientId: required("SLACK_CLIENT_ID"),
    clientSecret: required("SLACK_CLIENT_SECRET"),
    signingSecret: required("SLACK_SIGNING_SECRET"),
    stateSecret: process.env.SLACK_STATE_SECRET || "gmail-slack-bot-state",
  },
  google: {
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET"),
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      "http://localhost:3195/auth/google/callback",
  },
  databaseUrl: required("DATABASE_URL"),
  pollInterval: Number(process.env.POLL_INTERVAL) || 30_000,
  port: Number(process.env.PORT) || 3195,
};
