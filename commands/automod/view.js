const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const { pool } = require('../../database');

const { safeReply } = require('../../handlers/interactions/safeReply');

const EMBED_COLOR = '#00bfff';

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
    return rows.sort((a, b) => a.offense_number - b.offense_number);
}

function buildRuleLines(rows) {
    if (!rows.length) {
        return [
            '`#1` → Not configured',
            '`#2` → Not configured',
            '`#3` → Not configured',
            '`#4` → Not configured',
            '`#5` → Not configured'
        ].join('\n');
    }

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

function createAutomodEmbed(guild, spamRules, linksRules, capsRules) {
    const totalRules = spamRules.length + linksRules.length + capsRules.length;

    return new EmbedBuilder()
        .setTitle('🤖 Infinity AutoMod Control Panel')
        .setColor(EMBED_COLOR)
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
        .setFooter({ text: 'Infinity Bot • Automod System ⚡' })
        .setTimestamp();
}

module.exports = {
    name: 'automod-view',
    description: 'View current automod rules and punishments.',
    usage: '/automod-view',
    userPermissions: PermissionFlagsBits.Administrator,
    botPermissions: [
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('automod-view')
        .setDescription('View all automod rules')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {

        const guildId = interaction.guild.id;

        const [rows] = await pool.query(
            `SELECT type, offense_number, punishment
             FROM automod_punishments
             WHERE guild_id = ?`,
            [guildId]
        );

        if (!rows.length) {
            const emptyEmbed = new EmbedBuilder()
                .setTitle('🤖 Infinity AutoMod Control Panel')
                .setColor(EMBED_COLOR)
                .setDescription(
                    'No automod rules have been configured yet.\n\n' +
                    'Use the buttons below to start building your protection system.'
                )
                .addFields(
                    {
                        name: '🚀 Quick Start',
                        value:
                            'Set punishments for:\n' +
                            '• Spam\n' +
                            '• Links\n' +
                            '• Caps'
                    },
                    {
                        name: '💡 Suggested First Rule',
                        value: 'Start with `Warn` for first offenses, then scale up to `Timeout` and `Kick`.'
                    }
                )
                .setFooter({ text: 'Infinity Bot • Automod System ⚡' })
                .setTimestamp();

            const emptyRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('automod_add')
                    .setLabel('➕ Add Rules')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('automod_edit')
                    .setLabel('✏️ Edit Rules')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('automod_delete')
                    .setLabel('🗑️ Delete Rules')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            );

            return safeReply(interaction, {
                embeds: [emptyEmbed],
                components: [emptyRow],
                ephemeral: true
            }, true);
        }

        const spamRules = rows.filter(row => row.type === 'spam');
        const linksRules = rows.filter(row => row.type === 'links');
        const capsRules = rows.filter(row => row.type === 'caps');

        const embed = createAutomodEmbed(
            interaction.guild,
            spamRules,
            linksRules,
            capsRules
        );

        const row = new ActionRowBuilder().addComponents(
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

        return safeReply(interaction, {
            embeds: [embed],
            components: [row]
        }, true);
    }
};