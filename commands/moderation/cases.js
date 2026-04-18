const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const { pool } = require('../../database');

module.exports = {
    name: 'cases',
    description: 'View a list of moderation cases for a user.',
    usage: '!cases @user / /cases <user>',
    userPermissions: PermissionFlagsBits.ModerateMembers,

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

        const [rows] = await pool.query(
            `SELECT case_number, action, created_at
             FROM cases
             WHERE guild_id = ? AND user_id = ?
             ORDER BY case_number DESC
             LIMIT 10`,
            [message.guild.id, targetUser.id]
        );

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
        const targetUser = interaction.options.getUser('user', true);

        const [rows] = await pool.query(
            `SELECT case_number, action, created_at
             FROM cases
             WHERE guild_id = ? AND user_id = ?
             ORDER BY case_number DESC
             LIMIT 10`,
            [interaction.guild.id, targetUser.id]
        );

        if (!rows.length) {
            return interaction.reply({
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

        return interaction.reply({ embeds: [embed] });
    }
};