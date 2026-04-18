const {
    SlashCommandBuilder
} = require('discord.js');

const {
    getLeaderboard,
    buildLeaderboardAttachment,
    calculateLevelFromXp
} = require('../../utils/rank');

module.exports = {
    name: 'leaderboard',
    description: 'View the server XP leaderboard.',
    usage: '/leaderboard',

    slashData: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the server rank leaderboard'),

    async executeSlash(interaction) {
        await interaction.deferReply();

        try {
            const rows = await getLeaderboard(interaction.guild.id, 10, 0);

            if (!rows.length) {
                return interaction.editReply({
                    content: '❌ No leaderboard data exists for this server yet.'
                });
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
                return interaction.editReply({
                    content: '❌ No leaderboard data exists for this server yet.'
                });
            }

            const attachment = await buildLeaderboardAttachment({
                guild: interaction.guild,
                leaderboardRows
            });

            return interaction.editReply({
                files: [attachment]
            });
        } catch (error) {
            console.error('Leaderboard command error:', error);

            return interaction.editReply({
                content: '❌ Something went wrong while loading the leaderboard.'
            });
        }
    }
};