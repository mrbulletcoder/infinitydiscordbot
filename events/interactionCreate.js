const {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const { pool } = require('../database');
const { checkSlashPermission } = require('../utils/checkPermissions');
const {
    handleGiveawayEnter,
    handleGiveawayEntries,
    handleGiveawayEnd,
    handleGiveawayConfirmEnd,
    handleGiveawayCancelEnd,
    handleGiveawayReroll
} = require('../utils/giveaway');

const {
    handleCreateTicket,
    handleClaimTicket,
    handleCloseTicket,
    handleCloseTicketConfirm,
    handleCloseTicketCancel
} = require('../utils/tickets');

const {
    handleCreateApplication,
    handleApplicationModal,
    handleAcceptApplication,
    handleDenyApplication,
    handleDenyApplicationModal
} = require('../utils/applications');

// ===== PING HELPERS =====
function getPingStatus(ping) {
    if (ping < 120) return { text: 'Excellent', emoji: '🟢' };
    if (ping < 250) return { text: 'Good', emoji: '🟡' };
    if (ping < 400) return { text: 'Okay', emoji: '🟠' };
    return { text: 'Slow', emoji: '🔴' };
}

function getPingColor(ping) {
    if (ping < 120) return '#00ff00';
    if (ping < 250) return '#ffaa00';
    if (ping < 400) return '#ff8800';
    return '#ff0000';
}

function createBar(ping) {
    const normalized = Math.min(5, Math.max(1, Math.ceil(ping / 100)));
    return '▰'.repeat(normalized) + '▱'.repeat(5 - normalized);
}

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 60000) % 60;
    const hours = Math.floor(ms / 3600000);
    return `${hours}h ${minutes}m ${seconds}s`;
}

function getMemoryUsage() {
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    return `${Math.round(used)} MB`;
}

// ===== AUTOMOD HELPERS =====
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;

    return `${Math.floor(hours / 24)}d`;
}

function formatRule(rule) {
    if (!rule) {
        return '`Not Set`';
    }

    if (rule === 'warn') {
        return '⚠️ **Warn**';
    }

    if (rule === 'kick') {
        return '👢 **Kick**';
    }

    if (rule.startsWith('timeout:')) {
        const ms = parseInt(rule.split(':')[1], 10);
        return `⏳ **Timeout** \`${formatDuration(ms)}\``;
    }

    return `\`${rule}\``;
}

function sortRules(rows) {
    return [...rows].sort((a, b) => a.offense_number - b.offense_number);
}

function buildRuleLines(rows) {
    const mapped = new Map(rows.map(row => [row.offense_number, row]));
    const lines = [];

    for (let i = 1; i <= 5; i++) {
        const rule = mapped.get(i);

        if (!rule) {
            lines.push(`\`#${i}\` → Not configured`);
            continue;
        }

        lines.push(`\`#${i}\` → ${formatRule(rule.punishment)}`);
    }

    return lines.join('\n');
}

function countConfigured(rows) {
    return rows.length;
}

function getHighestPunishment(rows) {
    if (!rows.length) return '`None`';

    const punishments = rows.map(row => row.punishment);

    if (punishments.includes('kick')) return '👢 **Kick**';

    const timeoutRules = punishments.filter(rule => rule.startsWith('timeout:'));
    if (timeoutRules.length) {
        const maxTimeout = Math.max(
            ...timeoutRules.map(rule => parseInt(rule.split(':')[1], 10))
        );
        return `⏳ **Timeout** \`${formatDuration(maxTimeout)}\``;
    }

    if (punishments.includes('warn')) return '⚠️ **Warn**';

    return '`Custom`';
}

async function getAutomodRuleRows(guildId) {
    const [rows] = await pool.query(
        `SELECT type, offense_number, punishment
         FROM automod_punishments
         WHERE guild_id = ?`,
        [guildId]
    );

    return rows;
}

