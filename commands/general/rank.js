const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require('discord.js');

const {
    getRankCardData,
    buildRankCardAttachment
} = require('../../utils/rank');

const { safeReply } = require('../../handlers/interactions/safeReply');

module.exports = {
    name: 'rank',
    description: 'View a user rank card.',
    usage: '/rank [user]',
    botPermissions: [
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 5,

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
        try {
            const targetUser = interaction.options.getUser('user') || interaction.user;

            if (targetUser.bot) {
                return safeReply(interaction, {
                    content: '❌ Bots do not have rank data.'
                }, true);
            }

            const rankData = await getRankCardData(interaction.guild.id, targetUser.id);
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            const attachment = await buildRankCardAttachment({
                user: targetUser,
                member,
                guildName: interaction.guild.name,
                rankData
            });

            return safeReply(interaction, {
                files: [attachment]
            }, true);
        } catch (error) {
            console.error('Rank command error:', error);

            return safeReply(interaction, {
                content: '❌ Something went wrong while loading that rank card.'
            }, true);
        }
    }
};