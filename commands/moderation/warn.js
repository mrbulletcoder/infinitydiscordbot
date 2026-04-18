const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { pool } = require('../../database');
const logAction = require('../../utils/logAction');

module.exports = {
    name: 'warn',
    description: 'Issue a warning to a user.',
    usage: '!warn @user [reason]',
    userPermissions: PermissionFlagsBits.ModerateMembers,

    slashData: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to warn')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message, args) {
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('❌ Mention a user.');
        }

        if (targetUser.id === message.author.id) {
            return message.reply('❌ You cannot warn yourself.');
        }

        if (targetUser.bot) {
            return message.reply('❌ You cannot warn bots.');
        }

        const reason = args.slice(1).join(' ') || 'No reason provided';
        const timestamp = Math.floor(Date.now() / 1000);

        await pool.query(
            `INSERT INTO warnings (guild_id, user_id, moderator_id, reason, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
                message.guild.id,
                targetUser.id,
                message.author.id,
                reason,
                timestamp
            ]
        );

        await logAction({
            client: message.client,
            guild: message.guild,
            action: '⚠️ Warn',
            user: targetUser,
            moderator: message.author,
            reason,
            color: '#ffff00'
        });

        const embed = new EmbedBuilder()
            .setAuthor({
                name: '⚠️ User Warned',
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setColor('#ffcc00')
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
                },
                {
                    name: '📄 Reason',
                    value: `> ${reason}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Moderation • Warnings System' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    },

    async executeSlash(interaction) {
        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: '❌ You cannot warn yourself.',
                ephemeral: true
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: '❌ You cannot warn bots.',
                ephemeral: true
            });
        }

        const timestamp = Math.floor(Date.now() / 1000);

        await pool.query(
            `INSERT INTO warnings (guild_id, user_id, moderator_id, reason, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
                interaction.guild.id,
                targetUser.id,
                interaction.user.id,
                reason,
                timestamp
            ]
        );

        await logAction({
            client: interaction.client,
            guild: interaction.guild,
            action: '⚠️ Warn',
            user: targetUser,
            moderator: interaction.user,
            reason,
            color: '#ffff00'
        });

        const embed = new EmbedBuilder()
            .setAuthor({
                name: '⚠️ User Warned',
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setColor('#ffcc00')
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
                },
                {
                    name: '📄 Reason',
                    value: `> ${reason}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Moderation • Warnings System' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};