function createAutomodEmbed(guild, spamRules, linksRules, capsRules) {
    const totalRules = spamRules.length + linksRules.length + capsRules.length;

    return new EmbedBuilder()
        .setTitle('🤖 Infinity AutoMod Control Panel')
        .setColor('#00bfff')
        .setDescription(
            'Protect your server with automated moderation rules for **spam**, **links**, and **caps abuse**.\n\n' +
            'Use the buttons below to add, edit, or remove punishment rules.'
        )
        .addFields(
            {
                name: '📊 Configuration Overview',
                value:
                    `**Server:** ${guild.name}\n` +
                    `**Total Rules:** \`${totalRules}\`\n` +
                    `**Protected Categories:** \`3\``,
                inline: false
            },
            {
                name: '🚫 Spam Protection',
                value:
                    `**Configured:** \`${countConfigured(spamRules)}/5\`\n` +
                    `**Highest Action:** ${getHighestPunishment(spamRules)}\n\n` +
                    `${buildRuleLines(sortRules(spamRules))}`,
                inline: true
            },
            {
                name: '🔗 Link Protection',
                value:
                    `**Configured:** \`${countConfigured(linksRules)}/5\`\n` +
                    `**Highest Action:** ${getHighestPunishment(linksRules)}\n\n` +
                    `${buildRuleLines(sortRules(linksRules))}`,
                inline: true
            },
            {
                name: '🔊 Caps Protection',
                value:
                    `**Configured:** \`${countConfigured(capsRules)}/5\`\n` +
                    `**Highest Action:** ${getHighestPunishment(capsRules)}\n\n` +
                    `${buildRuleLines(sortRules(capsRules))}`,
                inline: true
            },
            {
                name: '💡 Recommended Setup',
                value:
                    'A strong setup is usually:\n' +
                    '• `#1–#2` → Warn\n' +
                    '• `#3–#4` → Timeout\n' +
                    '• `#5` → Kick',
                inline: false
            }
        )
        .setFooter({ text: 'Infinity Bot • Automod System, ⚡' })
        .setTimestamp();
}

function createAutomodMainButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('automod_add')
            .setLabel('➕ Add Rules')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('automod_edit')
            .setLabel('✏️ Edit Rules')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('automod_delete')
            .setLabel('🗑️ Delete Rules')
            .setStyle(ButtonStyle.Danger)
    );
}

function createAutomodSetupEmbed(description) {
    return new EmbedBuilder()
        .setTitle('🤖 Infinity AutoMod Setup')
        .setColor('#00bfff')
        .setDescription(description)
        .setFooter({ text: 'Infinity AutoMod • Setup Flow ⚡' })
        .setTimestamp();
}

// ===== APPLY RULE FUNCTION =====
async function applyRule(interaction, type, offense, action, duration, mode) {
    const guildId = interaction.guild.id;
    const offenseNumber = Number(offense);

    await interaction.deferUpdate();

    if (mode === 'delete') {
        await pool.query(
            `DELETE FROM automod_punishments
             WHERE guild_id = ? AND type = ? AND offense_number = ?`,
            [guildId, type, offenseNumber]
        );
    } else {
        const punishment = action === 'timeout'
            ? `timeout:${duration}`
            : action;

        await pool.query(
            `INSERT INTO automod_punishments (guild_id, type, offense_number, punishment)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE punishment = VALUES(punishment)`,
            [guildId, type, offenseNumber, punishment]
        );
    }

    const rows = await getAutomodRuleRows(guildId);

    const spamRules = rows.filter(row => row.type === 'spam');
    const linksRules = rows.filter(row => row.type === 'links');
    const capsRules = rows.filter(row => row.type === 'caps');

    const embed = createAutomodEmbed(
        interaction.guild,
        spamRules,
        linksRules,
        capsRules
    );

    return interaction.editReply({
        content: `✅ Rule ${mode === 'delete' ? 'deleted' : 'updated'} successfully.`,
        embeds: [embed],
        components: [createAutomodMainButtons()]
    });
}

