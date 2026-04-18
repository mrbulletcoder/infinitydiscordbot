const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { pool } = require('../../database');

module.exports = {
    name: 'warnings',
    description: 'View all warnings issued to a user.',
    usage: '!warnings @user / /warnings <user>',
    userPermissions: PermissionFlagsBits.ModerateMembers,

    slashData: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('View warnings')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message) {
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('❌ Mention a user.');
        }

        const [rows] = await pool.query(
            `SELECT reason, moderator_id, created_at
             FROM warnings
             WHERE guild_id = ? AND user_id = ?
             ORDER BY id ASC`,
            [message.guild.id, targetUser.id]
        );

        const lines = await Promise.all(
            rows.map(async (warning, index) => {
                const moderator = warning.moderator_id
                    ? await message.client.users.fetch(warning.moderator_id).catch(() => null)
                    : null;

                return `**${index + 1}.** ${warning.reason}\n> Moderator: ${moderator ? moderator.tag : (warning.moderator_id || 'Unknown')}\n> Date: <t:${warning.created_at}:R>`;
            })
        );

        const embed = new EmbedBuilder()
            .setAuthor({
                name: `⚠️ Warnings • ${targetUser.tag}`,
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setColor('#ffaa00')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setDescription(lines.length ? lines.join('\n\n') : '✅ No warnings')
            .setFooter({ text: `Infinity Moderation • Total: ${rows.length}` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    },

    async executeSlash(interaction) {
        const targetUser = interaction.options.getUser('user', true);

        const [rows] = await pool.query(
            `SELECT reason, moderator_id, created_at
             FROM warnings
             WHERE guild_id = ? AND user_id = ?
             ORDER BY id ASC`,
            [interaction.guild.id, targetUser.id]
        );

        const lines = await Promise.all(
            rows.map(async (warning, index) => {
                const moderator = warning.moderator_id
                    ? await interaction.client.users.fetch(warning.moderator_id).catch(() => null)
                    : null;

                return `**${index + 1}.** ${warning.reason}\n> Moderator: ${moderator ? moderator.tag : (warning.moderator_id || 'Unknown')}\n> Date: <t:${warning.created_at}:R>`;
            })
        );

        const embed = new EmbedBuilder()
            .setAuthor({
                name: `⚠️ Warnings • ${targetUser.tag}`,
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setColor('#ffaa00')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setDescription(lines.length ? lines.join('\n\n') : '✅ No warnings')
            .setFooter({ text: `Infinity Moderation • Total: ${rows.length}` })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};