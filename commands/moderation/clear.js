const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');

const { safeReply } = require('../../handlers/interactions/safeReply');

const CLEAR_COLOR = '#00bfff';

function formatUser(user) {
    return `${user.tag || user.username}\n\`${user.id}\``;
}

function buildFilterSummary(filters) {
    const summary = [];

    if (filters.user) summary.push(`User: ${filters.user.tag || filters.user.username} (${filters.user.id})`);
    if (filters.bots) summary.push('Bots only');
    if (filters.links) summary.push('Links only');
    if (filters.images) summary.push('Images/attachments only');
    if (filters.contains) summary.push(`Contains: "${filters.contains}"`);
    if (filters.amount) summary.push(`Requested amount: ${filters.amount}`);

    return summary.length ? summary.join('\n') : 'All recent messages';
}

function buildClearEmbed({ channel, moderator, deletedCount, filters, guild }) {
    return new EmbedBuilder()
        .setAuthor({
            name: 'Infinity • Cleanup System',
            iconURL: guild.iconURL({ dynamic: true }) || undefined
        })
        .setTitle('🧹 Messages Cleared')
        .setColor(CLEAR_COLOR)
        .addFields(
            { name: '📍 Channel', value: `${channel}\n\`${channel.id}\``, inline: true },
            { name: '🛡️ Moderator', value: formatUser(moderator), inline: true },
            { name: '📦 Deleted', value: `**${deletedCount}** message${deletedCount === 1 ? '' : 's'}`, inline: true },
            { name: '🎯 Filters', value: buildFilterSummary(filters).slice(0, 1024), inline: false }
        )
        .setFooter({ text: `${guild.name} • Cleanup System` })
        .setTimestamp();
}

module.exports = {
    name: 'clear',
    description: 'Advanced message cleanup command.',
    usage: '/clear',
    category: 'moderation',
    userPermissions: [PermissionFlagsBits.ManageMessages],
    botPermissions: [
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Elite message cleanup')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to scan/delete. Max 100.')
                .setMinValue(1)
                .setMaxValue(100)
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Only delete messages from this user')
        )
        .addBooleanOption(option =>
            option.setName('bots')
                .setDescription('Only delete bot messages')
        )
        .addBooleanOption(option =>
            option.setName('links')
                .setDescription('Only delete messages containing links')
        )
        .addBooleanOption(option =>
            option.setName('images')
                .setDescription('Only delete messages with attachments/images')
        )
        .addStringOption(option =>
            option.setName('contains')
                .setDescription('Only delete messages containing this text')
                .setMaxLength(100)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async executeSlash(interaction) {
        const filters = {
            amount: interaction.options.getInteger('amount') || 100,
            user: interaction.options.getUser('user'),
            bots: interaction.options.getBoolean('bots') || false,
            links: interaction.options.getBoolean('links') || false,
            images: interaction.options.getBoolean('images') || false,
            contains: interaction.options.getString('contains')
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`clear_confirm_${interaction.id}`)
                .setLabel('Confirm Cleanup')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`clear_cancel_${interaction.id}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

        const embed = new EmbedBuilder()
            .setColor('#ffaa00')
            .setTitle('⚠️ Confirm Message Cleanup')
            .setDescription('This will delete matching messages from the current channel. This cannot be undone.')
            .addFields(
                { name: '📍 Channel', value: `${interaction.channel}`, inline: true },
                { name: '🎯 Filters', value: buildFilterSummary(filters).slice(0, 1024), inline: false }
            )
            .setFooter({ text: 'Infinity Moderation • Cleanup Confirmation' })
            .setTimestamp();

        await safeReply(interaction, {
            embeds: [embed],
            components: [row]
        }, true);

        const collector = interaction.channel.createMessageComponentCollector({
            time: 15000
        });

        collector.on('collect', async i => {
            if (!i.customId.endsWith(interaction.id)) return;

            if (i.user.id !== interaction.user.id) {
                return i.reply({
                    content: '❌ This confirmation is not for you.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => null);
            }

            if (i.customId.startsWith('clear_cancel_')) {
                collector.stop('cancelled');

                return i.update({
                    content: '❌ Cleanup cancelled.',
                    embeds: [],
                    components: []
                });
            }

            if (i.customId.startsWith('clear_confirm_')) {
                collector.stop('confirmed');

                await i.update({
                    content: '🧹 Clearing matching messages...',
                    embeds: [],
                    components: []
                });

                return runClear({
                    guild: interaction.guild,
                    channel: interaction.channel,
                    moderator: interaction.user,
                    filters,
                    reply: payload => interaction.followUp({
                        ...payload,
                        flags: MessageFlags.Ephemeral
                    }),
                    publicSend: payload => interaction.channel.send(payload)
                });
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'time') {
                await safeReply(interaction, {
                    content: '⌛ Cleanup confirmation expired.',
                    embeds: [],
                    components: []
                }, true).catch(() => null);
            }
        });
    }
};

async function runClear({ guild, channel, moderator, filters, reply, publicSend }) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        let filtered = messages;

        if (filters.user) {
            filtered = filtered.filter(message => message.author.id === filters.user.id);
        }

        if (filters.bots) {
            filtered = filtered.filter(message => message.author.bot);
        }

        if (filters.links) {
            filtered = filtered.filter(message =>
                /(https?:\/\/|discord\.gg\/|www\.)/gi.test(message.content)
            );
        }

        if (filters.images) {
            filtered = filtered.filter(message => message.attachments.size > 0);
        }

        if (filters.contains) {
            filtered = filtered.filter(message =>
                message.content.toLowerCase().includes(filters.contains.toLowerCase())
            );
        }

        const amount = Math.min(filters.amount || filtered.size, 100);
        const toDelete = filtered.first(amount);

        if (!toDelete.length) {
            return reply({
                content: '❌ No messages matched your filters.'
            });
        }

        const deleted = await channel.bulkDelete(toDelete, true);

        if (!deleted.size) {
            return reply({
                content: '❌ No messages could be deleted. They may be older than 14 days.'
            });
        }

        const embed = buildClearEmbed({
            channel,
            moderator,
            deletedCount: deleted.size,
            filters,
            guild
        });

        await reply({ embeds: [embed] });

        const publicMessage = await publicSend({ embeds: [embed] }).catch(() => null);

        if (publicMessage) {
            setTimeout(() => {
                publicMessage.delete().catch(() => null);
            }, 8000);
        }
    } catch (error) {
        console.error('Clear Command Error:', error);

        return reply({
            content: '❌ Failed to clear messages.'
        }).catch(() => null);
    }
}