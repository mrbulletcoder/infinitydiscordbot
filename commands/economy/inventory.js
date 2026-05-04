const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
    getInventory,
    getShopItem
} = require('../../utils/economy');
const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

module.exports = {
    name: 'inventory',
    description: 'View your economy inventory.',
    usage: '/inventory [user]',
    category: 'economy',
    aliases: ['inv'],
    botPermissions: [
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View your economy inventory')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to view')
                .setRequired(false)
        ),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;
        
        const target = interaction.options.getUser('user') || interaction.user;
        const rows = await getInventory(interaction.guild.id, target.id);

        if (!rows.length) {
            return safeReply(interaction, {
                content: target.id === interaction.user.id
                    ? '🎒 Your inventory is empty. Use `/shop` to buy items.'
                    : `🎒 **${target.username}** has an empty inventory.`
            }, true);
        }

        const lines = rows.map(row => {
            const item = getShopItem(row.item_id);

            if (!item) {
                return `❔ **Unknown Item** \`${row.item_id}\` × **${row.quantity}**`;
            }

            return `${item.emoji} **${item.name}** × **${row.quantity}**\n> ${item.description}`;
        });

        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setAuthor({
                name: `${target.username}'s Inventory`,
                iconURL: target.displayAvatarURL()
            })
            .setDescription(lines.join('\n\n').slice(0, 4096))
            .setFooter({ text: 'Infinity Economy Inventory ⚡' })
            .setTimestamp();

        return safeReply(interaction, { embeds: [embed] }, true);
    }
};