const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require('discord.js');

const {
    getLeaderboard,
    buildLeaderboardAttachment,
    calculateLevelFromXp
} = require('../../utils/rank');

const { safeReply } = require('../../handlers/interactions/safeReply');

module.exports = {
    name: 'leaderboard',
    description: 'View the server XP leaderboard.',
    usage: '/leaderboard',
    cooldown: 15,

    slashData: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the server rank leaderboard'),

    async executeSlash(interaction) {
        try {
            const rows = await getLeaderboard(interaction.guild.id, 10, 0);

            if (!rows.length) {
                return safeReply(interaction, {
                    content: '❌ No leaderboard data exists for this server yet.'
                }, true);
            }

            const leaderboardRows = [];

            for (const row of rows) {
                const member = await interaction.guild.members.fetch(row.user_id).catch(() => null);
                if (!member) continue;

                leaderboardRows.push({
                    user_id: row.user_id,
                    xp: Number(row.xp),
                    level: Number(row.level || calculateLevelFromXp(Number(row.xp)).level),
                    messages: Number(row.messages),
                    displayName: member.displayName,
                    username: member.user.username,
                    avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 })
                });
            }

            if (!leaderboardRows.length) {
                return safeReply(interaction, {
                    content: '❌ No leaderboard data exists for this server yet.'
                }, true);
            }

            const attachment = await buildLeaderboardAttachment({
                guild: interaction.guild,
                leaderboardRows
            });

            return safeReply(interaction, {
                files: [attachment]
            }, true);
        } catch (error) {
            console.error('Leaderboard command error:', error);

            return safeReply(interaction, {
                content: '❌ Something went wrong while loading the leaderboard.'
            }, true);
        }
    }
};