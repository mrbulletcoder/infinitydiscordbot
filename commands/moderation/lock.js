const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ChannelType
} = require('discord.js');

const logAction = require('../../utils/logAction');

module.exports = {
    name: 'lock',
    description: 'Lock a channel to prevent members from sending messages',
    usage: '!lock [channel] [reason]',
    category: 'moderation',
    userPermissions: [PermissionFlagsBits.ManageChannels],
    botPermissions: [
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 3,

    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock a channel')
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to lock')
                .addChannelTypes(
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement
                )
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for locking')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async executePrefix(message, args) {
        const mentionedChannel = message.mentions.channels.first();
        const channel = mentionedChannel || message.channel;

        const reason = mentionedChannel
            ? args.slice(1).join(' ') || 'No reason provided'
            : args.join(' ') || 'No reason provided';

        await lockChannel({
            channel,
            moderator: message.member,
            reason,
            guild: message.guild,
            ctx: message,
            isSlash: false
        });
    },

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        await lockChannel({
            channel,
            moderator: interaction.member,
            reason,
            guild: interaction.guild,
            ctx: interaction,
            isSlash: true
        });
    }
};

async function lockChannel({ channel, moderator, reason, guild, ctx, isSlash }) {
    try {
        if (!channel || !channel.permissionOverwrites) {
            return isSlash
                ? ctx.editReply({ content: '❌ That channel cannot be locked.', ephemeral: true })
                : ctx.editReply('❌ That channel cannot be locked.');
        }

        const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
        const alreadyLocked = everyoneOverwrite?.deny?.has(PermissionFlagsBits.SendMessages);

        if (alreadyLocked) {
            return isSlash
                ? ctx.editReply({ content: '❌ That channel is already locked.', ephemeral: true })
                : ctx.editReply('❌ That channel is already locked.');
        }

        await channel.permissionOverwrites.edit(guild.roles.everyone, {
            SendMessages: false
        });

        const moderatorUser = moderator.user || moderator;

        const embed = new EmbedBuilder()
            .setAuthor({ name: '🔒 Channel Locked' })
            .setColor('#00bfff')
            .addFields(
                {
                    name: '📍 Channel',
                    value: `${channel}`,
                    inline: true
                },
                {
                    name: '🛡️ Moderator',
                    value: `${moderatorUser.tag}\n\`${moderatorUser.id}\``,
                    inline: true
                },
                {
                    name: '📄 Reason',
                    value: `> ${reason}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Moderation • Channel Control' })
            .setTimestamp();

        await ctx.editReply({ embeds: [embed] });

        await logAction({
            guild,
            action: 'LOCK',
            moderator: moderatorUser,
            reason,
            color: '#ff9900',
            extra: `Channel: ${channel.name} (${channel.id})`
        });
    } catch (err) {
        console.error('Lock Command Error:', err);

        if (isSlash) {
            if (ctx.replied || ctx.deferred) {
                return ctx.followUp({
                    content: '❌ Failed to lock channel.',
                    ephemeral: true
                }).catch(() => null);
            }

            return ctx.editReply({
                content: '❌ Failed to lock channel.',
                ephemeral: true
            }).catch(() => null);
        }

        return ctx.editReply('❌ Failed to lock channel.').catch(() => null);
    }
}