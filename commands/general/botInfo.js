const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 60000) % 60;
    const hours = Math.floor(ms / 3600000) % 24;
    const days = Math.floor(ms / 86400000);

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function formatMemory() {
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    return `${Math.round(used)} MB`;
}

module.exports = {
    name: 'botinfo',
    description: 'View detailed information about Infinity.',
    usage: '/botinfo',
    category: 'general',
    cooldown: 10,

    slashData: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('View detailed information about Infinity'),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        const client = interaction.client;

        const totalGuilds = client.guilds.cache.size;
        const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);
        const totalChannels = client.channels.cache.size;
        const totalCommands = client.commands?.size || 0;
        const wsPing = client.ws.ping >= 0 ? `${Math.round(client.ws.ping)}ms` : 'Calculating...';

        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setAuthor({
                name: 'Infinity Bot Information',
                iconURL: client.user.displayAvatarURL()
            })
            .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
            .setDescription(
                'A complete overview of Infinity’s live system stats, growth, and performance.'
            )
            .addFields(
                {
                    name: '🤖 Bot Overview',
                    value:
                        `**Name:** ${client.user.tag}\n` +
                        `**Bot ID:** \`${client.user.id}\`\n` +
                        `**Created:** <t:${Math.floor(client.user.createdTimestamp / 1000)}:R>`,
                    inline: false
                },
                {
                    name: '🌍 Network Stats',
                    value:
                        `**Servers:** \`${totalGuilds.toLocaleString()}\`\n` +
                        `**Users:** \`${totalUsers.toLocaleString()}\`\n` +
                        `**Channels:** \`${totalChannels.toLocaleString()}\``,
                    inline: true
                },
                {
                    name: '⚙️ System Stats',
                    value:
                        `**Commands:** \`${totalCommands}\`\n` +
                        `**WebSocket:** \`${wsPing}\`\n` +
                        `**Uptime:** \`${formatUptime(client.uptime)}\``,
                    inline: true
                },
                {
                    name: '🧠 Runtime',
                    value:
                        `**Node.js:** \`${process.version}\`\n` +
                        `**Memory:** \`${formatMemory()}\`\n` +
                        `**Platform:** \`${process.platform}\``,
                    inline: true
                },
                {
                    name: '✨ Features',
                    value:
                        '🛡️ Moderation\n' +
                        '🤖 Automod\n' +
                        '🎫 Tickets\n' +
                        '💰 Economy\n' +
                        '📈 Rank System\n' +
                        '📨 Reports & Appeals',
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Bot • System Intelligence ⚡' })
            .setTimestamp();

        return safeReply(interaction, { embeds: [embed] }, true);
    }
};