const os = require('os');
const { ActivityType, version: discordJsVersion } = require('discord.js');
const { initGiveawayScheduler } = require('../utils/giveaway');
const { box, success, colors } = require('../utils/consoleLogger');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        const permanentBio =
            'Infinity is an all-in-one Discord bot for moderation, AutoMod, tickets, economy, reaction roles, giveaways, and more. Built to keep your server safe, organized, and easy to use for everyone.';

        const rotatingActivities = [
            { name: '/help • View all commands', type: ActivityType.Listening },
            { name: '/invite • Add Infinity to your server', type: ActivityType.Watching },
        ];

        // ✅ Giveaway scheduler
        try {
            await initGiveawayScheduler(client);
        } catch (error) {
            console.error('Failed to initialize giveaway scheduler:', error);
        }

        // ✅ Bot bio
        try {
            await client.application.fetch();
            await client.application.edit({
                description: permanentBio
            });
        } catch (error) {
            console.error('Failed to update application bio:', error);
        }

        // ✅ Rotating activity
        try {
            let activityIndex = 0;

            const setRotatingActivity = () => {
                const activity = rotatingActivities[activityIndex];
                client.user.setActivity(activity.name, { type: activity.type });
                activityIndex = (activityIndex + 1) % rotatingActivities.length;
            };

            setRotatingActivity();
            setInterval(setRotatingActivity, 20 * 1000);
        } catch (error) {
            console.error('Failed to start rotating activity:', error);
        }

        // 🔥 NEW: Automod delete cleanup system
        client.recentAutomodDeletes ??= new Map();

        if (!client.automodDeleteCleanupStarted) {
            client.automodDeleteCleanupStarted = true;

            setInterval(() => {
                const now = Date.now();

                for (const [messageId, data] of client.recentAutomodDeletes) {
                    if (now - data.deletedAt > 15_000) {
                        client.recentAutomodDeletes.delete(messageId);
                    }
                }
            }, 30_000);
        }

        // ✅ Stats
        const stats = client.startupStats || {};

        const totalGuilds = client.guilds.cache.size;
        const totalUsers = client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount || 0), 0);
        const ping = client.ws.ping < 0 ? 0 : client.ws.ping;
        const memory = `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`;

        box('⚡ INFINITY STARTUP', [
            { label: 'Database', value: stats.database || 'Connected', color: colors.brightGreen },
            { label: 'Events Loaded', value: stats.eventsLoaded || 0 },
            { label: 'Commands Loaded', value: stats.commandsLoaded || client.commands?.size || 0 },
            { label: 'Slash Commands', value: stats.slashCommands || 0 },
            { label: 'Categories', value: stats.categories || 0 },
            { label: 'Slash Status', value: 'Registered', color: colors.brightGreen }
        ]);

        box('🤖 BOT INFO', [
            { label: 'Bot', value: client.user.tag },
            { label: 'ID', value: client.user.id },
            { label: 'Servers', value: totalGuilds },
            { label: 'Users', value: totalUsers },
            { label: 'Ping', value: `${ping}ms`, color: ping < 100 ? colors.brightGreen : colors.yellow },
            { label: 'Memory', value: memory }
        ]);

        box('🖥️ SYSTEM', [
            { label: 'Node', value: process.version },
            { label: 'discord.js', value: discordJsVersion },
            { label: 'OS', value: `${os.type()} ${os.release()}` },
            { label: 'CPU', value: os.cpus()?.[0]?.model || 'Unknown CPU' }
        ]);

        success(`${client.user.tag} is online`);
        console.log('');
    }
};