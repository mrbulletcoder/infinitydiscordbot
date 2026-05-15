const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getUser, addWallet, removeWallet, formatMoney } = require('../../utils/economy');
const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

const MIN_BET = 100;
const MAX_BET = 250000;

function respond(ctx, options, ephemeral = false) {
    if (ctx.user) {
        return safeReply(ctx, options, ephemeral);
    }

    return ctx.reply(options);
}

async function publicResult(ctx, options) {
    if (ctx.user) {
        const sent = await ctx.channel.send(options);

        await ctx.deleteReply().catch(() => null);

        return sent;
    }

    return ctx.reply(options);
}

function parseGuess(input) {
    const num = Number(input);
    if (!Number.isInteger(num)) return null;
    if (num < 1 || num > 6) return null;
    return num;
}

module.exports = {
    name: 'dice',
    description: 'Bet coins by guessing a dice roll.',
    usage: '!dice <1-6> <bet> / /dice guess bet',
    category: 'economy',
    aliases: ['roll'],
    cooldown: 5,
    botPermissions: [PermissionFlagsBits.EmbedLinks],

    slashData: new SlashCommandBuilder()
        .setName('dice')
        .setDescription('Bet coins by guessing a dice roll')
        .addIntegerOption(option =>
            option.setName('guess')
                .setDescription('Choose a number from 1 to 6')
                .setMinValue(1)
                .setMaxValue(6)
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('Amount of coins to bet')
                .setMinValue(MIN_BET)
                .setMaxValue(MAX_BET)
                .setRequired(true)
        ),

    async executePrefix(message, args) {
        const guess = parseGuess(args[0]);
        const bet = Number(args[1]);

        if (!guess || !Number.isInteger(bet)) {
            return message.reply({
                content: '❌ Usage: `!dice <1-6> <bet>`\nExample: `!dice 4 500`'
            });
        }

        return runDice(message, guess, bet);
    },

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        const guess = interaction.options.getInteger('guess', true);
        const bet = interaction.options.getInteger('bet', true);

        return runDice(interaction, guess, bet);
    }
};

async function runDice(ctx, guess, bet) {
    try {
        const guildId = ctx.guild.id;
        const user = ctx.user || ctx.author;
        const userId = user.id;

        if (!Number.isInteger(guess) || guess < 1 || guess > 6) {
            return respond(ctx, {
                content: '❌ Your guess must be a number from **1** to **6**.'
            }, true);
        }

        if (!Number.isInteger(bet) || bet < MIN_BET) {
            return respond(ctx, {
                content: `❌ Minimum bet is **${formatMoney(MIN_BET)}**.`
            }, true);
        }

        if (bet > MAX_BET) {
            return respond(ctx, {
                content: `❌ Maximum bet is **${formatMoney(MAX_BET)}**.`
            }, true);
        }

        const data = await getUser(guildId, userId);
        const wallet = Number(data.wallet || 0);

        if (wallet < bet) {
            return respond(ctx, {
                content: `❌ You do not have enough money.\nWallet: **${formatMoney(wallet)}**`
            }, true);
        }

        const roll = Math.floor(Math.random() * 6) + 1;
        const won = roll === guess;

        const payout = bet * 5;
        const profit = payout - bet;

        if (won) {
            await addWallet(guildId, userId, profit, 'dice_win', `Dice win guessed ${guess}`);
        } else {
            await removeWallet(guildId, userId, bet, 'dice_loss', `Dice lost guessed ${guess}`);
        }

        const diceEmoji = {
            1: '⚀',
            2: '⚁',
            3: '⚂',
            4: '⚃',
            5: '⚄',
            6: '⚅'
        };

        const embed = new EmbedBuilder()
            .setColor(won ? '#00ff99' : '#ff4d4d')
            .setAuthor({
                name: `${user.username}'s Dice Roll`,
                iconURL: user.displayAvatarURL({ dynamic: true })
            })
            .setTitle(won ? '🎲 Dice Win!' : '🎲 Dice Lost')
            .addFields(
                {
                    name: '🎲 Dice Roll',
                    value:
                        `Your Guess: ${guess}\n` +
                        `Dice Rolled: ${roll} ${diceEmoji[roll]}\n\u200b`,
                    inline: false
                },

                {
                    name: '💰 Betting Information',
                    value:
                        `Bet Amount: ${formatMoney(bet)}\n` +
                        `${won ? 'Profit' : 'Lost'}: ${won ? formatMoney(profit) : formatMoney(bet)}\n` +
                        `Wallet Balance: ${formatMoney(won ? wallet + profit : wallet - bet)}\n\u200b`,
                    inline: false
                },

                {
                    name: '📈 Result',
                    value: won
                        ? '✅ Exact match! You won the dice roll.'
                        : '❌ Wrong guess. Better luck next time.',
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Casino • Dice ⚡' })
            .setTimestamp();

        return publicResult(ctx, { embeds: [embed] });

    } catch (error) {
        console.error('Dice command error:', error);

        return respond(ctx, {
            content: '❌ Something went wrong while rolling the dice.'
        }, true);
    }
}