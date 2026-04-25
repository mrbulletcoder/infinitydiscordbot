const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

const logAction = require('../../utils/logAction');
const {
    checkPrefixHierarchy,
    checkSlashHierarchy
} = require('../../utils/checkPermissions');
const { insertWarning } = require('../../utils/moderationDb');

const WARN_COLOR = '#ffcc00';

function formatUser(user) {
    return `${user.tag}\n\`${user.id}\``;
}

function getCaseNumber(logResult) {
    if (!logResult) return null;
    if (typeof logResult === 'number') return logResult;
    return logResult.caseNumber || logResult.case_number || null;
}

function buildWarnEmbed({ user, moderator, reason, guild, warningId = null, caseNumber = null }) {
    return new EmbedBuilder()
        .setAuthor({
            name: 'Infinity • Warning System',
            iconURL: user.displayAvatarURL({ dynamic: true })
        })
        .setTitle('⚠️ Member Warned')
        .setColor(WARN_COLOR)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
            {
                name: '👤 Member',
                value: formatUser(user),
                inline: true
            },
            {
                name: '🛡️ Moderator',
                value: formatUser(moderator),
                inline: true
            },
            {
                name: '📁 Case',
                value: caseNumber ? `\`#${caseNumber}\`` : '`Pending`',
                inline: true
            },
            {
                name: '⚠️ Warning',
                value: warningId ? `\`#${warningId}\`` : '`Saved`',
                inline: true
            },
            {
                name: '📄 Reason',
                value: `> ${reason}`,
                inline: false
            }
        )
        .setFooter({ text: `${guild.name} • Moderation` })
        .setTimestamp();
}

function buildWarnDmEmbed({ guild, moderator, reason }) {
    return new EmbedBuilder()
        .setAuthor({
            name: 'Infinity • Moderation Notice',
            iconURL: guild.iconURL({ dynamic: true }) || undefined
        })
        .setTitle('⚠️ You Have Been Warned')
        .setColor(WARN_COLOR)
        .setThumbnail(guild.iconURL({ dynamic: true }) || null)
        .addFields(
            {
                name: '🏠 Server',
                value: guild.name,
                inline: true
            },
            {
                name: '🛡️ Moderator',
                value: formatUser(moderator),
                inline: true
            },
            {
                name: '📄 Reason',
                value: `> ${reason}`,
                inline: false
            }
        )
        .setFooter({ text: 'Infinity Moderation • Warning Notice' })
        .setTimestamp();
}

async function runWarn({ client, guild, user, moderator, reason }) {
    const timestamp = Math.floor(Date.now() / 1000);

    const warningResult = await insertWarning({
        guildId: guild.id,
        userId: user.id,
        moderatorId: moderator.id,
        reason,
        createdAt: timestamp
    });

    if (!warningResult.ok) {
        throw new Error('Failed to save warning.');
    }

    await user.send({
        embeds: [buildWarnDmEmbed({ guild, moderator, reason })]
    }).catch(() => null);

    const logResult = await logAction({
        client,
        guild,
        action: '⚠️ Warn',
        user,
        moderator,
        reason,
        color: WARN_COLOR
    });

    return {
        caseNumber: getCaseNumber(logResult),
        warningId: warningResult.warningId || warningResult.insertId || warningResult.id || null
    };
}

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
                .setMaxLength(1000)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message, args) {
        const targetMember = message.mentions.members.first();
        const targetUser = message.mentions.users.first();
        const reason = args.slice(1).join(' ') || 'No reason provided';

        if (!targetUser || !targetMember) {
            return message.reply('❌ Mention a user.');
        }

        if (targetUser.bot) {
            return message.reply('❌ You cannot warn bots.');
        }

        if (!(await checkPrefixHierarchy(message, targetMember))) return;

        try {
            const { caseNumber, warningId } = await runWarn({
                client: message.client,
                guild: message.guild,
                user: targetUser,
                moderator: message.author,
                reason
            });

            return message.reply({
                embeds: [
                    buildWarnEmbed({
                        user: targetUser,
                        moderator: message.author,
                        reason,
                        guild: message.guild,
                        warningId,
                        caseNumber
                    })
                ]
            });
        } catch (error) {
            console.error('Warn Command Error:', error);
            return message.reply('❌ Failed to warn user.');
        }
    },

    async executeSlash(interaction) {
        const targetUser = interaction.options.getUser('user', true);
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!targetMember) {
            return interaction.reply({
                content: '❌ User not found in this server.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: '❌ You cannot warn bots.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (!(await checkSlashHierarchy(interaction, targetMember))) return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const { caseNumber, warningId } = await runWarn({
                client: interaction.client,
                guild: interaction.guild,
                user: targetUser,
                moderator: interaction.user,
                reason
            });

            return interaction.editReply({
                embeds: [
                    buildWarnEmbed({
                        user: targetUser,
                        moderator: interaction.user,
                        reason,
                        guild: interaction.guild,
                        warningId,
                        caseNumber
                    })
                ]
            });
        } catch (error) {
            console.error('Warn Command Error:', error);
            return interaction.editReply({ content: '❌ Failed to warn user.' });
        }
    }
};