const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getShopItems, formatMoney } = require('../../utils/economy');
const { safeReply } = require('../../handlers/interactions/safeReply');

module.exports = {
    name: 'shop',
    description: 'View the economy shop.',
    usage: '/shop',
    category: 'economy',
    botPermissions: [
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('View the economy shop'),

    async executeSlash(interaction) {
        const items = getShopItems();

        const embed = new EmbedBuilder()
            .setColor('#ffd700')
            .setTitle('🛒 Infinity Economy Shop')
            .setDescription('Buy items, collect flex pieces, and prepare for future economy upgrades.')
            .addFields(
                items.map(item => ({
                    name: `${item.emoji} ${item.name}`,
                    value:
                        `**ID:** \`${item.id}\`\n` +
                        `**Price:** ${formatMoney(item.price)}\n` +
                        `**Info:** ${item.description}`,
                    inline: false
                }))
            )
            .setFooter({ text: 'Use /buy item:<id> to purchase an item ⚡' })
            .setTimestamp();

        return safeReply(interaction, { embeds: [embed] }, true);
    }
};