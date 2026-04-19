const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

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
        .addIntegerOption(o =>
            o.setName('amount').setDescription('Amount (max 100)').setRequired(false))
        .addUserOption(o =>
            o.setName('user').setDescription('Target user').setRequired(false))
        .addBooleanOption(o =>
            o.setName('bots').setDescription('Delete bot messages'))
        .addBooleanOption(o =>
            o.setName('links').setDescription('Delete links'))
        .addBooleanOption(o =>
            o.setName('images').setDescription('Delete image messages'))
        .addStringOption(o =>
            o.setName('contains').setDescription('Delete messages containing text'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async executePrefix(message, args) {
        const amount = parseInt(args[0]);
        const user = message.mentions.users.first();

        const filters = {
            user,
            amount: isNaN(amount) ? null : Math.min(amount, 100)
        };

        return runClear(message, filters);
    },

    async executeSlash(interaction) {
        const filters = {
            amount: interaction.options.getInteger('amount'),
            user: interaction.options.getUser('user'),
            bots: interaction.options.getBoolean('bots'),
            links: interaction.options.getBoolean('links'),
            images: interaction.options.getBoolean('images'),
            contains: interaction.options.getString('contains')
        };

        if (filters.amount) {
            filters.amount = Math.min(filters.amount, 100);
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`clear_confirm_${interaction.id}`)
                .setLabel('Confirm')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`clear_cancel_${interaction.id}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

        const embed = new EmbedBuilder()
            .setColor('#ffaa00')
            .setTitle('⚠️ Confirm Clear')
            .setDescription('This action will delete messages based on your filters.\nThis cannot be undone.');

        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });

        const collector = interaction.channel.createMessageComponentCollector({
            time: 15000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) return;
            if (!i.customId.endsWith(interaction.id)) return;

            if (i.customId.startsWith('clear_cancel_')) {
                collector.stop('cancelled');
                return i.update({ content: '❌ Cancelled.', embeds: [], components: [] });
            }

            if (i.customId.startsWith('clear_confirm_')) {
                collector.stop('confirmed');
                await i.update({ content: '🧹 Clearing...', embeds: [], components: [] });
                return runClear(interaction, filters, true);
            }
        });
    }
};

async function runClear(ctx, filters, isSlash = false) {
    const channel = ctx.channel;
    const moderator = isSlash ? ctx.user : ctx.author;

    try {
        const messages = await channel.messages.fetch({ limit: 100 });

        let filtered = messages;

        if (filters.user) {
            filtered = filtered.filter(m => m.author.id === filters.user.id);
        }

        if (filters.bots) {
            filtered = filtered.filter(m => m.author.bot);
        }

        if (filters.links) {
            filtered = filtered.filter(m => /(https?:\/\/)/gi.test(m.content));
        }

        if (filters.images) {
            filtered = filtered.filter(m => m.attachments.size > 0);
        }

        if (filters.contains) {
            filtered = filtered.filter(m =>
                m.content.toLowerCase().includes(filters.contains.toLowerCase())
            );
        }

        const amount = filters.amount || filtered.size;
        const toDelete = filtered.first(amount);

        if (!toDelete.length) {
            const msg = '❌ No messages matched your filters.';
            return isSlash
                ? ctx.followUp({ content: msg, ephemeral: true })
                : ctx.reply(msg);
        }

        const deleted = await channel.bulkDelete(toDelete, true);

        const embed = new EmbedBuilder()
            .setAuthor({ name: '🧹 Cleanup Complete' })
            .setColor('#00bfff')
            .addFields(
                {
                    name: '📦 Deleted',
                    value: `**${deleted.size}**`,
                    inline: true
                },
                {
                    name: '🛡️ Moderator',
                    value: `${moderator.tag}\n\`${moderator.id}\``,
                    inline: true
                },
                {
                    name: '🎯 Filters',
                    value: buildFilterSummary(filters, ctx),
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Moderation • Cleanup System' })
            .setTimestamp();

        if (isSlash) {
            await ctx.followUp({ embeds: [embed], ephemeral: true });
        } else {
            await channel.send({ embeds: [embed] });
        }
    } catch (err) {
        console.error('Clear Command Error:', err);
        if (isSlash) {
            return ctx.followUp({ content: '❌ Failed to clear messages.', ephemeral: true }).catch(() => null);
        }
        return ctx.reply('❌ Failed to clear messages.').catch(() => null);
    }
}

function buildFilterSummary(filters, ctx) {
    const summary = [];

    if (filters.user) {
        const member = ctx.guild.members.cache.get(filters.user.id);
        summary.push(member?.displayName || filters.user.username);
    }

    if (filters.bots) summary.push('Bots');
    if (filters.links) summary.push('Links');
    if (filters.images) summary.push('Images');
    if (filters.contains) summary.push(`"${filters.contains}"`);
    if (filters.amount) summary.push(`${filters.amount} messages`);

    return summary.length ? summary.join('\n') : 'All Messages';
}