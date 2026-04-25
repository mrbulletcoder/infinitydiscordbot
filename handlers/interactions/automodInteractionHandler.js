const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { pool } = require('../../database');

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
    if (!rule) return '`Not Set`';
    if (rule === 'warn') return '⚠️ **Warn**';
    if (rule === 'kick') return '👢 **Kick**';
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
        lines.push(rule ? `\`#${i}\` → ${formatRule(rule.punishment)}` : `\`#${i}\` → Not configured`);
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
        const maxTimeout = Math.max(...timeoutRules.map(rule => parseInt(rule.split(':')[1], 10)));
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
        .setDescription('Protect your server with automated moderation rules for **spam**, **links**, and **caps abuse**.\n\nUse the buttons below to add, edit, or remove punishment rules.')
        .addFields(
            {
                name: '📊 Configuration Overview',
                value: `**Server:** ${guild.name}\n**Total Rules:** \`${totalRules}\`\n**Protected Categories:** \`3\``,
                inline: false
            },
            {
                name: '🚫 Spam Protection',
                value: `**Configured:** \`${countConfigured(spamRules)}/5\`\n**Highest Action:** ${getHighestPunishment(spamRules)}\n\n${buildRuleLines(sortRules(spamRules))}`,
                inline: true
            },
            {
                name: '🔗 Link Protection',
                value: `**Configured:** \`${countConfigured(linksRules)}/5\`\n**Highest Action:** ${getHighestPunishment(linksRules)}\n\n${buildRuleLines(sortRules(linksRules))}`,
                inline: true
            },
            {
                name: '🔊 Caps Protection',
                value: `**Configured:** \`${countConfigured(capsRules)}/5\`\n**Highest Action:** ${getHighestPunishment(capsRules)}\n\n${buildRuleLines(sortRules(capsRules))}`,
                inline: true
            },
            {
                name: '💡 Recommended Setup',
                value: 'A strong setup is usually:\n• `#1–#2` → Warn\n• `#3–#4` → Timeout\n• `#5` → Kick',
                inline: false
            }
        )
        .setFooter({ text: 'Infinity Bot • Automod System, ⚡' })
        .setTimestamp();
}

function createAutomodMainButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('automod_add').setLabel('➕ Add Rules').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('automod_edit').setLabel('✏️ Edit Rules').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('automod_delete').setLabel('🗑️ Delete Rules').setStyle(ButtonStyle.Danger)
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
        const punishment = action === 'timeout' ? `timeout:${duration}` : action;

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
    const embed = createAutomodEmbed(interaction.guild, spamRules, linksRules, capsRules);

    return interaction.editReply({
        content: `✅ Rule ${mode === 'delete' ? 'deleted' : 'updated'} successfully.`,
        embeds: [embed],
        components: [createAutomodMainButtons()]
    });
}

async function handleAutomodModeButton(interaction) {
    const mode = interaction.customId.split('_')[1];

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`automod_select_${mode}`)
        .setPlaceholder('Select a protection type')
        .addOptions([
            { label: 'Spam Protection', value: 'spam', emoji: '🚫', description: 'Configure spam offense punishments' },
            { label: 'Link Protection', value: 'links', emoji: '🔗', description: 'Configure link offense punishments' },
            { label: 'Caps Protection', value: 'caps', emoji: '🔊', description: 'Configure caps offense punishments' }
        ]);

    return interaction.reply({
        embeds: [createAutomodSetupEmbed(`You selected **${mode}** mode.\n\nChoose which protection category you want to configure.`)],
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
    });
}

async function handleAutomodProtectionSelect(interaction) {
    const mode = interaction.customId.split('_')[2];
    const type = interaction.values[0];

    const offenseMenu = new StringSelectMenuBuilder()
        .setCustomId(`automod_offense_${mode}_${type}`)
        .setPlaceholder('Select an offense level')
        .addOptions(Array.from({ length: 5 }, (_, i) => ({
            label: `Offense #${i + 1}`,
            value: `${i + 1}`,
            description: `Configure punishment for offense #${i + 1}`
        })));

    await interaction.deferUpdate();
    return interaction.editReply({
        embeds: [createAutomodSetupEmbed(`**Protection Type:** \`${type}\`\n**Mode:** \`${mode}\`\n\nNow choose which offense level you want to configure.`)],
        components: [new ActionRowBuilder().addComponents(offenseMenu)]
    });
}

async function handleAutomodOffenseSelect(interaction) {
    const parts = interaction.customId.split('_');
    const mode = parts[2];
    const type = parts[3];
    const offense = interaction.values[0];

    if (mode === 'delete') return applyRule(interaction, type, offense, null, null, 'delete');

    const actionMenu = new StringSelectMenuBuilder()
        .setCustomId(`automod_action_${mode}_${type}_${offense}`)
        .setPlaceholder('Select a punishment')
        .addOptions([
            { label: 'Warn', value: 'warn', emoji: '⚠️', description: 'Issue a warning' },
            { label: 'Timeout', value: 'timeout', emoji: '⏳', description: 'Temporarily timeout the user' },
            { label: 'Kick', value: 'kick', emoji: '👢', description: 'Kick the user from the server' }
        ]);

    await interaction.deferUpdate();
    return interaction.editReply({
        embeds: [createAutomodSetupEmbed(`**Protection Type:** \`${type}\`\n**Offense:** \`#${offense}\`\n**Mode:** \`${mode}\`\n\nChoose the punishment for this offense.`)],
        components: [new ActionRowBuilder().addComponents(actionMenu)]
    });
}

async function handleAutomodActionSelect(interaction) {
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
                { label: '10 Seconds', value: '10000', description: 'Very short timeout' },
                { label: '1 Minute', value: '60000', description: 'Short timeout' },
                { label: '5 Minutes', value: '300000', description: 'Medium timeout' },
                { label: '10 Minutes', value: '600000', description: 'Long timeout' }
            ]);

        await interaction.deferUpdate();
        return interaction.editReply({
            embeds: [createAutomodSetupEmbed(`**Protection Type:** \`${type}\`\n**Offense:** \`#${offense}\`\n**Punishment:** \`timeout\`\n\nChoose the timeout duration.`)],
            components: [new ActionRowBuilder().addComponents(durationMenu)]
        });
    }

    return applyRule(interaction, type, offense, action, null, mode);
}

async function handleAutomodDurationSelect(interaction) {
    const parts = interaction.customId.split('_');
    const mode = parts[2];
    const type = parts[3];
    const offense = parts[4];
    const duration = interaction.values[0];

    return applyRule(interaction, type, offense, 'timeout', duration, mode);
}

module.exports = {
    createAutomodEmbed,
    createAutomodMainButtons,
    createAutomodSetupEmbed,
    applyRule,
    handleAutomodModeButton,
    handleAutomodProtectionSelect,
    handleAutomodOffenseSelect,
    handleAutomodActionSelect,
    handleAutomodDurationSelect
};
