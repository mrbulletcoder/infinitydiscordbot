const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
} = require("discord.js");

const { pool } = require("../../database");
const automodCache = require("../../utils/automod");
const { safeReply } = require("../../handlers/interactions/safeReply");

async function ensureAutomodConfig(guildId) {
    await pool.query(
        `INSERT INTO automod_config (guild_id)
         VALUES (?)
         ON DUPLICATE KEY UPDATE guild_id = guild_id`,
        [guildId],
    );
}

module.exports = {
    name: "automod",
    description: "Configure and manage the server’s automod settings.",
    usage: "/automod",
    userPermissions: PermissionFlagsBits.Administrator,
    botPermissions: [PermissionFlagsBits.EmbedLinks],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName("automod")
        .setDescription("Configure automod system")
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("Feature to configure")
                .setRequired(false)
                .addChoices(
                    { name: "spam", value: "spam" },
                    { name: "links", value: "links" },
                    { name: "invites", value: "invites" },
                    { name: "caps", value: "caps" },
                    { name: "filter", value: "filter" },
                ),
        )
        .addStringOption((option) =>
            option
                .setName("state")
                .setDescription("Enable or disable")
                .setRequired(false)
                .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" }),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        const guildId = interaction.guild.id;
        const type = interaction.options.getString("type");
        const state = interaction.options.getString("state");

        await ensureAutomodConfig(guildId);

        const [rows] = await pool.query(
            `SELECT spam_enabled, links_enabled, invites_enabled, caps_enabled, filter_enabled
            FROM automod_config
            WHERE guild_id = ?`,
            [guildId],
        );

        const settings = rows[0] || {
            spam_enabled: 1,
            links_enabled: 1,
            invites_enabled: 1,
            caps_enabled: 1,
            filter_enabled: 1,
        };

        if (!type || !state) {
            const embed = new EmbedBuilder()
                .setTitle("🤖 AutoMod Settings")
                .setColor("#00bfff")
                .addFields(
                    {
                        name: "🚫 Spam",
                        value: settings.spam_enabled ? "🟢 Enabled" : "🔴 Disabled",
                        inline: true,
                    },
                    {
                        name: "🔗 Links",
                        value: settings.links_enabled ? "🟢 Enabled" : "🔴 Disabled",
                        inline: true,
                    },
                    {
                        name: "📨 Invites",
                        value: settings.invites_enabled ? "🟢 Enabled" : "🔴 Disabled",
                        inline: true,
                    },
                    {
                        name: "🔊 Caps",
                        value: settings.caps_enabled ? "🟢 Enabled" : "🔴 Disabled",
                        inline: true,
                    },
                    {
                        name: "🚫 Word Filter",
                        value: settings.filter_enabled ? "🟢 Enabled" : "🔴 Disabled",
                        inline: true,
                    },
                )
                .setFooter({ text: "Infinity AutoMod System" })
                .setTimestamp();

            return safeReply(interaction, { embeds: [embed] }, true);
        }

        const fieldMap = {
            spam: "spam_enabled",
            links: "links_enabled",
            invites: "invites_enabled",
            caps: "caps_enabled",
            filter: "filter_enabled",
        };

        const field = fieldMap[type];
        const enabled = state === "on" ? 1 : 0;

        await pool.query(
            `UPDATE automod_config
             SET ${field} = ?
             WHERE guild_id = ?`,
            [enabled, guildId],
        );

        automodCache.invalidateAutomodCache(guildId);

        const embed = new EmbedBuilder()
            .setTitle("⚙️ AutoMod Updated")
            .setColor("#00ff00")
            .setDescription(
                `**${type.toUpperCase()}** is now ${enabled ? "🟢 Enabled" : "🔴 Disabled"}`,
            )
            .setFooter({ text: "Infinity AutoMod System" })
            .setTimestamp();

        return safeReply(interaction, { embeds: [embed] }, true);
    },
};
