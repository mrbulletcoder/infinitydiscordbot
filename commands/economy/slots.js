const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
    getUser,
    addWallet,
    removeWallet,
    setCooldown,
    getRemaining,
    formatMoney,
    formatTime
} = require('../../utils/economy');
const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

const COOLDOWN = 30 * 1000;
const MIN_BET = 50;
const MAX_BET = 5000;

const symbols = ['🍒', '🍋', '🍇', '🍉', '⭐', '💎', '7️⃣'];

function spin() {
    return [
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)]
    ];
}

function calculateMultiplier(result) {
    const [a, b, c] = result;

    if (a === '💎' && b === '💎' && c === '💎') return 10;
    if (a === '7️⃣' && b === '7️⃣' && c === '7️⃣') return 8;
    if (a === b && b === c) return 5;
    if (a === b || a === c || b === c) return 2;

    return 0;
}

module.exports = {
    name: 'slots',
    description: 'Play the slot machine and gamble your coins.',
    usage: '/slots <bet>',
    category: 'economy',
    botPermissions: [
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.SendMessages
    ],
    cooldown: 0,

    slashData: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Play the slot machine')
        .addIntegerOption(option =>
            option
                .setName('bet')
                .setDescription(`Bet amount (${MIN_BET} - ${MAX_BET})`)
                .setMinValue(MIN_BET)
                .setMaxValue(MAX_BET)
                .setRequired(true)
        ),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const bet = interaction.options.getInteger('bet', true);

        const user = await getUser(guildId, userId);
        const remaining = getRemaining(user.last_slots, COOLDOWN);

        if (remaining > 0) {
            return safeReply(interaction, {
                content: `⏳ The slot machine is cooling down. Try again in **${formatTime(remaining)}**.`
            }, true);
        }

        if (Number(user.wallet) < bet) {
            return safeReply(interaction, {
                content: `❌ You do not have enough money.\nWallet: ${formatMoney(user.wallet)}`
            }, true);
        }

        await setCooldown(guildId, userId, 'last_slots');

        const result = spin();
        const multiplier = calculateMultiplier(result);
        const display = `┃ ${result.join(' ┃ ')} ┃`;

        let embed;

        if (multiplier > 0) {
            const winnings = bet * multiplier;
            const profit = winnings - bet;

            await removeWallet(guildId, userId, bet, 'slots_bet', 'Slot machine bet');
            await addWallet(guildId, userId, winnings, 'slots_win', `Slots win x${multiplier}`);

            embed = new EmbedBuilder()
                .setColor('#00ff99')
                .setTitle('🎰 Slots Machine')
                .setDescription(
                    '━━━━━━━━━━━━━━━━━━\n' +
                    `# ${display}\n` +
                    '━━━━━━━━━━━━━━━━━━\n\n' +
                    `🎉 **You won!**\n` +
                    `**Bet:** ${formatMoney(bet)}\n` +
                    `**Multiplier:** \`x${multiplier}\`\n` +
                    `**Profit:** ${formatMoney(profit)}`
                );
        } else {
            await removeWallet(guildId, userId, bet, 'slots_loss', 'Slot machine loss');

            embed = new EmbedBuilder()
                .setColor('#ff4d4d')
                .setTitle('🎰 Slots Machine')
                .setDescription(
                    '━━━━━━━━━━━━━━━━━━\n' +
                    `# ${display}\n` +
                    '━━━━━━━━━━━━━━━━━━\n\n' +
                    `💀 **You lost!**\n` +
                    `**Lost:** ${formatMoney(bet)}`
                );
        }

        embed
            .addFields({
                name: '💡 Payouts',
                value:
                    '💎💎💎 = `x10`\n' +
                    '7️⃣7️⃣7️⃣ = `x8`\n' +
                    'Any triple = `x5`\n' +
                    'Any pair = `x2`',
                inline: false
            })
            .setFooter({ text: 'Infinity Casino • Slots ⚡' })
            .setTimestamp();

        return interaction.channel.send({ embeds: [embed] });
    }
};