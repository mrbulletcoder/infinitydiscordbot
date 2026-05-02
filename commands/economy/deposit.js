const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getUser, formatMoney } = require('../../utils/economy');
const { pool } = require('../../database');
const { safeReply } = require('../../handlers/interactions/safeReply');

module.exports = {
    name: 'deposit',
    description: 'Deposit money into your bank.',
    category: 'economy',
    botPermissions: [
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('Deposit money into your bank')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to deposit')
                .setMinValue(1)
                .setRequired(true)
        ),

    async executeSlash(interaction) {
        const amount = interaction.options.getInteger('amount', true);
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        const user = await getUser(guildId, userId);

        if (user.wallet < amount) {
            return safeReply(interaction, {
                content: `❌ Not enough money in wallet.\nWallet: ${formatMoney(user.wallet)}`
            }, true);
        }

        await pool.query(
            `UPDATE economy_users
     SET wallet = wallet - ?, bank = bank + ?
     WHERE guild_id = ? AND user_id = ?`,
            [amount, amount, guildId, userId]
        );

        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setTitle('🏦 Deposit Successful')
            .setDescription(`Deposited **${formatMoney(amount)}** into your bank.`)
            .setFooter({ text: 'Infinity Economy System ⚡' })
            .setTimestamp();

        return safeReply(interaction, { embeds: [embed] }, true);
    }
};