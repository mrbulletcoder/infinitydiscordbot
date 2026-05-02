const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    getUser,
    addWallet,
    removeWallet,
    setCooldown,
    getRemaining,
    formatMoney,
    formatTime,
    getInventory
} = require('../../utils/economy');
const { safeReply } = require('../../handlers/interactions/safeReply');

const COOLDOWN = 15 * 60 * 1000;
const MIN_TARGET_WALLET = 500;
const MIN_ROBBER_WALLET = 250;

module.exports = {
    name: 'rob',
    description: 'Try to rob another user.',
    usage: '/rob user:<user>',
    category: 'economy',
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('Try to rob another user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to rob')
                .setRequired(true)
        ),

    async executeSlash(interaction) {
        const guildId = interaction.guild.id;
        const robber = interaction.user;
        const target = interaction.options.getUser('user', true);

        if (target.bot) {
            return safeReply(interaction, { content: '❌ You cannot rob bots.' }, true);
        }

        if (target.id === robber.id) {
            return safeReply(interaction, { content: '❌ You cannot rob yourself.' }, true);
        }

        const robberData = await getUser(guildId, robber.id);
        const targetData = await getUser(guildId, target.id);

        const remaining = getRemaining(robberData.last_rob, COOLDOWN);

        if (remaining > 0) {
            return safeReply(interaction, {
                content: `⏳ You need to lay low. Try again in **${formatTime(remaining)}**.`
            }, true);
        }

        if (Number(robberData.wallet) < MIN_ROBBER_WALLET) {
            return safeReply(interaction, {
                content: `❌ You need at least **${formatMoney(MIN_ROBBER_WALLET)}** in your wallet to rob someone.`
            }, true);
        }

        if (Number(targetData.wallet) < MIN_TARGET_WALLET) {
            return safeReply(interaction, {
                content: `❌ ${target} does not have enough money in their wallet to rob.`
            }, true);
        }

        const targetInventory = await getInventory(guildId, target.id);
        const hasBankShield = targetInventory.some(item =>
            item.item_id === 'bank_shield' && Number(item.quantity) > 0
        );

        const successChance = hasBankShield ? 0.25 : 0.45;
        const success = Math.random() < successChance;

        await setCooldown(guildId, robber.id, 'last_rob');

        if (success) {
            const maxSteal = Math.floor(Number(targetData.wallet) * 0.35);
            const stolen = Math.max(100, Math.floor(Math.random() * maxSteal) + 1);

            await removeWallet(guildId, target.id, stolen, 'robbed', `Robbed by ${robber.id}`);
            await addWallet(guildId, robber.id, stolen, 'rob_success', `Robbed ${target.id}`);

            const embed = new EmbedBuilder()
                .setColor('#00ff99')
                .setTitle('💀 Robbery Successful')
                .setDescription(`${robber} robbed ${target} and escaped with **${formatMoney(stolen)}**.`)
                .addFields(
                    { name: '🎯 Target', value: `${target.tag}\n\`${target.id}\``, inline: true },
                    { name: '🕵️ Robber', value: `${robber.tag}\n\`${robber.id}\``, inline: true },
                    { name: '🛡️ Protection', value: hasBankShield ? '`Bank Shield Active`' : '`None`', inline: true }
                )
                .setFooter({ text: 'Infinity Economy • Crime System ⚡' })
                .setTimestamp();

            return safeReply(interaction, { embeds: [embed] }, true);
        }

        const fine = Math.min(
            Number(robberData.wallet),
            Math.floor(Math.random() * 600) + 200
        );

        await removeWallet(guildId, robber.id, fine, 'rob_failed', `Failed robbery against ${target.id}`);

        const embed = new EmbedBuilder()
            .setColor('#ff4d4d')
            .setTitle('🚔 Robbery Failed')
            .setDescription(`${robber} tried to rob ${target}, but got caught and paid **${formatMoney(fine)}**.`)
            .addFields(
                { name: '🎯 Target', value: `${target.tag}\n\`${target.id}\``, inline: true },
                { name: '💸 Fine', value: formatMoney(fine), inline: true },
                { name: '🛡️ Protection', value: hasBankShield ? '`Bank Shield Helped`' : '`None`', inline: true }
            )
            .setFooter({ text: 'Infinity Economy • Crime System ⚡' })
            .setTimestamp();

        return safeReply(interaction, { embeds: [embed] }, true);
    }
};