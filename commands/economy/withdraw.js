const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getUser, formatMoney } = require('../../utils/economy');
const { pool } = require('../../database');
const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

module.exports = {
    name: 'withdraw',
    description: 'Withdraw money from your bank.',
    category: 'economy',
    botPermissions: [
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('Withdraw money from your bank')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to withdraw')
                .setMinValue(1)
                .setRequired(true)
        ),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;
        
        const amount = interaction.options.getInteger('amount', true);
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        const user = await getUser(guildId, userId);

        if (user.bank < amount) {
            return safeReply(interaction, {
                content: `❌ Not enough money in bank.\nBank: ${formatMoney(user.bank)}`
            }, true);
        }

        await pool.query(
            `UPDATE economy_users SET bank = bank - ?, wallet = wallet + ? WHERE guild_id = ? AND user_id = ?`,
            [amount, amount, guildId, userId]
        );

        const embed = new EmbedBuilder()
            .setColor('#00ff99')
            .setTitle('💸 Withdrawal Successful')
            .setDescription(`Withdrew **${formatMoney(amount)}** from your bank.`)
            .setFooter({ text: 'Infinity Economy System ⚡' })
            .setTimestamp();

        return safeReply(interaction, { embeds: [embed] }, true);
    }
};