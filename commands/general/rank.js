const {
    SlashCommandBuilder
} = require('discord.js');

const {
    getRankCardData,
    buildRankCardAttachment
} = require('../../utils/rank');

module.exports = {
    name: 'rank',
    description: 'View a user rank card.',
    usage: '/rank [user]',

    slashData: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('View your rank card')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to view')
                .setRequired(false)
        ),

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const targetUser = interaction.options.getUser('user') || interaction.user;

            if (targetUser.bot) {
                return interaction.editReply({
                    content: '❌ Bots do not have rank data.'
                });
            }

            const rankData = await getRankCardData(interaction.guild.id, targetUser.id);
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            const attachment = await buildRankCardAttachment({
                user: targetUser,
                member,
                guildName: interaction.guild.name,
                rankData
            });

            return interaction.editReply({
                files: [attachment]
            });
        } catch (error) {
            console.error('Rank command error:', error);

            return interaction.editReply({
                content: '❌ Something went wrong while loading that rank card.'
            });
        }
    }
};