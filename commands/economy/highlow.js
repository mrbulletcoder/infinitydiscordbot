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

function randomCard() {
    return Math.floor(Math.random() * 13) + 1;
}

function cardName(value) {
    const names = {
        1: 'A',
        11: 'J',
        12: 'Q',
        13: 'K'
    };

    return names[value] || String(value);
}

function buildEmbed({
    user,
    currentCard,
    multiplier,
    potential,
    wallet,
    bet,
    streak,
    profit = null,
    finished = false,
    won = false,
    lost = false,
    nextCard = null
}) {
    return new EmbedBuilder()
        .setColor(
            won
                ? '#00ff99'
                : lost
                    ? '#ff4d4d'
                    : '#5865f2'
        )
        .setAuthor({
            name: `${user.username}'s HighLow`,
            iconURL: user.displayAvatarURL({ dynamic: true })
        })
        .setTitle(
            won
                ? '🎰 HighLow Cashed Out!'
                : lost
                    ? '💥 HighLow Lost'
                    : '🎲 HighLow'
        )
        .addFields(
            {
                name: '🃏 Current Card',
                value:
                    `${nextCard
                        ? `Revealed Card: ${cardName(nextCard)}\n`
                        : ''
                    }` +
                    `Current Card: ${cardName(currentCard)}\n\u200b`,
                inline: false
            },

            {
                name: '📈 Game Statistics',
                value:
                    `Multiplier: x${multiplier.toFixed(2)}\n` +
                    `Win Streak: ${streak}\n` +
                    `Potential Win: ${formatMoney(potential)}\n\u200b`,
                inline: false
            },

            {
                name: '💰 Betting Information',
                value:
                    `Bet Amount: ${formatMoney(bet)}\n` +
                    `${won ? `Total Won: ${formatMoney(potential)}\n` : ''}` +
                    `${won && profit !== null ? `Profit: ${formatMoney(profit)}\n` : ''}` +
                    `${lost ? `Lost: ${formatMoney(bet)}\n` : ''}` +
                    `Wallet Balance: ${formatMoney(wallet)}\n\u200b`,
                inline: false
            },

            {
                name: '📈 Status',
                value:
                    won
                        ? '✅ You successfully cashed out!'
                        : lost
                            ? '❌ Wrong guess. Game over.'
                            : 'Choose Higher, Lower, or Cash Out.',
                inline: false
            }
        )
        .setFooter({ text: 'Infinity Casino • HighLow ⚡' })
        .setTimestamp();
}

function buildButtons(gameId, disabled = false, currentCard = null) {
    const disableHigher = disabled || currentCard === 13;
    const disableLower = disabled || currentCard === 1;

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`highlow_higher_${gameId}`)
                .setLabel('Higher')
                .setEmoji('📈')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disableHigher),

            new ButtonBuilder()
                .setCustomId(`highlow_lower_${gameId}`)
                .setLabel('Lower')
                .setEmoji('📉')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disableLower),

            new ButtonBuilder()
                .setCustomId(`highlow_cashout_${gameId}`)
                .setLabel('Cash Out')
                .setEmoji('💰')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled)
        )
    ];
}

module.exports = {
    name: 'highlow',
    description: 'Play a game of HighLow.',
    usage: '!highlow <bet> / /highlow bet',
    category: 'economy',
    aliases: ['hl'],
    cooldown: 5,
    botPermissions: [PermissionFlagsBits.EmbedLinks],

    slashData: new SlashCommandBuilder()
        .setName('highlow')
        .setDescription('Play HighLow')
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('Amount to bet')
                .setRequired(true)
                .setMinValue(MIN_BET)
                .setMaxValue(MAX_BET)
        ),

    async executePrefix(message, args) {
        const bet = Number(args[0]);

        if (!Number.isInteger(bet)) {
            return message.reply({
                content: '❌ Usage: `!highlow <bet>`'
            });
        }

        return startGame(message, bet);
    },

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        const bet = interaction.options.getInteger('bet', true);

        return startGame(interaction, bet);
    },

    activeGames,
    handleHighLowButton
};

