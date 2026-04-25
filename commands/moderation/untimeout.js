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

const UNTIMEOUT_COLOR = '#57f287';

function formatUser(user) {
    return `${user.tag}\n\`${user.id}\``;
}

function getCaseNumber(logResult) {
    if (!logResult) return null;
    if (typeof logResult === 'number') return logResult;
    return logResult.caseNumber || logResult.case_number || null;
}

function buildUntimeoutEmbed({ member, moderator, reason, guild, previousTimeoutUnix = null, caseNumber = null }) {
    return new EmbedBuilder()
        .setAuthor({
            name: 'Infinity • Timeout System',
            iconURL: member.user.displayAvatarURL({ dynamic: true })
        })
        .setTitle('🔓 Timeout Removed')
        .setColor(UNTIMEOUT_COLOR)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            {
                name: '👤 Member',
                value: formatUser(member.user),
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
                name: '⏱️ Previous Timeout',
                value: previousTimeoutUnix ? `<t:${previousTimeoutUnix}:F>\n<t:${previousTimeoutUnix}:R>` : '`Unknown`',
                inline: false
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

async function runUntimeout({ client, guild, member, moderator, reason }) {
    const previousTimeoutUnix = member.communicationDisabledUntilTimestamp
        ? Math.floor(member.communicationDisabledUntilTimestamp / 1000)
        : null;

    await member.timeout(null, reason);

    const logResult = await logAction({
        client,
        guild,
        action: '🔓 Untimeout',
        user: member.user,
        moderator,
        reason,
        color: UNTIMEOUT_COLOR,
        extra: previousTimeoutUnix
            ? `**Previous Timeout Until:** <t:${previousTimeoutUnix}:F>\n**Previous Timeout Relative:** <t:${previousTimeoutUnix}:R>`
            : null
    });

    return {
        previousTimeoutUnix,
        caseNumber: getCaseNumber(logResult)
    };
}

module.exports = {
    name: 'untimeout',
    description: 'Remove a user’s timeout.',
    usage: '!untimeout @user [reason]',
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.EmbedLinks],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Remove timeout')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to remove timeout from')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for removing timeout')
                .setMaxLength(1000)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message, args) {
        const member = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || 'Timeout removed';

        if (!member) return message.reply('❌ Mention a user.');

        if (!(await checkPrefixHierarchy(message, member))) return;

        if (!member.communicationDisabledUntilTimestamp) {
            return message.reply('❌ That user is not timed out.');
        }

        if (!member.moderatable) {
            return message.reply('❌ I cannot remove timeout from this user.');
        }

        try {
            const { previousTimeoutUnix, caseNumber } = await runUntimeout({
                client: message.client,
                guild: message.guild,
                member,
                moderator: message.author,
                reason
            });

            return message.reply({
                embeds: [
                    buildUntimeoutEmbed({
                        member,
                        moderator: message.author,
                        reason,
                        guild: message.guild,
                        previousTimeoutUnix,
                        caseNumber
                    })
                ]
            });
        } catch (error) {
            console.error('Untimeout Command Error:', error);
            return message.reply('❌ Failed to remove timeout.');
        }
    },

    async executeSlash(interaction) {
        const user = interaction.options.getUser('user', true);
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const reason = interaction.options.getString('reason') || 'Timeout removed';

        if (!member) {
            return interaction.reply({
                content: '❌ User not found in this server.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (!(await checkSlashHierarchy(interaction, member))) return;

        if (!member.communicationDisabledUntilTimestamp) {
            return interaction.reply({
                content: '❌ That user is not timed out.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (!member.moderatable) {
            return interaction.reply({
                content: '❌ I cannot remove timeout from this user.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const { previousTimeoutUnix, caseNumber } = await runUntimeout({
                client: interaction.client,
                guild: interaction.guild,
                member,
                moderator: interaction.user,
                reason
            });

            return interaction.editReply({
                embeds: [
                    buildUntimeoutEmbed({
                        member,
                        moderator: interaction.user,
                        reason,
                        guild: interaction.guild,
                        previousTimeoutUnix,
                        caseNumber
                    })
                ]
            });
        } catch (error) {
            console.error('Untimeout Command Error:', error);
            return interaction.editReply({ content: '❌ Failed to remove timeout.' });
        }
    }
};