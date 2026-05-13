const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    version: discordJsVersion
} = require('discord.js');

const os = require('os');

const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

const OWNER_IDS = [
    '398455056258826240'
];

function formatUptime(ms) {
    const totalSeconds = Math.floor(ms / 1000);

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function formatMemory(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

module.exports = {
    name: 'botstats',
    description: 'View Infinity bot statistics.',
    category: 'admin',
    cooldown: 5,

    userPermissions: PermissionFlagsBits.Administrator,

    botPermissions: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ],

    slashData: new SlashCommandBuilder()
        .setName('botstats')
        .setDescription('View Infinity bot statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        try {
            if (!OWNER_IDS.includes(interaction.user.id)) {
                return safeReply(interaction, {
                    content: '❌ This command is restricted to the bot owner.'
                }, true);
            }

            const client = interaction.client;

            const totalServers = client.guilds.cache.size;

            const totalUsers = client.guilds.cache.reduce(
                (acc, guild) => acc + (guild.memberCount || 0),
                0
            );

            const totalChannels = client.channels.cache.size;
            const totalCommands = client.commands.size;

            const apiPing = Math.round(client.ws.ping);

            const ramUsage = formatMemory(process.memoryUsage().heapUsed);

            const uptime = formatUptime(client.uptime);

            const embed = new EmbedBuilder()
                .setColor('#00bfff')
                .setAuthor({
                    name: 'Infinity Bot Statistics',
                    iconURL: client.user.displayAvatarURL()
                })
                .setTitle('📊 Infinity System Overview')
                .setDescription(
                    'Real-time statistics and performance information for Infinity.'
                )
                .addFields(
                    {
                        name: '🌍 Servers',
                        value: `\`${totalServers.toLocaleString()}\``,
                        inline: true
                    },
                    {
                        name: '👥 Users',
                        value: `\`${totalUsers.toLocaleString()}\``,
                        inline: true
                    },
                    {
                        name: '📁 Channels',
                        value: `\`${totalChannels.toLocaleString()}\``,
                        inline: true
                    },
                    {
                        name: '⚡ Commands',
                        value: `\`${totalCommands.toLocaleString()}\``,
                        inline: true
                    },
                    {
                        name: '🏓 Ping',
                        value: `\`${apiPing}ms\``,
                        inline: true
                    },
                    {
                        name: '🧠 RAM Usage',
                        value: `\`${ramUsage}\``,
                        inline: true
                    },
                    {
                        name: '⏱️ Uptime',
                        value: `\`${uptime}\``,
                        inline: true
                    },
                    {
                        name: '📦 Discord.js',
                        value: `\`v${discordJsVersion}\``,
                        inline: true
                    },
                    {
                        name: '🟢 Node.js',
                        value: `\`${process.version}\``,
                        inline: true
                    },
                    {
                        name: '💻 Host System',
                        value: `\`${os.platform()} ${os.release()}\``,
                        inline: false
                    }
                )
                .setFooter({ text: 'Infinity Bot • System Monitor ⚡' })
                .setTimestamp();

            return safeReply(interaction, {
                embeds: [embed]
            }, true);

        } catch (error) {
            console.error('Bot Stats Error:', error);

            return safeReply(interaction, {
                content: '❌ Failed to fetch bot statistics.'
            }, true);
        }
    }
};
