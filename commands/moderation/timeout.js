const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const logAction = require('../../utils/logAction');
const {
    checkPrefixHierarchy,
    checkSlashHierarchy
} = require('../../utils/checkPermissions');

const TIMEOUT_COLOR = '#ffaa00';
const MAX_TIMEOUT_MINUTES = 40320; // Discord max timeout = 28 days

function formatUser(user) {
    return `${user.tag}\n\`${user.id}\``;
}

function buildTimeoutEmbed({ member, moderator, minutes, reason, expiresAt, caseNumber = null }) {
    const expiresUnix = Math.floor(expiresAt / 1000);

    return new EmbedBuilder()
        .setAuthor({
            name: 'Infinity • Timeout System',
            iconURL: member.user.displayAvatarURL({ dynamic: true })
        })
        .setTitle('⏳ Member Timed Out')
        .setColor(TIMEOUT_COLOR)
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
                name: '⏱️ Duration',
                value: `**${minutes} minute${minutes === 1 ? '' : 's'}**`,
                inline: true
            },
            {
                name: '⌛ Expires',
                value: `<t:${expiresUnix}:F>\n<t:${expiresUnix}:R>`,
                inline: true
            },
            {
                name: '📄 Reason',
                value: `> ${reason}`,
                inline: false
            }
        )
        .setFooter({ text: `${member.guild.name} • Moderation` })
        .setTimestamp();
}

async function runTimeout({ guild, client, member, moderator, minutes, reason }) {
    const expiresAt = Date.now() + minutes * 60_000;

    await member.timeout(minutes * 60_000, reason);

    const logResult = await logAction({
        client,
        guild,
        action: '⏳ Timeout',
        user: member.user,
        moderator,
        reason,
        color: TIMEOUT_COLOR,
        extra: [
            `**Duration:** ${minutes} minute${minutes === 1 ? '' : 's'}`,
            `**Expires:** <t:${Math.floor(expiresAt / 1000)}:F>`,
            `**Expires Relative:** <t:${Math.floor(expiresAt / 1000)}:R>`
        ].join('\n')
    });

    return {
        expiresAt,
        caseNumber: logResult?.caseNumber || null
    };
}

module.exports = {
    name: 'timeout',
    description: 'Temporarily mute a user for a set duration.',
    usage: '!timeout @user <minutes> [reason]',
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.EmbedLinks],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to timeout')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('minutes')
                .setDescription('Duration in minutes')
                .setMinValue(1)
                .setMaxValue(MAX_TIMEOUT_MINUTES)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the timeout')
                .setMaxLength(1000)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message, args) {
        const member = message.mentions.members.first();
        const minutes = Number.parseInt(args[1], 10);
        const reason = args.slice(2).join(' ') || 'No reason provided';

        if (!member) {
            return message.reply('❌ Mention a user.');
        }

        if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_TIMEOUT_MINUTES) {
            return message.reply(`❌ Provide a valid duration between **1** and **${MAX_TIMEOUT_MINUTES}** minutes.`);
        }

        if (!(await checkPrefixHierarchy(message, member))) return;

        if (!member.moderatable) {
            return message.reply('❌ I cannot timeout this user. Make sure my role is above theirs.');
        }

        try {
            const { expiresAt, caseNumber } = await runTimeout({
                guild: message.guild,
                client: message.client,
                member,
                moderator: message.author,
                minutes,
                reason
            });

            const embed = buildTimeoutEmbed({
                member,
                moderator: message.author,
                minutes,
                reason,
                expiresAt,
                caseNumber
            });

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Timeout Command Error:', error);
            return message.reply('❌ Failed to timeout user.');
        }
    },

    async executeSlash(interaction) {
        const user = interaction.options.getUser('user', true);
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const minutes = interaction.options.getInteger('minutes', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!member) {
            return interaction.reply({
                content: '❌ User not found in this server.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_TIMEOUT_MINUTES) {
            return interaction.reply({
                content: `❌ Provide a valid duration between **1** and **${MAX_TIMEOUT_MINUTES}** minutes.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (!(await checkSlashHierarchy(interaction, member))) return;

        if (!member.moderatable) {
            return interaction.reply({
                content: '❌ I cannot timeout this user. Make sure my role is above theirs.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const { expiresAt, caseNumber } = await runTimeout({
                guild: interaction.guild,
                client: interaction.client,
                member,
                moderator: interaction.user,
                minutes,
                reason
            });

            const embed = buildTimeoutEmbed({
                member,
                moderator: interaction.user,
                minutes,
                reason,
                expiresAt,
                caseNumber
            });

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Timeout Command Error:', error);
            return interaction.editReply({
                content: '❌ Failed to timeout user.'
            });
        }
    }
};