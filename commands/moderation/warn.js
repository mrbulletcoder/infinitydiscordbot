const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logAction = require('../../utils/logAction');
const {
    checkPrefixHierarchy,
    checkSlashHierarchy
} = require('../../utils/checkPermissions');
const { insertWarning } = require('../../utils/moderationDb');

module.exports = {
    name: 'warn',
    description: 'Issue a warning to a user.',
    usage: '!warn @user [reason]',
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.EmbedLinks],
    cooldown: 5,

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
        const targetMember = message.mentions.members.first();
        const targetUser = message.mentions.users.first();

        if (!targetUser || !targetMember) {
            return message.reply('❌ Mention a user.');
        }

        if (targetUser.bot) {
            return message.reply('❌ You cannot warn bots.');
        }

        if (!(await checkPrefixHierarchy(message, targetMember))) return;

        const reason = args.slice(1).join(' ') || 'No reason provided';
        const timestamp = Math.floor(Date.now() / 1000);

        const result = await insertWarning({
            guildId: message.guild.id,
            userId: targetUser.id,
            moderatorId: message.author.id,
            reason,
            createdAt: timestamp
        });

        if (!result.ok) {
            return message.reply('❌ Failed to save warning.');
        }

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
        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('user', true);
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!targetMember) {
            return interaction.editReply({
                content: '❌ User not found in this server.',
                ephemeral: true
            });
        }

        if (targetUser.bot) {
            return interaction.editReply({
                content: '❌ You cannot warn bots.',
                ephemeral: true
            });
        }

        if (!(await checkSlashHierarchy(interaction, targetMember))) return;

        const timestamp = Math.floor(Date.now() / 1000);

        const result = await insertWarning({
            guildId: interaction.guild.id,
            userId: targetUser.id,
            moderatorId: interaction.user.id,
            reason,
            createdAt: timestamp
        });

        if (!result.ok) {
            return interaction.editReply({
                content: '❌ Failed to save warning.',
                ephemeral: true
            });
        }

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

        return interaction.editReply({ embeds: [embed] });
    }
};