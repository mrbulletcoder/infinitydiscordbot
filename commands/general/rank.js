const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const {
    getRankCardData,
    buildRankCardAttachment,
    getRankSettings,
} = require("../../utils/rank");

const {
    safeReply,
    safeDefer,
} = require("../../handlers/interactions/safeReply");

module.exports = {
    name: "rank",
    description: "View a user rank card.",
    usage: "/rank [user]",
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName("rank")
        .setDescription("View your rank card")
        .addUserOption((option) =>
            option.setName("user").setDescription("User to view").setRequired(false),
        ),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, false);
        if (!deferred) return;

        try {
            const settings = await getRankSettings(interaction.guild.id);

            if (!Number(settings.enabled)) {
                return safeReply(interaction, {
                    content:
                        '❌ The rank system is currently disabled in this server.\n' +
                        'An administrator can enable it using `/ranks enable`.'
                }, true);
            }

            const targetUser =
                interaction.options.getUser("user") || interaction.user;

            if (targetUser.bot) {
                return safeReply(
                    interaction,
                    {
                        content: "❌ Bots do not have rank data.",
                    },
                    true,
                );
            }

            const rankData = await getRankCardData(
                interaction.guild.id,
                targetUser.id,
            );
            const member = await interaction.guild.members
                .fetch(targetUser.id)
                .catch(() => null);

            const attachment = await buildRankCardAttachment({
                user: targetUser,
                member,
                guildName: interaction.guild.name,
                rankData,
            });

            return safeReply(
                interaction,
                {
                    files: [attachment],
                }
            );
        } catch (error) {
            console.error("Rank command error:", error);

            return safeReply(
                interaction,
                {
                    content: "❌ Something went wrong while loading that rank card.",
                },
                true,
            );
        }
    },
};
