const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags
} = require('discord.js');

const logAction = require('../../utils/logAction');

const SLOWMODE_COLOR = '#ffaa00';
const MAX_SLOWMODE_SECONDS = 21600;

function formatUser(user) {
    return `${user.tag || user.username}\n\`${user.id}\``;
}

function getCaseNumber(logResult) {
    if (!logResult) return null;
    if (typeof logResult === 'number') return logResult;
    return logResult.caseNumber || logResult.case_number || null;
}

function formatDuration(seconds) {
    if (seconds === 0) return 'Disabled';
    if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
    const minutes = Math.floor(seconds / 60);
    const leftover = seconds % 60;
    return leftover ? `${minutes}m ${leftover}s` : `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function buildSlowmodeEmbed({ channel, moderator, seconds, oldSeconds, reason, guild, caseNumber = null }) {
    return new EmbedBuilder()
        .setAuthor({ name: 'Infinity • Channel Control', iconURL: guild.iconURL({ dynamic: true }) || undefined })
        .setTitle(seconds === 0 ? '🐢 Slowmode Disabled' : '🐢 Slowmode Updated')
        .setColor(SLOWMODE_COLOR)
        .addFields(
            { name: '📍 Channel', value: `${channel}\n\`${channel.id}\``, inline: true },
            { name: '🛡️ Moderator', value: formatUser(moderator), inline: true },
            { name: '📁 Case', value: caseNumber ? `\`#${caseNumber}\`` : '`Pending`', inline: true },
            { name: '⏱️ New Delay', value: `**${formatDuration(seconds)}**`, inline: true },
            { name: '↩️ Previous Delay', value: `**${formatDuration(oldSeconds)}**`, inline: true },
            { name: '📄 Reason', value: `> ${reason}`, inline: false }
        )
        .setFooter({ text: `${guild.name} • Moderation` })
        .setTimestamp();
}

module.exports = {
    name: 'slowmode',
    description: 'Set the slowmode delay for a channel.',
    usage: '!slowmode <seconds> [channel] [reason]',
    userPermissions: [PermissionFlagsBits.ManageChannels],
    botPermissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set slowmode')
        .addIntegerOption(option =>
            option
                .setName('seconds')
                .setDescription('Slowmode duration in seconds. Use 0 to disable.')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(MAX_SLOWMODE_SECONDS)
        )
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to update')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for updating slowmode')
                .setMaxLength(1000)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async executePrefix(message, args) {
        const seconds = Number.parseInt(args[0], 10);
        if (!Number.isInteger(seconds) || seconds < 0 || seconds > MAX_SLOWMODE_SECONDS) {
            return message.reply(`❌ Provide a number between **0** and **${MAX_SLOWMODE_SECONDS}**.`);
        }

        const mentionedChannel = message.mentions.channels.first();
        const channel = mentionedChannel || message.channel;
        const reasonStart = mentionedChannel ? 2 : 1;
        const reason = args.slice(reasonStart).join(' ') || 'No reason provided';

        return runSlowmode({
            client: message.client,
            guild: message.guild,
            channel,
            moderator: message.author,
            seconds,
            reason,
            reply: payload => message.reply(payload)
        });
    },

    async executeSlash(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const seconds = interaction.options.getInteger('seconds', true);
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        return runSlowmode({
            client: interaction.client,
            guild: interaction.guild,
            channel,
            moderator: interaction.user,
            seconds,
            reason,
            reply: payload => interaction.editReply(payload)
        });
    }
};

async function runSlowmode({ client, guild, channel, moderator, seconds, reason, reply }) {
    try {
        if (!channel?.setRateLimitPerUser) {
            return reply({ content: '❌ That channel does not support slowmode.' });
        }

        const oldSeconds = channel.rateLimitPerUser || 0;
        await channel.setRateLimitPerUser(seconds, `Slowmode updated by ${moderator.tag}: ${reason}`);

        const logResult = await logAction({
            client,
            guild,
            action: seconds === 0 ? '🐢 Slowmode Disabled' : '🐢 Slowmode',
            user: null,
            moderator,
            reason,
            color: SLOWMODE_COLOR,
            extra: [
                `**Channel:** ${channel}`,
                `**Channel ID:** \`${channel.id}\``,
                `**Old Delay:** ${formatDuration(oldSeconds)}`,
                `**New Delay:** ${formatDuration(seconds)}`
            ].join('\n')
        });

        return reply({
            embeds: [buildSlowmodeEmbed({
                channel,
                moderator,
                seconds,
                oldSeconds,
                reason,
                guild,
                caseNumber: getCaseNumber(logResult)
            })]
        });
    } catch (error) {
        console.error('Slowmode Command Error:', error);
        return reply({ content: '❌ Failed to update slowmode.' }).catch(() => null);
    }
}
