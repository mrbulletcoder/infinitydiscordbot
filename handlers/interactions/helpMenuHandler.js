const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

async function handleHelpMenu(interaction) {
    const selected = interaction.values[0];
    const HELP_COLOR = '#00bfff';

    const categoryOrder = ['general', 'music', 'moderation', 'automod', 'admin'];

    const categoryMeta = {
        overview: {
            emoji: '👑',
            title: 'Infinity Help',
            description: 'Welcome to Infinity — a powerful moderation and utility bot built to keep your server clean, organised, and easy to manage.'
        },
        general: { emoji: '⚙️', title: 'General & Utility', description: 'Core utility and everyday commands for members and staff.' },
        music: { emoji: '🎵', title: 'Music', description: 'Music playback and audio controls.' },
        moderation: { emoji: '🛡️', title: 'Moderation', description: 'Essential moderation tools for warnings, punishments, and channel control.' },
        automod: { emoji: '🤖', title: 'Automod System', description: 'Automatic protection against spam, links, caps abuse, and repeat offenses.' },
        admin: { emoji: '🛠️', title: 'Admin & Setup', description: 'Server setup, management systems, and advanced configuration tools.' }
    };

    const formatCategory = (cat) => cat.charAt(0).toUpperCase() + cat.slice(1);
    const categories = {};

    interaction.client.commands.forEach(cmd => {
        if (!cmd.category) return;
        if (!categories[cmd.category]) categories[cmd.category] = [];
        categories[cmd.category].push(cmd);
    });

    Object.keys(categories).forEach(category => {
        categories[category].sort((a, b) => a.name.localeCompare(b.name));
    });

    const visibleCategories = categoryOrder.filter(cat => categories[cat]?.length);

    const menu = new ActionRowBuilder().addComponents(
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

    let embed;

    if (selected === 'overview') {
        const categorySummary = visibleCategories
            .map(cat => {
                const meta = categoryMeta[cat];
                return `${meta?.emoji || '📁'} **${meta?.title || formatCategory(cat)}** — \`${categories[cat].length}\` command${categories[cat].length === 1 ? '' : 's'}`;
            })
            .join('\n') || 'No command categories found.';

        embed = new EmbedBuilder()
            .setTitle('👑 Infinity Help Center')
            .setColor(HELP_COLOR)
            .setDescription('**Welcome to Infinity**\nA powerful moderation and utility bot designed to keep your server clean, organised, and easy to manage.\n\nUse the dropdown below to explore each command category.')
            .addFields(
                {
                    name: '🚀 Quick Start',
                    value: '• `/setlogs` — set your moderation log channel\n• `/setwelcomeconfig` — configure welcome messages\n• `/ticketpanel` — create your ticket panel\n• `/applicationpanel` — set up applications\n• `/automod` — configure automatic moderation'
                },
                { name: '⭐ Popular Commands', value: '• `/warn`\n• `/kick`\n• `/ban`\n• `/clear`\n• `/timeout`\n• `/leaderboard`' },
                { name: '📚 Categories', value: categorySummary }
            )
            .setFooter({ text: 'Infinity Bot • Command System ⚡' })
            .setTimestamp();
    } else {
        const commands = categories[selected] || [];
        const meta = categoryMeta[selected] || { emoji: '📁', title: formatCategory(selected), description: `View all ${formatCategory(selected)} commands.` };

        embed = new EmbedBuilder()
            .setTitle(`${meta.emoji} ${meta.title} Commands`)
            .setColor(HELP_COLOR)
            .setDescription(`${meta.description}\n\nUse the dropdown below to switch to another category.`)
            .setFooter({ text: 'Infinity Bot • Command System ⚡' })
            .setTimestamp();

        if (!commands.length) {
            embed.addFields({ name: 'No commands found', value: 'There are no commands in this category yet.' });
        } else {
            embed.addFields(commands.map(cmd => ({
                name: `${meta.emoji} ${cmd.name}`,
                value: `**Description:** ${cmd.description || 'No description provided.'}\n**Usage:** \`${cmd.usage || 'N/A'}\``
            })));
        }
    }

    return interaction.update({ embeds: [embed], components: [menu] });
}

module.exports = { handleHelpMenu };
