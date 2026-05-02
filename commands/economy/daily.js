const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, addWallet, formatMoney, formatTime } = require('../../utils/economy');
const { pool } = require('../../database');
const { safeReply } = require('../../handlers/interactions/safeReply');

const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
const BASE_REWARD = 1000;

function respond(ctx, options) {
    if (ctx.user) {
        return safeReply(ctx, options, true);
    }

    return ctx.reply(options);
}

module.exports = {
    name: 'daily',
    description: 'Claim your daily economy reward.',
    usage: '!daily / /daily',
    category: 'economy',
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily economy reward'),

    async executePrefix(message) {
        return claimDaily(message);
    },

    async executeSlash(interaction) {
        return claimDaily(interaction);
    }
};

async function claimDaily(ctx) {
    const guildId = ctx.guild.id;
    const userId = ctx.user ? ctx.user.id : ctx.author.id;
    const user = ctx.user || ctx.author;

    const data = await getUser(guildId, userId);
    const now = Date.now();
    const lastDaily = Number(data.last_daily || 0);
    const remaining = DAILY_COOLDOWN - (now - lastDaily);

    if (remaining > 0) {
        return respond(ctx, {
            content: `⏳ You already claimed your daily reward. Come back in **${formatTime(remaining)}**.`
        });
    }

    const streak = now - lastDaily <= DAILY_COOLDOWN * 2
        ? Number(data.daily_streak || 0) + 1
        : 1;

    const streakBonus = Math.min(streak * 150, 3000);
    const reward = BASE_REWARD + streakBonus;

    await addWallet(guildId, userId, reward, 'daily', `Daily reward streak ${streak}`);

    await pool.query(
        `UPDATE economy_users
         SET last_daily = ?, daily_streak = ?
         WHERE guild_id = ? AND user_id = ?`,
        [now, streak, guildId, userId]
    );

    const embed = new EmbedBuilder()
        .setColor('#00ff99')
        .setTitle('🎁 Daily Reward Claimed')
        .setDescription(`${user}, you claimed your daily reward!`)
        .addFields(
            { name: '💰 Reward', value: formatMoney(reward), inline: true },
            { name: '🔥 Streak', value: `${streak} day${streak === 1 ? '' : 's'}`, inline: true },
            { name: '✨ Bonus', value: formatMoney(streakBonus), inline: true }
        )
        .setFooter({ text: 'Come back tomorrow for a bigger streak bonus ⚡' })
        .setTimestamp();

    return respond(ctx, { embeds: [embed] });
}