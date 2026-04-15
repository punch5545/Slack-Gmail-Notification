import type { Installation, InstallationQuery } from "@slack/bolt";
import {
  upsertInstallation,
  getInstallation,
  deleteInstallation,
} from "./db.js";

export const installationStore = {
  storeInstallation: async (installation: Installation) => {
    const teamId =
      installation.team?.id ?? installation.enterprise?.id;
    if (!teamId) throw new Error("Missing team/enterprise ID");

    const botToken = installation.bot?.token;
    if (!botToken) throw new Error("Missing bot token");

    await upsertInstallation(teamId, botToken);
    console.log(`[Store] Installation saved for team ${teamId}`);
  },

  fetchInstallation: async (query: InstallationQuery<boolean>) => {
    const teamId =
      query.teamId ?? query.enterpriseId;
    if (!teamId) throw new Error("Missing team/enterprise ID in query");

    const row = await getInstallation(teamId);
    if (!row) throw new Error(`Installation not found for team ${teamId}`);

    return {
      team: { id: teamId },
      bot: {
        token: row.bot_token,
        scopes: ["chat:write", "im:write", "commands"],
        id: "",
        userId: "",
      },
    } as Installation;
  },

  deleteInstallation: async (query: InstallationQuery<boolean>) => {
    const teamId =
      query.teamId ?? query.enterpriseId;
    if (!teamId) throw new Error("Missing team/enterprise ID in query");

    await deleteInstallation(teamId);
    console.log(`[Store] Installation deleted for team ${teamId}`);
  },
};
