const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { pool } = require('../../database');

module.exports = {
    name: 'clearwarnings',
    description: 'Clear all warnings for a user.',
    usage: '!clearwarnings @user / /clearwarnings <user>',
    userPermissions: PermissionFlagsBits.ModerateMembers,

    slashData: new SlashCommandBuilder()
        .setName('clearwarnings')
        .setDescription('Clear warnings')
        .addUserOption(option =>
            option.setName('user').setDescription('User').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message) {
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('❌ Mention a user.');
        }

        await pool.query(
            `DELETE FROM warnings
             WHERE guild_id = ? AND user_id = ?`,
            [message.guild.id, targetUser.id]
        );

        const embed = new EmbedBuilder()
            .setAuthor({
                name: '🧽 Warnings Cleared',
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setColor('#00ff88')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                {
                    name: '👤 User',
                    value: `${targetUser.tag}\n\`${targetUser.id}\``,
                    inline: true
                },
                {
                    name: '🛡️ Moderator',
                    value: `${message.author.tag}\n\`${message.author.id}\``,
                    inline: true
                }
            )
            .setFooter({ text: 'Infinity Moderation • Warnings System' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    },

    async executeSlash(interaction) {
        const targetUser = interaction.options.getUser('user', true);

        await pool.query(
            `DELETE FROM warnings
             WHERE guild_id = ? AND user_id = ?`,
            [interaction.guild.id, targetUser.id]
        );

        const embed = new EmbedBuilder()
            .setAuthor({
                name: '🧽 Warnings Cleared',
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setColor('#00ff88')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                {
                    name: '👤 User',
                    value: `${targetUser.tag}\n\`${targetUser.id}\``,
                    inline: true
                },
                {
                    name: '🛡️ Moderator',
                    value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                    inline: true
                }
            )
            .setFooter({ text: 'Infinity Moderation • Warnings System' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};