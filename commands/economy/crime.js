const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { addWallet, removeWallet, getUser, setCooldown, getRemaining, formatMoney, formatTime } = require('../../utils/economy');
const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

const COOLDOWN = 10 * 60 * 1000;

module.exports = {
    name: 'crime',
    description: 'Commit a crime for big rewards (or lose money).',
    category: 'economy',
    botPermissions: [
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 0,

    slashData: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Commit a risky crime'),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;
        
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        const user = await getUser(guildId, userId);
        const remaining = getRemaining(user.last_crime, COOLDOWN);

        if (remaining > 0) {
            return safeReply(interaction, {
                content: `⏳ Try again in **${formatTime(remaining)}**`
            }, true);
        }

        const success = Math.random() < 0.6;

        let embed;

        if (success) {
            const amount = Math.floor(Math.random() * 1500) + 500;

            await addWallet(guildId, userId, amount, 'crime_success');
            embed = new EmbedBuilder()
                .setColor('#00ff99')
                .setTitle('💰 Crime Success')
                .setDescription(`You got away and earned **${formatMoney(amount)}**`);
        } else {
            const loss = Math.floor(Math.random() * 800) + 200;

            await removeWallet(guildId, userId, loss, 'crime_fail');
            embed = new EmbedBuilder()
                .setColor('#ff4d4d')
                .setTitle('🚔 You got caught!')
                .setDescription(`You paid a fine of **${formatMoney(loss)}**`);
        }

        await setCooldown(guildId, userId, 'last_crime');

        embed.setFooter({ text: 'Infinity Economy System ⚡' }).setTimestamp();

        return safeReply(interaction, { embeds: [embed] }, true);
    }
};