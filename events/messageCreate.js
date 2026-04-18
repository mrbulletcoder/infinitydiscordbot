require('dotenv').config({ quiet: true });

const prefix = process.env.PREFIX || '!';
const automod = require('../utils/automod');
const { checkPrefixPermission } = require('../utils/checkPermissions');
const { giveMessageXp } = require('../utils/rank');
const { afkUsers } = require('../commands/general/afk');

module.exports = {
    name: 'messageCreate',

    async execute(message, client) {
        // ==================================================
        // BASIC SAFETY CHECKS
        // ==================================================
        if (message.author.bot || !message.guild) return;

        // ==================================================
        // AFK: REMOVE AFK STATUS WHEN USER SPEAKS
        // ==================================================
        if (afkUsers.has(message.author.id)) {
            afkUsers.delete(message.author.id);

            await message.reply({
                content: '👋 Welcome back! Your AFK status has been removed.'
            }).catch(() => { });
        }

        // ==================================================
        // AFK: NOTIFY IF MENTIONED USER IS AFK
        // ==================================================
        if (message.mentions.users.size > 0) {
            const afkReplies = [];

            message.mentions.users.forEach(user => {
                if (user.bot) return;
                if (!afkUsers.has(user.id)) return;
                if (user.id === message.author.id) return;

                const afkData = afkUsers.get(user.id);

                afkReplies.push(
                    `😴 **${user.tag} is AFK**\n` +
                    `**Reason:** ${afkData.reason}\n` +
                    `**Since:** <t:${Math.floor(afkData.timestamp / 1000)}:R>`
                );
            });

            if (afkReplies.length > 0) {
                await message.reply({
                    content: afkReplies.join('\n\n')
                }).catch(() => { });
            }
        }

        // ==================================================
        // AUTOMOD
        // ==================================================
        try {
            await automod(message);
        } catch (err) {
            console.error('AutoMod Error:', err);
        }

        // ==================================================
        // XP SYSTEM
        // GIVE XP ONLY FOR NORMAL MESSAGES, NOT COMMANDS
        // ==================================================
        try {
            const isCommand = message.content.startsWith(prefix);

            if (!isCommand) {
                await giveMessageXp(message);
            }
        } catch (error) {
            console.error('Rank XP error:', error);
        }

        // ==================================================
        // PREFIX COMMAND CHECK
        // STOP HERE IF MESSAGE IS NOT A PREFIX COMMAND
        // ==================================================
        if (!message.content.startsWith(prefix)) return;

        // ==================================================
        // ARGUMENT / COMMAND PARSING
        // ==================================================
        const args = message.content
            .slice(prefix.length)
            .trim()
            .split(/ +/);

        const commandName = args.shift()?.toLowerCase();
        if (!commandName) return;

        // ==================================================
        // FIND COMMAND
        // ==================================================
        const command =
            client.commands.get(commandName) ||
            client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

        if (!command) return;

        // ==================================================
        // PREFIX SUPPORT CHECK
        // ==================================================
        if (!command.executePrefix) {
            return message.reply('❌ This command can only be used as a slash command.');
        }

        // ==================================================
        // PERMISSION CHECK
        // ==================================================
        const allowed = await checkPrefixPermission(message, command);
        if (!allowed) return;

        // ==================================================
        // EXECUTE PREFIX COMMAND
        // ==================================================
        try {
            await command.executePrefix(message, args);
        } catch (error) {
            console.error(`Error in command "${command.name}":`, error);
            return message.reply('❌ Error executing command.');
        }
    }
};