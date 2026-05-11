const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const {
    getUser,
    addWallet,
    removeWallet,
    formatMoney
} = require('../../utils/economy');

const {
    safeReply,
    safeDefer,
    safeDeferUpdate
} = require('../../handlers/interactions/safeReply');

const MIN_BET = 100;
const MAX_BET = 250000;

const activeGames = new Map();

function respond(ctx, options) {
    if (ctx.user) return safeReply(ctx, options, true);
    return ctx.reply(options);
}

function drawCard() {
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits = ['♠️', '♥️', '♦️', '♣️'];

    return {
        value: values[Math.floor(Math.random() * values.length)],
        suit: suits[Math.floor(Math.random() * suits.length)]
    };
}

function cardDisplay(card) {
    return `${card.value}${card.suit}`;
}

function handDisplay(hand, hideFirst = false) {
    if (hideFirst) {
        return `🂠 ${hand.slice(1).map(cardDisplay).join(' ')}`;
    }

    return hand.map(cardDisplay).join(' ');
}

function handValue(hand) {
    let total = 0;
    let aces = 0;

    for (const card of hand) {
        if (card.value === 'A') {
            total += 11;
            aces++;
        } else if (['J', 'Q', 'K'].includes(card.value)) {
            total += 10;
        } else {
            total += Number(card.value);
        }
    }

    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }

    return total;
}

function isBlackjack(hand) {
    return hand.length === 2 && handValue(hand) === 21;
}

function buildButtons(gameId, disabled = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`blackjack_hit_${gameId}`)
                .setLabel('Hit')
                .setEmoji('🃏')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disabled),

            new ButtonBuilder()
                .setCustomId(`blackjack_stand_${gameId}`)
                .setLabel('Stand')
                .setEmoji('🛑')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled)
        )
    ];
}

function buildGameEmbed({
    user,
    playerHand,
    dealerHand,
    bet,
    wallet,
    status = 'playing',
    resultText = null,
    profit = 0,
    hideDealer = true
}) {
    const playerValue = handValue(playerHand);
    const dealerValue = hideDealer ? '?' : handValue(dealerHand);

    const color =
        status === 'win' ? '#00ff99' :
        status === 'lose' ? '#ff4d4d' :
        status === 'push' ? '#ffaa00' :
        '#5865f2';

    const title =
        status === 'win' ? '🃏 Blackjack Win!' :
        status === 'lose' ? '💥 Blackjack Lost' :
        status === 'push' ? '🤝 Blackjack Push' :
        '🃏 Blackjack';

    return new EmbedBuilder()
        .setColor(color)
        .setAuthor({
            name: `${user.username}'s Blackjack`,
            iconURL: user.displayAvatarURL({ dynamic: true })
        })
        .setTitle(title)
        .setDescription(
            `${resultText ? `# ${resultText}\n\n` : ''}` +

            `╭─ **🃏 BLACKJACK TABLE** ─╮\n` +
            `│ 🎰 **Bet:** ${formatMoney(bet)}\n` +
            `│ 🧑 **Your Hand:** ${handDisplay(playerHand)}\n` +
            `│ 🔢 **Your Total:** ${playerValue}\n` +
            `│ 🤖 **Dealer Hand:** ${handDisplay(dealerHand, hideDealer)}\n` +
            `│ 🔢 **Dealer Total:** ${dealerValue}\n` +
            `${status !== 'playing' ? `│ ${profit >= 0 ? '💰 **Profit:**' : '💸 **Lost:**'} ${formatMoney(Math.abs(profit))}\n` : ''}` +
            `│ 👛 **Wallet:** ${formatMoney(wallet)}\n` +
            `╰──────────────────────╯`
        )
        .setFooter({ text: 'Infinity Casino • Blackjack ⚡' })
        .setTimestamp();
}

module.exports = {
    name: 'blackjack',
    description: 'Play blackjack against the dealer.',
    usage: '!blackjack <bet> / /blackjack bet',
    category: 'economy',
    aliases: ['bj'],
    cooldown: 5,
    botPermissions: [PermissionFlagsBits.EmbedLinks],

    slashData: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Play blackjack against the dealer')
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('Amount of coins to bet')
                .setRequired(true)
                .setMinValue(MIN_BET)
                .setMaxValue(MAX_BET)
        ),

    async executePrefix(message, args) {
        const bet = Number(args[0]);

        if (!Number.isInteger(bet)) {
            return message.reply({
                content: '❌ Usage: `!blackjack <bet>`'
            });
        }

        return startBlackjack(message, bet);
    },

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        const bet = interaction.options.getInteger('bet', true);
        return startBlackjack(interaction, bet);
    },

    activeGames,
    handleBlackjackButton
};

