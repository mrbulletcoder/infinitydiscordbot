const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');

const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

const logAction = require('../../utils/logAction');

const SLOWMODE_COLOR = '#ffaa00';
const MAX_SLOWMODE_SECONDS = 21600;

function formatUser(user) {
    return `${user.tag || user.username}\n\`${user.id}\``;
}

function formatDuration(seconds) {
    if (seconds === 0) return 'Disabled';
    if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
    const minutes = Math.floor(seconds / 60);
    const leftover = seconds % 60;
    return leftover ? `${minutes}m ${leftover}s` : `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function buildSlowmodeEmbed({ channel, moderator, seconds, oldSeconds, reason, guild }) {
    return new EmbedBuilder()
        .setAuthor({ name: 'Infinity • Channel Control', iconURL: guild.iconURL({ dynamic: true }) || undefined })
        .setTitle(seconds === 0 ? '🐢 Slowmode Disabled' : '🐢 Slowmode Updated')
        .setColor(SLOWMODE_COLOR)
        .addFields(
            { name: '📍 Channel', value: `${channel}\n\`${channel.id}\``, inline: true },
            { name: '🛡️ Moderator', value: formatUser(moderator), inline: true },
            { name: '⏱️ New Delay', value: `**${formatDuration(seconds)}**`, inline: true },
            { name: '↩️ Previous Delay', value: `**${formatDuration(oldSeconds)}**`, inline: true },
            { name: '📄 Reason', value: `> ${reason}`, inline: false }
        )
        .setFooter({ text: `${guild.name} • Channel Control` })
        .setTimestamp();
}

module.exports = {
    name: 'slowmode',
    description: 'Set the slowmode delay for a channel.',
    userPermissions: [PermissionFlagsBits.ManageChannels],
    botPermissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set slowmode')
        .addIntegerOption(option =>
            option.setName('seconds')
                .setDescription('Slowmode duration in seconds')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(MAX_SLOWMODE_SECONDS)
        )
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to update')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        const seconds = interaction.options.getInteger('seconds', true);
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        try {
            const oldSeconds = channel.rateLimitPerUser || 0;

            await channel.setRateLimitPerUser(seconds, `Updated by ${interaction.user.tag}: ${reason}`);

            await logAction({
                client: interaction.client,
                guild: interaction.guild,
                action: seconds === 0 ? '🐢 Slowmode Disabled' : '🐢 Slowmode Updated',
                user: null,
                moderator: interaction.user,
                reason,
                color: SLOWMODE_COLOR,
                extra: [
                    `**Channel:** ${channel}`,
                    `**Channel ID:** \`${channel.id}\``,
                    `**Old Delay:** ${formatDuration(oldSeconds)}`,
                    `**New Delay:** ${formatDuration(seconds)}`
                ].join('\n'),
                createCase: false
            }).catch(() => null);

            return safeReply(interaction, {
                embeds: [buildSlowmodeEmbed({
                    channel,
                    moderator: interaction.user,
                    seconds,
                    oldSeconds,
                    reason,
                    guild: interaction.guild
                })]
            }, true);
        } catch (error) {
            console.error('Slowmode Error:', error);
            return safeReply(interaction, { content: '❌ Failed to update slowmode.' }, true);
        }
    }
};