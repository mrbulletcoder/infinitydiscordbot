const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const { getCasesForUser } = require('../../utils/moderationDb');

module.exports = {
    name: 'cases',
    description: 'View a list of moderation cases for a user.',
    usage: '!cases @user / /cases <user>',
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.EmbedLinks],
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('cases')
        .setDescription('View user moderation history')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message) {
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('❌ Mention a user.');
        }

        const result = await getCasesForUser(message.guild.id, targetUser.id, 10);
        if (!result.ok) {
            return message.reply('❌ Failed to fetch case history.');
        }

        const rows = result.rows;

        if (!rows.length) {
            return message.reply('❌ No case history found for that user.');
        }

        const description = rows
            .map(row => `**#${row.case_number}** • ${row.action} • <t:${row.created_at}:R>`)
            .join('\n');

        const embed = new EmbedBuilder()
            .setAuthor({
                name: `📁 ${targetUser.tag} • Case History`,
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setColor('#00bfff')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setDescription(description)
            .setFooter({ text: `Infinity Moderation • Showing ${rows.length} case(s)` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    },

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const targetUser = interaction.options.getUser('user', true);

        const result = await getCasesForUser(interaction.guild.id, targetUser.id, 10);
        if (!result.ok) {
            return interaction.editReply({
                content: '❌ Failed to fetch case history.',
                ephemeral: true
            });
        }

        const rows = result.rows;

        if (!rows.length) {
            return interaction.editReply({
                content: '❌ No case history found for that user.',
                ephemeral: true
            });
        }

        const description = rows
            .map(row => `**#${row.case_number}** • ${row.action} • <t:${row.created_at}:R>`)
            .join('\n');

        const embed = new EmbedBuilder()
            .setAuthor({
                name: `📁 ${targetUser.tag} • Case History`,
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setColor('#00bfff')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setDescription(description)
            .setFooter({ text: `Infinity Moderation • Showing ${rows.length} case(s)` })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
};