async function startBlackjack(ctx, bet) {
    try {
        const guildId = ctx.guild.id;
        const user = ctx.user || ctx.author;
        const userId = user.id;

        if (bet < MIN_BET) {
            return respond(ctx, {
                content: `❌ Minimum bet is **${formatMoney(MIN_BET)}**.`
            });
        }

        if (bet > MAX_BET) {
            return respond(ctx, {
                content: `❌ Maximum bet is **${formatMoney(MAX_BET)}**.`
            });
        }

        const data = await getUser(guildId, userId);
        const wallet = Number(data.wallet || 0);

        if (wallet < bet) {
            return respond(ctx, {
                content: `❌ You only have **${formatMoney(wallet)}** in your wallet.`
            });
        }

        const existingGame = [...activeGames.values()].find(game =>
            game.guildId === guildId &&
            game.userId === userId &&
            !game.finished
        );

        if (existingGame) {
            return respond(ctx, {
                content: '❌ You already have an active blackjack game.'
            });
        }

        await removeWallet(
            guildId,
            userId,
            bet,
            'blackjack_start',
            'Started Blackjack game'
        );

        const gameId = `${userId}_${Date.now()}`;

        const game = {
            gameId,
            guildId,
            userId,
            bet,
            playerHand: [drawCard(), drawCard()],
            dealerHand: [drawCard(), drawCard()],
            finished: false
        };

        activeGames.set(gameId, game);

        const newWallet = wallet - bet;

        if (isBlackjack(game.playerHand)) {
            game.finished = true;
            activeGames.delete(gameId);

            const winnings = Math.floor(bet * 2.5);
            const profit = winnings - bet;

            await addWallet(
                guildId,
                userId,
                winnings,
                'blackjack_blackjack',
                'Blackjack natural win'
            );

            const embed = buildGameEmbed({
                user,
                playerHand: game.playerHand,
                dealerHand: game.dealerHand,
                bet,
                wallet: newWallet + winnings,
                status: 'win',
                resultText: '🎉 BLACKJACK!',
                profit,
                hideDealer: false
            });

            return respond(ctx, {
                embeds: [embed],
                components: buildButtons(gameId, true)
            });
        }

        const embed = buildGameEmbed({
            user,
            playerHand: game.playerHand,
            dealerHand: game.dealerHand,
            bet,
            wallet: newWallet,
            status: 'playing',
            hideDealer: true
        });

        return respond(ctx, {
            embeds: [embed],
            components: buildButtons(gameId)
        });

    } catch (error) {
        console.error('Blackjack start error:', error);

        return respond(ctx, {
            content: '❌ Failed to start blackjack.'
        });
    }
}

async function handleBlackjackButton(interaction) {
    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    const parts = interaction.customId.split('_');
    const action = parts[1];
    const gameId = parts.slice(2).join('_');

    const game = activeGames.get(gameId);

    if (!game || game.finished) {
        return safeReply(interaction, {
            content: '❌ This blackjack game has expired or already ended.',
            components: []
        }, true);
    }

    if (interaction.user.id !== game.userId) {
        return safeReply(interaction, {
            content: '❌ This is not your blackjack game.'
        }, true);
    }

    const user = interaction.user;
    const data = await getUser(game.guildId, game.userId);
    const wallet = Number(data.wallet || 0);

    if (action === 'hit') {
        game.playerHand.push(drawCard());

        const playerTotal = handValue(game.playerHand);

        if (playerTotal > 21) {
            game.finished = true;
            activeGames.delete(gameId);

            const embed = buildGameEmbed({
                user,
                playerHand: game.playerHand,
                dealerHand: game.dealerHand,
                bet: game.bet,
                wallet,
                status: 'lose',
                resultText: '💥 You Busted!',
                profit: -game.bet,
                hideDealer: false
            });

            return safeReply(interaction, {
                embeds: [embed],
                components: buildButtons(gameId, true)
            });
        }

        const embed = buildGameEmbed({
            user,
            playerHand: game.playerHand,
            dealerHand: game.dealerHand,
            bet: game.bet,
            wallet,
            status: 'playing',
            hideDealer: true
        });

        return safeReply(interaction, {
            embeds: [embed],
            components: buildButtons(gameId)
        });
    }

    if (action === 'stand') {
        game.finished = true;
        activeGames.delete(gameId);

        while (handValue(game.dealerHand) < 17) {
            game.dealerHand.push(drawCard());
        }

        const playerTotal = handValue(game.playerHand);
        const dealerTotal = handValue(game.dealerHand);

        let status = 'lose';
        let resultText = '❌ Dealer Wins!';
        let profit = -game.bet;
        let payout = 0;

        if (dealerTotal > 21) {
            status = 'win';
            resultText = '✅ Dealer Busted!';
            payout = game.bet * 2;
            profit = game.bet;
        } else if (playerTotal > dealerTotal) {
            status = 'win';
            resultText = '✅ You Beat the Dealer!';
            payout = game.bet * 2;
            profit = game.bet;
        } else if (playerTotal === dealerTotal) {
            status = 'push';
            resultText = '🤝 Push! Bet Returned.';
            payout = game.bet;
            profit = 0;
        }

        if (payout > 0) {
            await addWallet(
                game.guildId,
                game.userId,
                payout,
                status === 'push' ? 'blackjack_push' : 'blackjack_win',
                resultText
            );
        }

        const updatedWallet = wallet + payout;

        const embed = buildGameEmbed({
            user,
            playerHand: game.playerHand,
            dealerHand: game.dealerHand,
            bet: game.bet,
            wallet: updatedWallet,
            status,
            resultText,
            profit,
            hideDealer: false
        });

        return safeReply(interaction, {
            embeds: [embed],
            components: buildButtons(gameId, true)
        });
    }
}