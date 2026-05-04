const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { pool } = require('../../database');
const { formatMoney } = require('../../utils/economy');
const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

function respond(ctx, options) {
    if (ctx.user) {
        return safeReply(ctx, options, true);
    }

    return ctx.reply(options);
}

module.exports = {
    name: 'economy-leaderboard',
    description: 'View the richest users in the server.',
    usage: '!economy-leaderboard / /economy-leaderboard',
    category: 'economy',
    aliases: ['richest', 'moneylb', 'ecolb'],
    botPermissions: [
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 15,

    slashData: new SlashCommandBuilder()
        .setName('economy-leaderboard')
        .setDescription('View the richest users in the server'),

    async executePrefix(message) {
        return leaderboard(message);
    },

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;
        
        return leaderboard(interaction);
    }
};

async function leaderboard(ctx) {
    const guildId = ctx.guild.id;

    const [rows] = await pool.query(
        `SELECT user_id, wallet, bank, (wallet + bank) AS total
         FROM economy_users
         WHERE guild_id = ?
         ORDER BY total DESC
         LIMIT 10`,
        [guildId]
    );

    if (!rows.length) {
        return respond(ctx, {
            content: '❌ No economy data yet. Use `/daily` or `/work` to get started.'
        });
    }

    const lines = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const medal = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
        lines.push(`${medal} <@${row.user_id}> — **${formatMoney(row.total)}**`);
    }

    const embed = new EmbedBuilder()
        .setColor('#ffd700')
        .setTitle('🏆 Richest Members')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Infinity Economy Leaderboard ⚡' })
        .setTimestamp();

    return respond(ctx, { embeds: [embed] });
}