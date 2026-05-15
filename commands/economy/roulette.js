const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const {
    getUser,
    addWallet,
    removeWallet,
    formatMoney
} = require('../../utils/economy');

const {
    safeReply,
    safeDefer
} = require('../../handlers/interactions/safeReply');

const MIN_BET = 100;
const MAX_BET = 250000;

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

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

function getRouletteColor(number) {
    if (number === 0) return 'green';
    return RED_NUMBERS.has(number) ? 'red' : 'black';
}

function getColorEmoji(color) {
    if (color === 'red') return '🔴';
    if (color === 'black') return '⚫';
    return '🟢';
}

function parseChoice(input) {
    const choice = String(input || '').toLowerCase();

    if (['red', 'r'].includes(choice)) return 'red';
    if (['black', 'b'].includes(choice)) return 'black';
    if (['green', 'zero', '0', 'g'].includes(choice)) return 'green';
    if (['even', 'e'].includes(choice)) return 'even';
    if (['odd', 'o'].includes(choice)) return 'odd';
    if (['number', 'num', 'n'].includes(choice)) return 'number';

    return null;
}

module.exports = {
    name: 'roulette',
    description: 'Bet coins on roulette.',
    usage: '!roulette <red/black/green/even/odd/number> <bet> [number]',
    category: 'economy',
    aliases: ['roul'],
    cooldown: 5,
    botPermissions: [PermissionFlagsBits.EmbedLinks],

    slashData: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Bet coins on roulette')
        .addStringOption(option =>
            option.setName('choice')
                .setDescription('What you want to bet on')
                .setRequired(true)
                .addChoices(
                    { name: 'Red', value: 'red' },
                    { name: 'Black', value: 'black' },
                    { name: 'Green', value: 'green' },
                    { name: 'Even', value: 'even' },
                    { name: 'Odd', value: 'odd' },
                    { name: 'Number', value: 'number' }
                )
        )
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('Amount of coins to bet')
                .setMinValue(MIN_BET)
                .setMaxValue(MAX_BET)
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('number')
                .setDescription('Choose a number from 0 to 36 if betting on Number')
                .setMinValue(0)
                .setMaxValue(36)
                .setRequired(false)
        ),

    async executePrefix(message, args) {
        const choice = parseChoice(args[0]);
        const bet = Number(args[1]);
        const number = args[2] !== undefined ? Number(args[2]) : null;

        if (!choice || !Number.isInteger(bet)) {
            return message.reply({
                content:
                    '❌ Usage: `!roulette <red/black/green/even/odd/number> <bet> [number]`\n' +
                    'Example: `!roulette red 500`\n' +
                    'Example: `!roulette number 500 17`'
            });
        }

        return runRoulette(message, choice, bet, number);
    },

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        const choice = interaction.options.getString('choice', true);
        const bet = interaction.options.getInteger('bet', true);
        const number = interaction.options.getInteger('number');

        return runRoulette(interaction, choice, bet, number);
    }
};

async function runRoulette(ctx, choice, bet, chosenNumber = null) {
    try {
        const guildId = ctx.guild.id;
        const user = ctx.user || ctx.author;
        const userId = user.id;

        if (!['red', 'black', 'green', 'even', 'odd', 'number'].includes(choice)) {
            return respond(ctx, {
                content: '❌ Choose **red**, **black**, **green**, **even**, **odd**, or **number**.'
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

        if (choice === 'number') {
            if (!Number.isInteger(chosenNumber) || chosenNumber < 0 || chosenNumber > 36) {
                return respond(ctx, {
                    content: '❌ When betting on **number**, choose a number from **0** to **36**.'
                }, true);
            }
        }

        if (choice !== 'number' && chosenNumber !== null) {
            return respond(ctx, {
                content: '❌ The `number` option is only used when your choice is **Number**.'
            }, true);
        }

        const data = await getUser(guildId, userId);
        const wallet = Number(data.wallet || 0);

        if (wallet < bet) {
            return respond(ctx, {
                content: `❌ You do not have enough money.\nWallet: **${formatMoney(wallet)}**`
            }, true);
        }

        const rolledNumber = Math.floor(Math.random() * 37);
        const rolledColor = getRouletteColor(rolledNumber);

        let won = false;
        let multiplier = 0;
        let displayChoice = choice.toUpperCase();

        if (choice === 'red' || choice === 'black' || choice === 'green') {
            won = rolledColor === choice;
            multiplier = choice === 'green' ? 14 : 2;
        }

        if (choice === 'even') {
            won = rolledNumber !== 0 && rolledNumber % 2 === 0;
            multiplier = 2;
        }

        if (choice === 'odd') {
            won = rolledNumber !== 0 && rolledNumber % 2 === 1;
            multiplier = 2;
        }

        if (choice === 'number') {
            won = rolledNumber === chosenNumber;
            multiplier = 35;
            displayChoice = `NUMBER ${chosenNumber}`;
        }

        const totalWon = won ? Math.floor(bet * multiplier) : 0;
        const profit = won ? totalWon - bet : 0;

        if (won) {
            await addWallet(
                guildId,
                userId,
                profit,
                'roulette_win',
                `Roulette won on ${displayChoice}`
            );
        } else {
            await removeWallet(
                guildId,
                userId,
                bet,
                'roulette_loss',
                `Roulette lost on ${displayChoice}`
            );
        }

        const newWallet = won ? wallet + profit : wallet - bet;
        const colorEmoji = getColorEmoji(rolledColor);

        const embed = new EmbedBuilder()
            .setColor(won ? '#00ff99' : '#ff4d4d')
            .setAuthor({
                name: `${user.username}'s Roulette Spin`,
                iconURL: user.displayAvatarURL({ dynamic: true })
            })
            .setTitle(won ? '🎰 Roulette Win!' : '🎰 Roulette Lost')
            .addFields(
                {
                    name: '🎰 Roulette Spin',
                    value:
                        `Choice: ${displayChoice}\n` +
                        `Rolled Number: ${rolledNumber}\n` +
                        `Rolled Color: ${colorEmoji} ${rolledColor.toUpperCase()}\n\u200b`,
                    inline: false
                },

                {
                    name: '💰 Betting Information',
                    value:
                        `Bet Amount: ${formatMoney(bet)}\n` +
                        `Multiplier: x${multiplier}\n` +
                        `${won ? 'Profit' : 'Lost'}: ${won ? formatMoney(profit) : formatMoney(bet)}\n` +
                        `Wallet Balance: ${formatMoney(newWallet)}\n\u200b`,
                    inline: false
                },

                {
                    name: '📈 Result',
                    value: won
                        ? '✅ Your roulette bet won!'
                        : '❌ Your roulette bet lost.',
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Casino • Roulette ⚡' })
            .setTimestamp();

        return publicResult(ctx, { embeds: [embed] });

    } catch (error) {
        console.error('Roulette command error:', error);

        return respond(ctx, {
            content: '❌ Something went wrong while spinning roulette.'
        }, true);
    }
}