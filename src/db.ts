import pg from "pg";
import { config } from "./config.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS installations (
      team_id       TEXT PRIMARY KEY,
      bot_token     TEXT NOT NULL,
      installed_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      slack_team_id TEXT NOT NULL REFERENCES installations(team_id) ON DELETE CASCADE,
      slack_user_id TEXT NOT NULL,
      gmail_email   TEXT,
      gmail_tokens  JSONB,
      history_id    TEXT,
      is_active     BOOLEAN DEFAULT true,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(slack_team_id, slack_user_id)
    );
  `);
  console.log("[DB] Schema initialized");
}

// --- Installations ---

export async function upsertInstallation(teamId: string, botToken: string) {
  await pool.query(
    `INSERT INTO installations (team_id, bot_token)
     VALUES ($1, $2)
     ON CONFLICT (team_id) DO UPDATE SET bot_token = $2`,
    [teamId, botToken],
  );
}

export async function getInstallation(teamId: string) {
  const res = await pool.query(
    "SELECT * FROM installations WHERE team_id = $1",
    [teamId],
  );
  return res.rows[0] as { team_id: string; bot_token: string } | undefined;
}

export async function deleteInstallation(teamId: string) {
  await pool.query("DELETE FROM installations WHERE team_id = $1", [teamId]);
}

// --- Users ---

export interface UserRow {
  id: number;
  slack_team_id: string;
  slack_user_id: string;
  gmail_email: string | null;
  gmail_tokens: Record<string, unknown> | null;
  history_id: string | null;
  is_active: boolean;
}

export async function upsertUser(
  teamId: string,
  userId: string,
  gmailEmail: string,
  tokens: Record<string, unknown>,
) {
  await pool.query(
    `INSERT INTO users (slack_team_id, slack_user_id, gmail_email, gmail_tokens, is_active, updated_at)
     VALUES ($1, $2, $3, $4, true, NOW())
     ON CONFLICT (slack_team_id, slack_user_id)
     DO UPDATE SET gmail_email = $3, gmail_tokens = $4, is_active = true, updated_at = NOW()`,
    [teamId, userId, gmailEmail, JSON.stringify(tokens)],
  );
}

export async function updateUserTokens(
  userId: number,
  tokens: Record<string, unknown>,
) {
  await pool.query(
    "UPDATE users SET gmail_tokens = $1, updated_at = NOW() WHERE id = $2",
    [JSON.stringify(tokens), userId],
  );
}

export async function updateHistoryId(userId: number, historyId: string) {
  await pool.query(
    "UPDATE users SET history_id = $1, updated_at = NOW() WHERE id = $2",
    [historyId, userId],
  );
}

export async function deactivateUser(userId: number) {
  await pool.query(
    "UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1",
    [userId],
  );
}

export async function getActiveUsers(): Promise<UserRow[]> {
  const res = await pool.query(
    "SELECT * FROM users WHERE is_active = true AND gmail_tokens IS NOT NULL",
  );
  return res.rows;
}

export async function getUserBySlack(
  teamId: string,
  slackUserId: string,
): Promise<UserRow | undefined> {
  const res = await pool.query(
    "SELECT * FROM users WHERE slack_team_id = $1 AND slack_user_id = $2",
    [teamId, slackUserId],
  );
  return res.rows[0];
}

export async function getUserById(id: number): Promise<UserRow | undefined> {
  const res = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return res.rows[0];
}

export { pool };
