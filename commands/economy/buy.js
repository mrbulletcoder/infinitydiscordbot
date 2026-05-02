const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    getUser,
    removeWallet,
    addInventoryItem,
    getShopItem,
    getShopItems,
    formatMoney
} = require('../../utils/economy');
const { safeReply } = require('../../handlers/interactions/safeReply');

module.exports = {
    name: 'buy',
    description: 'Buy an item from the economy shop.',
    usage: '/buy item:<item_id> quantity:<amount>',
    category: 'economy',

    slashData: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Buy an item from the economy shop')
        .addStringOption(option =>
            option
                .setName('item')
                .setDescription('Item to buy')
                .setRequired(true)
                .addChoices(
                    ...getShopItems().map(item => ({
                        name: `${item.emoji} ${item.name}`,
                        value: item.id
                    }))
                )
        )
        .addIntegerOption(option =>
            option
                .setName('quantity')
                .setDescription('How many to buy')
                .setMinValue(1)
                .setMaxValue(99)
                .setRequired(false)
        ),

    async executeSlash(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const itemId = interaction.options.getString('item', true);
        const quantity = interaction.options.getInteger('quantity') || 1;

        const item = getShopItem(itemId);

        if (!item) {
            return safeReply(interaction, {
                content: '❌ That item does not exist.'
            }, true);
        }

        const totalCost = item.price * quantity;
        const user = await getUser(guildId, userId);

        if (Number(user.wallet) < totalCost) {
            return safeReply(interaction, {
                content:
                    `❌ You do not have enough money in your wallet.\n` +
                    `**Needed:** ${formatMoney(totalCost)}\n` +
                    `**Wallet:** ${formatMoney(user.wallet)}`
            }, true);
        }

        const removed = await removeWallet(
            guildId,
            userId,
            totalCost,
            'shop_purchase',
            `Bought ${quantity}x ${item.name}`
        );

        if (!removed) {
            return safeReply(interaction, {
                content: '❌ Purchase failed because you do not have enough money.'
            }, true);
        }

        await addInventoryItem(guildId, userId, item.id, quantity);

        const embed = new EmbedBuilder()
            .setColor('#00ff99')
            .setTitle('✅ Purchase Complete')
            .setDescription(`${interaction.user} bought **${quantity}x ${item.emoji} ${item.name}**.`)
            .addFields(
                { name: '💰 Total Cost', value: formatMoney(totalCost), inline: true },
                { name: '🎒 Added To Inventory', value: `\`${quantity}x ${item.id}\``, inline: true }
            )
            .setFooter({ text: 'Infinity Economy Shop ⚡' })
            .setTimestamp();

        return safeReply(interaction, { embeds: [embed] }, true);
    }
};