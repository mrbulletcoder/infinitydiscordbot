const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');

const logAction = require('../../utils/logAction');

const CLEAR_COLOR = '#00bfff';

function formatUser(user) {
    return `${user.tag || user.username}\n\`${user.id}\``;
}

function getCaseNumber(logResult) {
    if (!logResult) return null;
    if (typeof logResult === 'number') return logResult;
    return logResult.caseNumber || logResult.case_number || null;
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

function buildClearEmbed({ channel, moderator, deletedCount, filters, guild, caseNumber = null }) {
    return new EmbedBuilder()
        .setAuthor({ name: 'Infinity • Cleanup System', iconURL: guild.iconURL({ dynamic: true }) || undefined })
        .setTitle('🧹 Messages Cleared')
        .setColor(CLEAR_COLOR)
        .addFields(
            { name: '📍 Channel', value: `${channel}\n\`${channel.id}\``, inline: true },
            { name: '🛡️ Moderator', value: formatUser(moderator), inline: true },
            { name: '📁 Case', value: caseNumber ? `\`#${caseNumber}\`` : '`Pending`', inline: true },
            { name: '📦 Deleted', value: `**${deletedCount}** message${deletedCount === 1 ? '' : 's'}`, inline: true },
            { name: '🎯 Filters', value: buildFilterSummary(filters).slice(0, 1024), inline: false }
        )
        .setFooter({ text: `${guild.name} • Moderation` })
        .setTimestamp();
}

module.exports = {
    name: 'clear',
    description: 'Advanced message cleanup command.',
    usage: '!clear [amount] [@user] / /clear',
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
            option
                .setName('amount')
                .setDescription('Amount to scan/delete. Max 100.')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false)
        )
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Only delete messages from this user')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName('bots')
                .setDescription('Only delete bot messages')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName('links')
                .setDescription('Only delete messages containing links')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName('images')
                .setDescription('Only delete messages with attachments/images')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('contains')
                .setDescription('Only delete messages containing this text')
                .setMaxLength(100)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async executePrefix(message, args) {
        const amount = Number.parseInt(args[0], 10);
        const user = message.mentions.users.first();

        const filters = {
            amount: Number.isInteger(amount) ? Math.min(Math.max(amount, 1), 100) : 100,
            user
        };

        return runClear({
            client: message.client,
            guild: message.guild,
            channel: message.channel,
            moderator: message.author,
            filters,
            reply: payload => message.reply(payload),
            publicSend: payload => message.channel.send(payload)
        });
    },

    async executeSlash(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

        await interaction.editReply({ embeds: [embed], components: [row] });

        const collector = interaction.channel.createMessageComponentCollector({ time: 15000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ This confirmation is not for you.', flags: MessageFlags.Ephemeral }).catch(() => null);
            }

            if (!i.customId.endsWith(interaction.id)) return;

            if (i.customId.startsWith('clear_cancel_')) {
                collector.stop('cancelled');
                return i.update({ content: '❌ Cleanup cancelled.', embeds: [], components: [] });
            }

            if (i.customId.startsWith('clear_confirm_')) {
                collector.stop('confirmed');
                await i.update({ content: '🧹 Clearing matching messages...', embeds: [], components: [] });
                return runClear({
                    client: interaction.client,
                    guild: interaction.guild,
                    channel: interaction.channel,
                    moderator: interaction.user,
                    filters,
                    reply: payload => interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral }),
                    publicSend: payload => interaction.channel.send(payload)
                });
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'time') {
                await interaction.editReply({ content: '⌛ Cleanup confirmation expired.', embeds: [], components: [] }).catch(() => null);
            }
        });
    }
};

async function runClear({ client, guild, channel, moderator, filters, reply, publicSend }) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        let filtered = messages;

        if (filters.user) filtered = filtered.filter(message => message.author.id === filters.user.id);
        if (filters.bots) filtered = filtered.filter(message => message.author.bot);
        if (filters.links) filtered = filtered.filter(message => /(https?:\/\/|discord\.gg\/|www\.)/gi.test(message.content));
        if (filters.images) filtered = filtered.filter(message => message.attachments.size > 0);
        if (filters.contains) filtered = filtered.filter(message => message.content.toLowerCase().includes(filters.contains.toLowerCase()));

        const amount = Math.min(filters.amount || filtered.size, 100);
        const toDelete = filtered.first(amount);

        if (!toDelete.length) {
            return reply({ content: '❌ No messages matched your filters.' });
        }

        const deleted = await channel.bulkDelete(toDelete, true);
        if (!deleted.size) {
            return reply({ content: '❌ No messages could be deleted. They may be older than 14 days.' });
        }

        const logResult = await logAction({
            client,
            guild,
            action: '🧹 Clear',
            user: filters.user || null,
            moderator,
            reason: `Deleted ${deleted.size} message${deleted.size === 1 ? '' : 's'} in #${channel.name}`,
            color: CLEAR_COLOR,
            extra: [
                `**Channel:** ${channel}`,
                `**Channel ID:** \`${channel.id}\``,
                `**Deleted:** ${deleted.size}`,
                `**Filters:**\n${buildFilterSummary(filters)}`
            ].join('\n')
        });

        const embed = buildClearEmbed({
            channel,
            moderator,
            deletedCount: deleted.size,
            filters,
            guild,
            caseNumber: getCaseNumber(logResult)
        });

        await reply({ embeds: [embed] });

        if (!filters.silent) {
            const publicMessage = await publicSend({ embeds: [embed] }).catch(() => null);
            if (publicMessage) setTimeout(() => publicMessage.delete().catch(() => null), 8000);
        }
    } catch (error) {
        console.error('Clear Command Error:', error);
        return reply({ content: '❌ Failed to clear messages.' }).catch(() => null);
    }
}
