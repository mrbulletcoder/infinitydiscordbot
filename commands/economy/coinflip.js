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

function parseSide(input) {
    const side = String(input || '').toLowerCase();

    if (['heads', 'head', 'h'].includes(side)) return 'heads';
    if (['tails', 'tail', 't'].includes(side)) return 'tails';

    return null;
}

module.exports = {
    name: 'coinflip',
    description: 'Bet coins on heads or tails.',
    usage: '!coinflip <heads/tails> <bet> / /coinflip side bet',
    category: 'economy',
    aliases: ['cf', 'flip'],
    cooldown: 5,
    botPermissions: [
        PermissionFlagsBits.EmbedLinks
    ],

    slashData: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Bet coins on heads or tails')
        .addStringOption(option =>
            option.setName('side')
                .setDescription('Choose heads or tails')
                .setRequired(true)
                .addChoices(
                    { name: 'Heads', value: 'heads' },
                    { name: 'Tails', value: 'tails' }
                )
        )
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('Amount of coins to bet')
                .setMinValue(MIN_BET)
                .setMaxValue(MAX_BET)
                .setRequired(true)
        ),

    async executePrefix(message, args) {
        const side = parseSide(args[0]);
        const bet = Number(args[1]);

        if (!side || !Number.isInteger(bet)) {
            return message.reply({
                content: `❌ Usage: \`!coinflip <heads/tails> <bet>\`\nExample: \`!coinflip heads 500\``
            });
        }

        return runCoinflip(message, side, bet);
    },

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        const side = interaction.options.getString('side', true);
        const bet = interaction.options.getInteger('bet', true);

        return runCoinflip(interaction, side, bet);
    }
};

async function runCoinflip(ctx, side, bet) {
    try {
        const guildId = ctx.guild.id;
        const user = ctx.user || ctx.author;
        const userId = user.id;

        if (!side || !['heads', 'tails'].includes(side)) {
            return respond(ctx, {
                content: '❌ Choose either **heads** or **tails**.'
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

        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const won = side === result;

        if (won) {
            await addWallet(guildId, userId, bet, 'coinflip_win', `Coinflip won on ${side}`);
        } else {
            await removeWallet(guildId, userId, bet, 'coinflip_loss', `Coinflip lost on ${side}`);
        }

        const embed = new EmbedBuilder()
            .setColor(won ? '#00ff99' : '#ff4d4d')
            .setAuthor({
                name: `${user.username}'s Coinflip`,
                iconURL: user.displayAvatarURL({ dynamic: true })
            })
            .setTitle(won ? '🪙 Coinflip Win!' : '🪙 Coinflip Lost')
            .addFields(
                {
                    name: '🪙 Coin Result',
                    value:
                        `Coin Landed On: ${result.toUpperCase()}\n` +
                        `Your Choice: ${side.toUpperCase()}\n\u200b`,
                    inline: false
                },

                {
                    name: '💰 Betting Information',
                    value:
                        `Bet Amount: ${formatMoney(bet)}\n` +
                        `${won ? 'Profit' : 'Lost'}: ${formatMoney(bet)}\n` +
                        `Result: ${won ? '✅ You won!' : '❌ You lost!'}\n` +
                        `Wallet Balance: ${formatMoney(won ? wallet + bet : wallet - bet)}\n\u200b`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Casino • Coinflip ⚡' })
            .setTimestamp();

        if (ctx.user) {

            return ctx.channel.send({
                embeds: [embed]
            });
        }

        return publicResult(ctx, { embeds: [embed] });

    } catch (error) {
        console.error('Coinflip command error:', error);

        return respond(ctx, {
            content: '❌ Something went wrong while flipping the coin.'
        }, true);
    }
}