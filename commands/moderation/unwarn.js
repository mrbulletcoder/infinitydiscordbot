const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logAction = require('../../utils/logAction');
const {
    checkPrefixHierarchy,
    checkSlashHierarchy
} = require('../../utils/checkPermissions');
const {
    getWarnings,
    deleteWarningById
} = require('../../utils/moderationDb');

module.exports = {
    name: 'unwarn',
    description: 'Remove a specific warning from a user.',
    usage: '!unwarn @user <warning number>',
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.EmbedLinks],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('unwarn')
        .setDescription('Remove a specific warning from a user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to remove a warning from')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('warning')
                .setDescription('Warning number to remove')
                .setRequired(true)
                .setMinValue(1)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message, args) {
        const targetMember = message.mentions.members.first();
        const targetUser = message.mentions.users.first();

        if (!targetUser || !targetMember) {
            return message.reply('❌ Mention a user.');
        }

        if (targetUser.bot) {
            return message.reply('❌ You cannot unwarn bots.');
        }

        if (!(await checkPrefixHierarchy(message, targetMember))) return;

        const warningNumber = parseInt(args[1], 10);
        if (!warningNumber || warningNumber < 1) {
            return message.reply('❌ Provide a valid warning number. Example: `!unwarn @user 1`');
        }

        await removeWarning({
            guild: message.guild,
            targetUser,
            warningNumber,
            moderator: message.author,
            client: message.client,
            replyTarget: message,
            isSlash: false
        });
    },

    async executeSlash(interaction) {
        const targetUser = interaction.options.getUser('user', true);
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        const warningNumber = interaction.options.getInteger('warning', true);

        if (!targetMember) {
            return interaction.reply({
                content: '❌ User not found in this server.',
                ephemeral: true
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: '❌ You cannot unwarn bots.',
                ephemeral: true
            });
        }

        if (!(await checkSlashHierarchy(interaction, targetMember))) return;

        await interaction.deferReply();

        await removeWarning({
            guild: interaction.guild,
            targetUser,
            warningNumber,
            moderator: interaction.user,
            client: interaction.client,
            replyTarget: interaction,
            isSlash: true
        });
    }
};

async function removeWarning({
    guild,
    targetUser,
    warningNumber,
    moderator,
    client,
    replyTarget,
    isSlash
}) {
    try {
        const result = await getWarnings(guild.id, targetUser.id);

        if (!result.ok) {
            if (isSlash) {
                return replyTarget.editReply({
                    content: '❌ Failed to fetch warnings.'
                });
            }

            return replyTarget.reply('❌ Failed to fetch warnings.');
        }

        const rows = result.rows;

        if (!rows.length) {
            if (isSlash) {
                return replyTarget.editReply({
                    content: '❌ That user has no warnings.'
                });
            }

            return replyTarget.reply('❌ That user has no warnings.');
        }

        if (warningNumber > rows.length) {
            const content = `❌ Invalid warning number. That user only has **${rows.length}** warning(s).`;

            if (isSlash) {
                return replyTarget.editReply({ content });
            }

            return replyTarget.reply(content);
        }

        const warning = rows[warningNumber - 1];

        const deleteResult = await deleteWarningById(warning.id);
        if (!deleteResult.ok) {
            if (isSlash) {
                return replyTarget.editReply({
                    content: '❌ Failed to remove warning.'
                });
            }

            return replyTarget.reply('❌ Failed to remove warning.');
        }

        const remainingWarnings = rows.length - 1;

        await logAction({
            client,
            guild,
            action: '⚠️ Unwarn',
            user: targetUser,
            moderator,
            reason: warning.reason || 'No reason provided',
            color: '#00ff88',
            extra: `Removed Warning #${warningNumber} • Remaining: ${remainingWarnings}`
        });

        const embed = new EmbedBuilder()
            .setAuthor({
                name: '⚠️ Warning Removed',
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
                    value: `${moderator.tag}\n\`${moderator.id}\``,
                    inline: true
                },
                {
                    name: '🔢 Removed',
                    value: `Warning #${warningNumber}`,
                    inline: true
                },
                {
                    name: '📊 Remaining',
                    value: `**${remainingWarnings}**`,
                    inline: true
                },
                {
                    name: '📄 Reason',
                    value: `> ${warning.reason || 'No reason provided'}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Moderation • Warnings System' })
            .setTimestamp();

        if (isSlash) {
            return replyTarget.editReply({ embeds: [embed] });
        }

        return replyTarget.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Unwarn Command Error:', error);

        if (isSlash) {
            return replyTarget.editReply({
                content: '❌ Error removing warning.'
            }).catch(() => null);
        }

        return replyTarget.reply('❌ Error removing warning.').catch(() => null);
    }
}