async function startGame(ctx, bet) {
    try {
        const guildId = ctx.guild.id;
        const user = ctx.user || ctx.author;
        const userId = user.id;

        if (bet < MIN_BET) {
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
                content: `❌ You only have **${formatMoney(wallet)}** in your wallet.`
            }, true);
        }

        await removeWallet(
            guildId,
            userId,
            bet,
            'highlow_start',
            'Started HighLow game'
        );

        const gameId = `${userId}_${Date.now()}`;

        const game = {
            gameId,
            guildId,
            userId,
            bet,
            currentCard: randomCard(),
            multiplier: 1,
            streak: 0,
            finished: false
        };

        activeGames.set(gameId, game);

        const embed = buildEmbed({
            user,
            currentCard: game.currentCard,
            multiplier: game.multiplier,
            potential: bet,
            wallet: wallet - bet,
            bet,
            streak: game.streak
        });

        return publicResult(ctx, {
            embeds: [embed],
            components: buildButtons(gameId, false, game.currentCard)
        });

    } catch (error) {
        console.error('HighLow start error:', error);

        return respond(ctx, {
            content: '❌ Failed to start HighLow game.'
        }, true);
    }

}

async function handleHighLowButton(interaction) {
    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    const parts = interaction.customId.split('_');
    const action = parts[1];
    const gameId = parts.slice(2).join('_');

    const game = activeGames.get(gameId);

    if (!game || game.finished) {
        return safeReply(interaction, {
            content: '❌ This HighLow game has expired or already ended.',
            components: []
        }, true);
    }

    if (interaction.user.id !== game.userId) {
        return safeReply(interaction, {
            content: '❌ This is not your HighLow game.'
        }, true);
    }

    const user = interaction.user;
    const data = await getUser(game.guildId, game.userId);
    const wallet = Number(data.wallet || 0);

    if (action === 'cashout') {
        game.finished = true;
        activeGames.delete(gameId);

        const winnings = Math.floor(game.bet * game.multiplier);
        const profit = winnings - game.bet;

        await addWallet(
            game.guildId,
            game.userId,
            winnings,
            'highlow_cashout',
            `Cashed out HighLow at x${game.multiplier.toFixed(2)}`
        );

        const embed = buildEmbed({
            user,
            currentCard: game.currentCard,
            multiplier: game.multiplier,
            potential: winnings,
            wallet: wallet + winnings,
            bet: game.bet,
            streak: game.streak,
            profit,
            finished: true,
            won: true
        });

        return safeReply(interaction, {
            embeds: [embed],
            components: buildButtons(gameId, true, game.currentCard)
        });
    }

    const nextCard = randomCard();

    let correct = false;

    if (action === 'higher') {
        correct = nextCard > game.currentCard;
    }

    if (action === 'lower') {
        correct = nextCard < game.currentCard;
    }

    if (nextCard === game.currentCard) {
        correct = false;
    }

    if (!correct) {
        game.finished = true;
        activeGames.delete(gameId);

        const embed = buildEmbed({
            user,
            currentCard: game.currentCard,
            multiplier: game.multiplier,
            potential: 0,
            wallet,
            bet: game.bet,
            streak: game.streak,
            finished: true,
            lost: true,
            nextCard
        });

        return safeReply(interaction, {
            embeds: [embed],
            components: buildButtons(gameId, true, game.currentCard)
        });
    }

    game.currentCard = nextCard;
    game.streak += 1;
    game.multiplier += 0.5;

    const potential = Math.floor(game.bet * game.multiplier);

    const embed = buildEmbed({
        user,
        currentCard: game.currentCard,
        multiplier: game.multiplier,
        potential,
        wallet,
        bet: game.bet,
        streak: game.streak,
        nextCard
    });

    return safeReply(interaction, {
        embeds: [embed],
        components: buildButtons(gameId, false, game.currentCard)
    });
}