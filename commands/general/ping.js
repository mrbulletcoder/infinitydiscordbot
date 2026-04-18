const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

// ===== STATUS =====
function getPingStatus(ping) {
    if (ping < 120) return { text: 'Excellent', emoji: '🟢' };
    if (ping < 250) return { text: 'Good', emoji: '🟡' };
    if (ping < 400) return { text: 'Okay', emoji: '🟠' };
    return { text: 'Slow', emoji: '🔴' };
}

// ===== COLOR =====
function getPingColor(ping) {
    if (ping < 120) return '#00ff00';
    if (ping < 250) return '#ffaa00';
    if (ping < 400) return '#ff8800';
    return '#ff0000';
}

// ===== BAR VISUAL =====
function createBar(ping) {
    const normalized = Math.min(5, Math.ceil(ping / 100));
    return '▰'.repeat(normalized) + '▱'.repeat(5 - normalized);
}

// ===== UPTIME =====
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 60000) % 60;
    const hours = Math.floor(ms / 3600000);
    return `${hours}h ${minutes}m ${seconds}s`;
}

// ===== MEMORY =====
function getMemoryUsage() {
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    return `${Math.round(used)} MB`;
}

// ===== EMBED BUILDER =====
function buildEmbed(client, apiLatency, messageLatency, wsPing) {
    const status = getPingStatus(apiLatency);
    const color = getPingColor(apiLatency);

    return new EmbedBuilder()
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
                value: wsPing
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
                value: `\`${formatUptime(client.uptime)}\``,
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
}

module.exports = {
    name: 'ping',
    description: 'Check bot performance stats',
    usage: '!ping, /ping',
    category: 'general',

    slashData: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('View bot performance stats'),

    // ===== PREFIX =====
    async executePrefix(message) {
        const start = Date.now();

        const sent = await message.reply('⏳ Calculating performance...');
        const end = Date.now();

        const apiLatency = end - start;
        const messageLatency = sent.createdTimestamp - message.createdTimestamp;
        const rawWs = message.client.ws.ping;
        const wsPing = rawWs > 0 ? Math.round(rawWs) : null;

        const embed = buildEmbed(message.client, apiLatency, messageLatency, wsPing);

        const button = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('refresh_ping')
                .setLabel('🔄 Refresh')
                .setStyle(ButtonStyle.Primary)
        );

        await sent.edit({
            content: null,
            embeds: [embed],
            components: [button]
        });
    },

    // ===== SLASH =====
    async executeSlash(interaction) {
        const start = Date.now();

        await interaction.reply({
            content: '⏳ Calculating performance...',
            fetchReply: true
        });

        const end = Date.now();

        const apiLatency = end - start;
        const messageLatency = Date.now() - start;
        const rawWs = interaction.client.ws.ping;
        const wsPing = rawWs > 0 ? Math.round(rawWs) : null;

        const embed = buildEmbed(interaction.client, apiLatency, messageLatency, wsPing);

        const button = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('refresh_ping')
                .setLabel('🔄 Refresh')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.editReply({
            content: null,
            embeds: [embed],
            components: [button]
        });
    }
};