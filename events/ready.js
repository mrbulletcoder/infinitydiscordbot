const os = require('os');
const { ActivityType, version: discordJsVersion } = require('discord.js');
const { initGiveawayScheduler } = require('../utils/giveaway');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        const colors = {
            reset: '\x1b[0m',
            bold: '\x1b[1m',
            dim: '\x1b[2m',

            red: '\x1b[31m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            blue: '\x1b[34m',
            magenta: '\x1b[35m',
            cyan: '\x1b[36m',
            white: '\x1b[37m',
            gray: '\x1b[90m',

            brightBlue: '\x1b[94m',
            brightCyan: '\x1b[96m',
            brightMagenta: '\x1b[95m',
            brightGreen: '\x1b[92m',
        };

        const color = (code, text) => `${code}${text}${colors.reset}`;

        const getPingColor = (ping) => {
            if (ping < 50) return colors.brightGreen;
            if (ping < 100) return colors.yellow;
            return colors.red;
        };

        // ==================================================
        // BRANDING
        // ==================================================
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

        // ==================================================
        // STARTUP TASKS
        // ==================================================
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

        // ==================================================
        // SYSTEM STATS
        // ==================================================
        const totalGuilds = client.guilds.cache.size;
        const totalUsers = client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount || 0), 0);
        const commands = client.commands?.size || 0;
        const ping = client.ws.ping < 0 ? 0 : client.ws.ping;
        const memory = `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`;
        const nodeVersion = process.version;
        const system = `${os.type()} ${os.release()}`;
        const cpu = trim(os.cpus()?.[0]?.model || 'Unknown CPU', 44);

        // ==================================================
        // FAST PREMIUM CONSOLE OUTPUT
        // ==================================================
        console.clear();

        const header = [
            `${color(colors.brightCyan, '╔════════════════════════════════════════════════════════════════════════════╗')}`,
            `${color(colors.brightCyan, '║')} ${color(colors.brightBlue + colors.bold, '██╗███╗   ██╗███████╗██╗███╗   ██╗██╗████████╗██╗   ██╗')}           ${color(colors.brightCyan, '║')}`,
            `${color(colors.brightCyan, '║')} ${color(colors.brightBlue + colors.bold, '██║████╗  ██║██╔════╝██║████╗  ██║██║╚══██╔══╝╚██╗ ██╔╝')}           ${color(colors.brightCyan, '║')}`,
            `${color(colors.brightCyan, '║')} ${color(colors.brightBlue + colors.bold, '██║██╔██╗ ██║█████╗  ██║██╔██╗ ██║██║   ██║    ╚████╔╝ ')}           ${color(colors.brightCyan, '║')}`,
            `${color(colors.brightCyan, '║')} ${color(colors.brightBlue + colors.bold, '██║██║╚██╗██║██╔══╝  ██║██║╚██╗██║██║   ██║     ╚██╔╝  ')}           ${color(colors.brightCyan, '║')}`,
            `${color(colors.brightCyan, '║')} ${color(colors.brightBlue + colors.bold, '██║██║ ╚████║██║     ██║██║ ╚████║██║   ██║      ██║   ')}           ${color(colors.brightCyan, '║')}`,
            `${color(colors.brightCyan, '║')} ${color(colors.brightBlue + colors.bold, '╚═╝╚═╝  ╚═══╝╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝   ╚═╝      ╚═╝   ')}           ${color(colors.brightCyan, '║')}`,
            `${color(colors.brightCyan, '╠════════════════════════════════════════════════════════════════════════════╣')}`,
            `${color(colors.brightCyan, '║')} ${color(colors.brightGreen + colors.bold, 'STATUS')} ${color(colors.white, 'ONLINE')} ${color(colors.gray, '•')} ${color(colors.brightMagenta, 'Infinity startup complete')}${' '.repeat(24)}${color(colors.brightCyan, '║')}`,
            `${color(colors.brightCyan, '╚════════════════════════════════════════════════════════════════════════════╝')}`,
        ].join('\n');

        console.log(header);
        console.log('');

        printBoxTitle(colors, color, 'CORE');
        printBoxLine(colors, color, 'Bot', client.user.tag);
        printBoxLine(colors, color, 'ID', client.user.id);
        printBoxLine(colors, color, 'Commands', String(commands));
        printBoxLine(colors, color, 'Ping', color(getPingColor(ping), `${ping}ms`), true);
        printBoxLine(colors, color, 'Memory', memory);
        printBoxBottom(colors, color);

        console.log('');

        printBoxTitle(colors, color, 'NETWORK');
        printBoxLine(colors, color, 'Servers', String(totalGuilds));
        printBoxLine(colors, color, 'Users', String(totalUsers));
        printBoxLine(colors, color, 'Activity', rotatingActivities[0].name);
        printBoxLine(colors, color, 'Bio', trim(permanentBio, 46));
        printBoxBottom(colors, color);

        console.log('');

        printBoxTitle(colors, color, 'SYSTEM');
        printBoxLine(colors, color, 'Node', nodeVersion);
        printBoxLine(colors, color, 'discord.js', discordJsVersion);
        printBoxLine(colors, color, 'OS', system);
        printBoxLine(colors, color, 'CPU', cpu);
        printBoxBottom(colors, color);

        console.log('');
        console.log(`${color(colors.brightGreen, '✓')} ${color(colors.white, `${client.user.tag} is online`)}`);
        console.log('');
    }
};

function printBoxTitle(colors, color, title) {
    console.log(color(colors.brightCyan, '╔════════════════════════════════════════════════════════════╗'));
    console.log(
        `${color(colors.brightCyan, '║')} ${color(colors.brightMagenta + colors.bold, title.padEnd(56, ' '))} ${color(colors.brightCyan, '║')}`
    );
    console.log(color(colors.brightCyan, '╠════════════════════════════════════════════════════════════╣'));
}

function printBoxLine(colors, color, label, value, rawValue = false) {
    const plainValue = String(value);
    const visibleValue = trimVisible(plainValue, 42);
    const paddedLabel = label.padEnd(12, ' ');
    const paddedValue = visibleValue.padEnd(42, ' ');

    console.log(
        `${color(colors.brightCyan, '║')} ${color(colors.brightBlue, paddedLabel)} ${color(colors.gray, '•')} ${rawValue ? paddedValue : color(colors.white, paddedValue)} ${color(colors.brightCyan, '║')}`
    );
}

function printBoxBottom(colors, color) {
    console.log(color(colors.brightCyan, '╚════════════════════════════════════════════════════════════╝'));
}

function trim(text, maxLength) {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
}

function trimVisible(text, maxLength) {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
}