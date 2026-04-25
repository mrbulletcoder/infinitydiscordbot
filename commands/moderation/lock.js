const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ChannelType,
    MessageFlags
} = require('discord.js');

const logAction = require('../../utils/logAction');

const LOCK_COLOR = '#ff9900';

function formatUser(user) {
    return `${user.tag || user.username}\n\`${user.id}\``;
}

function getCaseNumber(logResult) {
    if (!logResult) return null;
    if (typeof logResult === 'number') return logResult;
    return logResult.caseNumber || logResult.case_number || null;
}

function buildLockEmbed({ channel, moderator, reason, guild, caseNumber = null }) {
    return new EmbedBuilder()
        .setAuthor({ name: 'Infinity • Channel Control', iconURL: guild.iconURL({ dynamic: true }) || undefined })
        .setTitle('🔒 Channel Locked')
        .setColor(LOCK_COLOR)
        .addFields(
            { name: '📍 Channel', value: `${channel}\n\`${channel.id}\``, inline: true },
            { name: '🛡️ Moderator', value: formatUser(moderator), inline: true },
            { name: '📁 Case', value: caseNumber ? `\`#${caseNumber}\`` : '`Pending`', inline: true },
            { name: '📄 Reason', value: `> ${reason}`, inline: false }
        )
        .setFooter({ text: `${guild.name} • Moderation` })
        .setTimestamp();
}

const slashData = new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel')
    .addChannelOption(option =>
        option
            .setName('channel')
            .setDescription('Channel to lock')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
    )
    .addStringOption(option =>
        option
            .setName('reason')
            .setDescription('Reason for locking')
            .setMaxLength(1000)
            .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

module.exports = {
    name: 'lock',
    description: 'Lock a channel to prevent members from sending messages.',
    usage: '!lock [channel] [reason]',
    category: 'moderation',
    userPermissions: [PermissionFlagsBits.ManageChannels],
    botPermissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
    cooldown: 3,
    data: slashData,
    slashData,

    async executePrefix(message, args) {
        const mentionedChannel = message.mentions.channels.first();
        const channel = mentionedChannel || message.channel;
        const reason = mentionedChannel ? args.slice(1).join(' ') || 'No reason provided' : args.join(' ') || 'No reason provided';

        return lockChannel({
            client: message.client,
            guild: message.guild,
            channel,
            moderator: message.author,
            reason,
            reply: payload => message.reply(payload)
        });
    },

    async executeSlash(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        return lockChannel({
            client: interaction.client,
            guild: interaction.guild,
            channel,
            moderator: interaction.user,
            reason,
            reply: payload => interaction.editReply(payload)
        });
    }
};

async function lockChannel({ client, guild, channel, moderator, reason, reply }) {
    try {
        if (!channel?.permissionOverwrites) {
            return reply({ content: '❌ That channel cannot be locked.' });
        }

        const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
        const alreadyLocked = everyoneOverwrite?.deny?.has(PermissionFlagsBits.SendMessages);

        if (alreadyLocked) {
            return reply({ content: '❌ That channel is already locked.' });
        }

        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, `Channel locked by ${moderator.tag}: ${reason}`);

        const logResult = await logAction({
            client,
            guild,
            action: '🔒 Lock',
            user: null,
            moderator,
            reason,
            color: LOCK_COLOR,
            extra: `**Channel:** ${channel}\n**Channel ID:** \`${channel.id}\``
        });

        return reply({
            embeds: [buildLockEmbed({
                channel,
                moderator,
                reason,
                guild,
                caseNumber: getCaseNumber(logResult)
            })]
        });
    } catch (error) {
        console.error('Lock Command Error:', error);
        return reply({ content: '❌ Failed to lock channel.' }).catch(() => null);
    }
}