module.exports = {
    name: 'interactionCreate',

    async execute(interaction, client) {
        // ===== SLASH COMMANDS =====
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            const allowed = await checkSlashPermission(interaction, command);
            if (!allowed) return;

            try {
                await command.executeSlash(interaction);
            } catch (error) {
                console.error(error);

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        content: '❌ Error executing command.',
                        ephemeral: true
                    }).catch(() => { });
                } else {
                    await interaction.reply({
                        content: '❌ Error executing command.',
                        ephemeral: true
                    }).catch(() => { });
                }
            }

            return;
        }

        // ===== BUTTONS =====
        if (interaction.isButton()) {
            if (interaction.customId === 'giveaway_enter') {
                return handleGiveawayEnter(interaction);
            }

            if (interaction.customId === 'giveaway_entries') {
                return handleGiveawayEntries(interaction);
            }

            if (interaction.customId === 'giveaway_end') {
                return handleGiveawayEnd(interaction);
            }

            if (interaction.customId.startsWith('giveaway_confirm_end_')) {
                const giveawayId = interaction.customId.replace('giveaway_confirm_end_', '');
                return handleGiveawayConfirmEnd(interaction, giveawayId);
            }

            if (interaction.customId.startsWith('giveaway_cancel_end_')) {
                return handleGiveawayCancelEnd(interaction);
            }

            if (interaction.customId === 'giveaway_reroll') {
                return handleGiveawayReroll(interaction);
            }

            if (interaction.customId === 'refresh_ping') {
                try {
                    const start = Date.now();
                    await interaction.deferUpdate();
                    const end = Date.now();

                    const apiLatency = end - start;
                    const messageLatency = Date.now() - interaction.message.createdTimestamp;
                    const rawWs = interaction.client.ws.ping;
                    const wsPing = rawWs > 0 ? Math.round(rawWs) : null;

                    const status = getPingStatus(apiLatency);
                    const color = getPingColor(apiLatency);

                    const embed = new EmbedBuilder()
                        .setTitle('🏓 Infinity Performance')
                        .setDescription('⚡ Real-time system performance tracking')
                        .setColor(color)
                        .addFields(
                            {
                                name: '⚡ API Latency',
                                value: `\`${apiLatency}ms\`\n${createBar(apiLatency)}`,
                                inline: true
                            },
                            {
                                name: '📨 Response Time',
                                value: `\`${messageLatency}ms\`\n${createBar(messageLatency)}`,
                                inline: true
                            },
                            {
                                name: '🌐 WebSocket',
                                value: wsPing !== null
                                    ? `\`${wsPing}ms\`\n${createBar(wsPing)}`
                                    : '`Calculating...`',
                                inline: true
                            },
                            {
                                name: '📊 Status',
                                value: `${status.emoji} **${status.text}**`,
                                inline: false
                            },
                            {
                                name: '⏱️ Uptime',
                                value: `\`${formatUptime(interaction.client.uptime)}\``,
                                inline: true
                            },
                            {
                                name: '🧠 Memory',
                                value: `\`${getMemoryUsage()}\``,
                                inline: true
                            }
                        )
                        .setFooter({ text: 'Infinity Bot • Real-time System Monitor ⚡' })
                        .setTimestamp();

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('refresh_ping')
                            .setLabel('🔄 Refresh')
                            .setStyle(ButtonStyle.Primary)
                    );

                    await interaction.editReply({
                        embeds: [embed],
                        components: [row]
                    });
                } catch (error) {
                    console.error('Error handling refresh_ping button:', error);
                }

                return;
            }

            if (interaction.customId === 'ticket_create') {
                return handleCreateTicket(interaction);
            }

            if (interaction.customId.startsWith('ticket_claim_')) {
                const ticketId = interaction.customId.split('_')[2];
                return handleClaimTicket(interaction, ticketId);
            }

            if (interaction.customId.startsWith('ticket_close_confirm_')) {
                const ticketId = interaction.customId.split('_')[3];
                return handleCloseTicket(interaction, ticketId);
            }

            if (interaction.customId.startsWith('ticket_close_yes_')) {
                const ticketId = interaction.customId.split('_')[3];
                return handleCloseTicketConfirm(interaction, ticketId);
            }

            if (interaction.customId.startsWith('ticket_close_no_')) {
                const ticketId = interaction.customId.split('_')[3];
                return handleCloseTicketCancel(interaction, ticketId);
            }

            if (
                interaction.customId === 'automod_add' ||
                interaction.customId === 'automod_edit' ||
                interaction.customId === 'automod_delete'
            ) {
                const mode = interaction.customId.split('_')[1];

                const menu = new StringSelectMenuBuilder()
                    .setCustomId(`automod_select_${mode}`)
                    .setPlaceholder('Select a protection type')
                    .addOptions([
                        {
                            label: 'Spam Protection',
                            value: 'spam',
                            emoji: '🚫',
                            description: 'Configure spam offense punishments'
                        },
                        {
                            label: 'Link Protection',
                            value: 'links',
                            emoji: '🔗',
                            description: 'Configure link offense punishments'
                        },
                        {
                            label: 'Caps Protection',
                            value: 'caps',
                            emoji: '🔊',
                            description: 'Configure caps offense punishments'
                        }
                    ]);

                return interaction.reply({
                    embeds: [
                        createAutomodSetupEmbed(
                            `You selected **${mode}** mode.\n\n` +
                            'Choose which protection category you want to configure.'
                        )
                    ],
                    components: [new ActionRowBuilder().addComponents(menu)],
                    ephemeral: true
                });
            }

            if (interaction.customId.startsWith('application_accept_')) {
                const applicationId = interaction.customId.split('_')[2];
                return handleAcceptApplication(interaction, applicationId);
            }

            if (interaction.customId.startsWith('application_deny_')) {
                const applicationId = interaction.customId.split('_')[2];
                return handleDenyApplication(interaction, applicationId);
            }

            return;
        }

        // ===== MODALS =====
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('application_modal_')) {
                const positionId = interaction.customId.split('_')[2];
                return handleApplicationModal(interaction, positionId);
            }

            if (interaction.customId.startsWith('application_deny_modal_')) {
                const applicationId = interaction.customId.split('_')[3];
                return handleDenyApplicationModal(interaction, applicationId);
            }

            return;
        }

        // ===== SELECT MENUS =====
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'help_menu') {
                const selected = interaction.values[0];
                const HELP_COLOR = '#00bfff';

                const categoryOrder = ['general', 'music', 'moderation', 'automod', 'admin'];

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
                        .setFooter({ text: 'Infinity Bot • Command System ⚡' })
                        .setTimestamp();
                } else {
                    const commands = categories[selected] || [];
                    const meta = categoryMeta[selected] || {
                        emoji: '📁',
                        title: formatCategory(selected),
                        description: `View all ${formatCategory(selected)} commands.`
                    };

                    embed = new EmbedBuilder()
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
                    } else {
                        embed.addFields(
                            commands.map(cmd => ({
                                name: `${meta.emoji} ${cmd.name}`,
                                value:
                                    `**Description:** ${cmd.description || 'No description provided.'}\n` +
                                    `**Usage:** \`${cmd.usage || 'N/A'}\``
                            }))
                        );
                    }
                }

                return interaction.update({
                    embeds: [embed],
                    components: [menu]
                });
            }

            if (interaction.customId === 'application_position_select') {
                const positionId = interaction.values[0];
                return handleCreateApplication(interaction, positionId);
            }

            if (interaction.customId.startsWith('automod_select_')) {
                const mode = interaction.customId.split('_')[2];
                const type = interaction.values[0];

                const offenseMenu = new StringSelectMenuBuilder()
                    .setCustomId(`automod_offense_${mode}_${type}`)
                    .setPlaceholder('Select an offense level')
                    .addOptions(
                        Array.from({ length: 5 }, (_, i) => ({
                            label: `Offense #${i + 1}`,
                            value: `${i + 1}`,
                            description: `Configure punishment for offense #${i + 1}`
                        }))
                    );

                await interaction.deferUpdate();

                return interaction.editReply({
                    embeds: [
                        createAutomodSetupEmbed(
                            `**Protection Type:** \`${type}\`\n` +
                            `**Mode:** \`${mode}\`\n\n` +
                            'Now choose which offense level you want to configure.'
                        )
                    ],
                    components: [new ActionRowBuilder().addComponents(offenseMenu)]
                });
            }

            if (interaction.customId.startsWith('automod_offense_')) {
                const parts = interaction.customId.split('_');
                const mode = parts[2];
                const type = parts[3];
                const offense = interaction.values[0];

                if (mode === 'delete') {
                    return applyRule(interaction, type, offense, null, null, 'delete');
                }

                const actionMenu = new StringSelectMenuBuilder()
                    .setCustomId(`automod_action_${mode}_${type}_${offense}`)
                    .setPlaceholder('Select a punishment')
                    .addOptions([
                        {
                            label: 'Warn',
                            value: 'warn',
                            emoji: '⚠️',
                            description: 'Issue a warning'
                        },
                        {
                            label: 'Timeout',
                            value: 'timeout',
                            emoji: '⏳',
                            description: 'Temporarily timeout the user'
                        },
                        {
                            label: 'Kick',
                            value: 'kick',
                            emoji: '👢',
                            description: 'Kick the user from the server'
                        }
                    ]);

                await interaction.deferUpdate();

                return interaction.editReply({
                    embeds: [
                        createAutomodSetupEmbed(
                            `**Protection Type:** \`${type}\`\n` +
                            `**Offense:** \`#${offense}\`\n` +
                            `**Mode:** \`${mode}\`\n\n` +
                            'Choose the punishment for this offense.'
                        )
                    ],
                    components: [new ActionRowBuilder().addComponents(actionMenu)]
                });
            }

            if (interaction.customId.startsWith('automod_action_')) {
                const parts = interaction.customId.split('_');
                const mode = parts[2];
                const type = parts[3];
                const offense = parts[4];
                const action = interaction.values[0];

                if (action === 'timeout') {
                    const durationMenu = new StringSelectMenuBuilder()
                        .setCustomId(`automod_duration_${mode}_${type}_${offense}`)
                        .setPlaceholder('Select a timeout duration')
                        .addOptions([
                            {
                                label: '10 Seconds',
                                value: '10000',
                                description: 'Very short timeout'
                            },
                            {
                                label: '1 Minute',
                                value: '60000',
                                description: 'Short timeout'
                            },
                            {
                                label: '5 Minutes',
                                value: '300000',
                                description: 'Medium timeout'
                            },
                            {
                                label: '10 Minutes',
                                value: '600000',
                                description: 'Long timeout'
                            }
                        ]);

                    await interaction.deferUpdate();

                    return interaction.editReply({
                        embeds: [
                            createAutomodSetupEmbed(
                                `**Protection Type:** \`${type}\`\n` +
                                `**Offense:** \`#${offense}\`\n` +
                                `**Punishment:** \`timeout\`\n\n` +
                                'Choose the timeout duration.'
                            )
                        ],
                        components: [new ActionRowBuilder().addComponents(durationMenu)]
                    });
                }

                return applyRule(interaction, type, offense, action, null, mode);
            }

            if (interaction.customId.startsWith('automod_duration_')) {
                const parts = interaction.customId.split('_');
                const mode = parts[2];
                const type = parts[3];
                const offense = parts[4];
                const duration = interaction.values[0];

                return applyRule(interaction, type, offense, 'timeout', duration, mode);
            }
        }
    }
};