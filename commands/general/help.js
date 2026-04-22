const categoryOrder = ['general', 'music', 'moderation', 'automod', 'admin'];

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder
} = require('discord.js');

const HELP_COLOR = '#00bfff';

const categoryMeta = {
    overview: {
        emoji: '👑',
        title: 'Infinity Help',
        description: 'Welcome to Infinity — a powerful moderation and utility bot built to keep your server clean, organised, and easy to manage.'
    },
    general: {
        emoji: '⚙️',
        title: 'General & Utility',
        description: 'Core utility and everyday commands for members and staff.'
    },
    music: {
        emoji: '🎵',
        title: 'Music',
        description: 'Music playback and audio controls.'
    },
    moderation: {
        emoji: '🛡️',
        title: 'Moderation',
        description: 'Essential moderation tools for warnings, punishments, and channel control.'
    },
    automod: {
        emoji: '🤖',
        title: 'Automod System',
        description: 'Automatic protection against spam, links, caps abuse, and repeat offenses.'
    },
    admin: {
        emoji: '🛠️',
        title: 'Admin & Setup',
        description: 'Server setup, management systems, and advanced configuration tools.'
    }
};

function formatCategory(cat) {
    return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function getCategories(commands) {
    const categories = {};

    commands.forEach(cmd => {
        if (!cmd.category) return;
        if (!categories[cmd.category]) {
            categories[cmd.category] = [];
        }

        categories[cmd.category].push(cmd);
    });

    Object.keys(categories).forEach(category => {
        categories[category].sort((a, b) => a.name.localeCompare(b.name));
    });

    return categories;
}

function getVisibleCategories(categories) {
    return categoryOrder.filter(cat => categories[cat]?.length);
}

function createHelpMenu(categories, selected = 'overview') {
    const visibleCategories = getVisibleCategories(categories);

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('help_menu')
            .setPlaceholder('Select a help category')
            .addOptions([
                {
                    label: 'Home',
                    value: 'overview',
                    emoji: categoryMeta.overview.emoji,
                    description: 'Overview, quick start, and featured commands',
                    default: selected === 'overview'
                },
                ...visibleCategories.map(cat => ({
                    label: categoryMeta[cat]?.title || formatCategory(cat),
                    value: cat,
                    emoji: categoryMeta[cat]?.emoji || '📁',
                    description: categoryMeta[cat]?.description?.slice(0, 100) || `View ${formatCategory(cat)} commands`,
                    default: selected === cat
                }))
            ])
    );
}

function createOverviewEmbed(client, categories) {
    const visibleCategories = getVisibleCategories(categories);

    const categorySummary = visibleCategories
        .map(cat => {
            const meta = categoryMeta[cat];
            return `${meta?.emoji || '📁'} **${meta?.title || formatCategory(cat)}** — \`${categories[cat].length}\` command${categories[cat].length === 1 ? '' : 's'}`;
        })
        .join('\n') || 'No command categories found.';

    return new EmbedBuilder()
        .setTitle('👑 Infinity Help Center')
        .setColor(HELP_COLOR)
        .setDescription(
            '**Welcome to Infinity**\n' +
            'A powerful moderation and utility bot designed to keep your server clean, organised, and easy to manage.\n\n' +
            'Use the dropdown below to explore each command category.'
        )
        .addFields(
            {
                name: '🚀 Quick Start',
                value:
                    '• `/setlogs` — set your moderation log channel\n' +
                    '• `/setwelcomeconfig` — configure welcome messages\n' +
                    '• `/ticketpanel` — create your ticket panel\n' +
                    '• `/applicationpanel` — set up applications\n' +
                    '• `/automod` — configure automatic moderation'
            },
            {
                name: '⭐ Popular Commands',
                value:
                    '• `/warn`\n' +
                    '• `/kick`\n' +
                    '• `/ban`\n' +
                    '• `/clear`\n' +
                    '• `/timeout`\n' +
                    '• `/leaderboard`'
            },
            {
                name: '📚 Categories',
                value: categorySummary
            }
        )
        .setFooter({ text: `${client.user.username} • Command System ⚡` })
        .setTimestamp();
}

function createCategoryEmbed(category, commands) {
    const meta = categoryMeta[category] || {
        emoji: '📁',
        title: formatCategory(category),
        description: `View all ${formatCategory(category)} commands.`
    };

    const embed = new EmbedBuilder()
        .setTitle(`${meta.emoji} ${meta.title} Commands`)
        .setColor(HELP_COLOR)
        .setDescription(
            `${meta.description}\n\n` +
            'Use the dropdown below to switch to another category.'
        )
        .setFooter({ text: 'Infinity Bot • Command System ⚡' })
        .setTimestamp();

    if (!commands.length) {
        embed.addFields({
            name: 'No commands found',
            value: 'There are no commands in this category yet.'
        });

        return embed;
    }

    embed.addFields(
        commands.map(cmd => ({
            name: `${meta.emoji} ${cmd.name}`,
            value:
                `**Description:** ${cmd.description || 'No description provided.'}\n` +
                `**Usage:** \`${cmd.usage || 'N/A'}\``
        }))
    );

    return embed;
}

function createCommandEmbed(cmd) {
    const meta = categoryMeta[cmd.category] || {
        emoji: '📁',
        title: formatCategory(cmd.category || 'unknown')
    };

    return new EmbedBuilder()
        .setTitle(`🔍 Infinity Help • ${cmd.name}`)
        .setColor(HELP_COLOR)
        .setDescription('Detailed command information')
        .addFields(
            { name: '📖 Description', value: cmd.description || 'No description provided.' },
            { name: '⚙️ Usage', value: `\`${cmd.usage || 'N/A'}\`` },
            { name: '📂 Category', value: `${meta.emoji} ${meta.title}`, inline: true }
        )
        .setFooter({ text: 'Infinity Bot • Command Details ⚡' })
        .setTimestamp();
}

module.exports = {
    name: 'help',
    description: 'View a list of all available commands.',
    usage: '!help [command] / /help [command]',

    slashData: new SlashCommandBuilder()
        .setName('help')
        .setDescription('View all commands or a specific command')
        .addStringOption(option =>
            option
                .setName('command')
                .setDescription('View details of a command')
                .setRequired(false)
        ),

    async executePrefix(message, args) {
        const commandName = args[0]?.toLowerCase();

        if (commandName) {
            const cmd = message.client.commands.get(commandName);
            if (!cmd) return message.reply('❌ Command not found.');

            return message.reply({ embeds: [createCommandEmbed(cmd)] });
        }

        return sendHelp(message, message.client);
    },

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const commandName = interaction.options.getString('command')?.toLowerCase();

        if (commandName) {
            const cmd = interaction.client.commands.get(commandName);
            if (!cmd) {
                return interaction.editReply({ content: '❌ Command not found.', ephemeral: true });
            }

            return interaction.editReply({ embeds: [createCommandEmbed(cmd)] });
        }

        return sendHelp(interaction, interaction.client, true);
    }
};

async function sendHelp(ctx, client, isSlash = false) {
    const categories = getCategories(client.commands);
    const embed = createOverviewEmbed(client, categories);
    const menu = createHelpMenu(categories, 'overview');

    if (isSlash) {
        return ctx.editReply({ embeds: [embed], components: [menu] });
    }

    return ctx.reply({ embeds: [embed], components: [menu] });
}