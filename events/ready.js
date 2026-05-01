const os = require('os');
const { ActivityType, version: discordJsVersion } = require('discord.js');
const { initGiveawayScheduler } = require('../utils/giveaway');
const { box, success, colors } = require('../utils/consoleLogger');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        const permanentBio =
            'Infinity is a premium moderation and server management bot built for modern Discord communities.';

        const rotatingActivities = [
            { name: 'moderating with precision', type: ActivityType.Watching },
            { name: 'protecting communities', type: ActivityType.Watching },
            { name: '/help for commands', type: ActivityType.Listening },
            { name: 'tickets • automod • moderation', type: ActivityType.Watching },
            { name: 'server management done right', type: ActivityType.Playing },
            { name: 'keeping servers safe', type: ActivityType.Watching },
        ];

        try {
            await initGiveawayScheduler(client);
        } catch (error) {
            console.error('Failed to initialize giveaway scheduler:', error);
        }

        try {
            await client.application.fetch();
            await client.application.edit({
                description: permanentBio
            });
        } catch (error) {
            console.error('Failed to update application bio:', error);
        }

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