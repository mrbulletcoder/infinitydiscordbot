const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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

async function handleRefreshPing(interaction) {
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
            { name: '⚡ API Latency', value: `\`${apiLatency}ms\`\n${createBar(apiLatency)}`, inline: true },
            { name: '📨 Response Time', value: `\`${messageLatency}ms\`\n${createBar(messageLatency)}`, inline: true },
            {
                name: '🌐 WebSocket',
                value: wsPing !== null ? `\`${wsPing}ms\`\n${createBar(wsPing)}` : '`Calculating...`',
                inline: true
            },
            { name: '📊 Status', value: `${status.emoji} **${status.text}**`, inline: false },
            { name: '⏱️ Uptime', value: `\`${formatUptime(interaction.client.uptime)}\``, inline: true },
            { name: '🧠 Memory', value: `\`${getMemoryUsage()}\``, inline: true }
        )
        .setFooter({ text: 'Infinity Bot • Real-time System Monitor ⚡' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('refresh_ping')
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Primary)
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
}

module.exports = { handleRefreshPing };
