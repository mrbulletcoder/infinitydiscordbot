const { AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { pool } = require('../database');

const xpCooldownCache = new Map();

function xpForLevel(level) {
    return 5 * (level ** 2) + (50 * level) + 100;
}

function calculateLevelFromXp(totalXp) {
    let level = 0;
    let remainingXp = totalXp;

    while (remainingXp >= xpForLevel(level)) {
        remainingXp -= xpForLevel(level);
        level++;
    }

    return {
        level,
        currentLevelXp: remainingXp,
        neededXp: xpForLevel(level)
    };
}

function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildProgressBar(current, needed, size = 12) {
    const safeNeeded = Math.max(needed, 1);
    const ratio = Math.max(0, Math.min(1, current / safeNeeded));
    const filled = Math.round(ratio * size);
    const empty = size - filled;

    return `${'▰'.repeat(filled)}${'▱'.repeat(empty)}`;
}

function formatNumber(value) {
    return Number(value).toLocaleString('en-US');
}

function truncateText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;

    let trimmed = text;
    while (trimmed.length > 0 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
        trimmed = trimmed.slice(0, -1);
    }

    return `${trimmed}...`;
}

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
}

async function drawAvatarCircle(ctx, avatarUrl, x, y, size) {
    const avatar = await loadImage(avatarUrl);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, x, y, size, size);
    ctx.restore();
}

function drawCenteredText(ctx, text, centerX, y) {
    const width = ctx.measureText(text).width;
    ctx.fillText(text, centerX - (width / 2), y);
}

async function buildRankCardAttachment({ user, member, guildName, rankData }) {
    const width = 1600;
    const height = 560;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const computedLevel = calculateLevelFromXp(Number(rankData.xp)).level;
    const displayName = member?.displayName || user.username;

    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#06111a');
    bgGradient.addColorStop(0.38, '#0a2133');
    bgGradient.addColorStop(0.72, '#10213c');
    bgGradient.addColorStop(1, '#1a1f46');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    const glowLeft = ctx.createRadialGradient(200, 120, 10, 200, 120, 380);
    glowLeft.addColorStop(0, 'rgba(0,191,255,0.22)');
    glowLeft.addColorStop(1, 'rgba(0,191,255,0)');
    ctx.fillStyle = glowLeft;
    ctx.fillRect(0, 0, width, height);

    const glowRight = ctx.createRadialGradient(1320, 420, 10, 1320, 420, 420);
    glowRight.addColorStop(0, 'rgba(125,90,255,0.24)');
    glowRight.addColorStop(1, 'rgba(125,90,255,0)');
    ctx.fillStyle = glowRight;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(ctx, 28, 28, width - 56, height - 56, 36);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    roundRect(ctx, 28, 28, width - 56, height - 56, 36);
    ctx.stroke();

    const leftPanelX = 62;
    const leftPanelY = 62;
    const leftPanelW = 330;
    const leftPanelH = 436;

    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    roundRect(ctx, leftPanelX, leftPanelY, leftPanelW, leftPanelH, 34);
    ctx.fill();

    const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 512 });
    await drawAvatarCircle(ctx, avatarUrl, 100, 100, 254);

    const ringGradient = ctx.createLinearGradient(90, 95, 360, 360);
    ringGradient.addColorStop(0, '#00bfff');
    ringGradient.addColorStop(0.55, '#5ad7ff');
    ringGradient.addColorStop(1, '#8a6dff');
    ctx.strokeStyle = ringGradient;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(227, 227, 137, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(227, 227, 152, 0, Math.PI * 2);
    ctx.stroke();

    const nameX = 450;
    const contentWidth = 1040;

    ctx.fillStyle = '#a8e4ff';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('INFINITY RANK CARD', nameX, 96);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 82px Arial';
    ctx.fillText(truncateText(ctx, displayName, 700), nameX, 184);

    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '30px Arial';
    ctx.fillText(`@${user.username}`, nameX, 236);

    const guildPillX = nameX;
    const guildPillY = 258;
    const guildPillW = 370;
    const guildPillH = 50;

    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(ctx, guildPillX, guildPillY, guildPillW, guildPillH, 18);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, guildPillX, guildPillY, guildPillW, guildPillH, 18);
    ctx.stroke();

    ctx.fillStyle = '#dff6ff';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(truncateText(ctx, guildName, 328), guildPillX + 22, guildPillY + 33);

    let badgeText = null;
    if (rankData.rank_position === 1) badgeText = 'TOP 1';
    else if (rankData.rank_position === 2) badgeText = 'TOP 2';
    else if (rankData.rank_position === 3) badgeText = 'TOP 3';

    if (badgeText) {
        const badgeX = guildPillX;
        const badgeY = 326;
        const badgeW = 148;
        const badgeH = 42;

        const badgeGradient = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY);
        badgeGradient.addColorStop(0, 'rgba(0,191,255,0.24)');
        badgeGradient.addColorStop(1, 'rgba(125,90,255,0.24)');
        ctx.fillStyle = badgeGradient;
        roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 16);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 16);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Arial';
        drawCenteredText(ctx, badgeText, badgeX + (badgeW / 2), badgeY + 28);
    }

    const statY = 398;
    const statW = 256;
    const statH = 100;
    const statGap = 24;
    const statStartX = 450;

    const stats = [
        { label: 'RANK', value: `#${rankData.rank_position || '—'}` },
        { label: 'LEVEL', value: `${computedLevel}` },
        { label: 'TOTAL XP', value: formatNumber(rankData.xp) }
    ];

    stats.forEach((stat, index) => {
        const x = statStartX + index * (statW + statGap);

        const statGradient = ctx.createLinearGradient(x, statY, x + statW, statY + statH);
        statGradient.addColorStop(0, 'rgba(255,255,255,0.07)');
        statGradient.addColorStop(1, 'rgba(255,255,255,0.04)');
        ctx.fillStyle = statGradient;
        roundRect(ctx, x, statY, statW, statH, 24);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, statY, statW, statH, 24);
        ctx.stroke();

        ctx.fillStyle = '#9fdcff';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(stat.label, x + 24, statY + 30);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px Arial';
        ctx.fillText(stat.value, x + 24, statY + 72);
    });

    const progressX = 1110;
    const progressY = 132;
    const progressW = 392;
    const progressH = 46;

    ctx.fillStyle = '#dff6ff';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('PROGRESS TO NEXT LEVEL', progressX, 102);

    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    roundRect(ctx, progressX, progressY, progressW, progressH, 23);
    ctx.fill();

    const ratio = Math.max(0, Math.min(1, rankData.current_level_xp / Math.max(rankData.needed_xp, 1)));
    const fillW = Math.max(30, progressW * ratio);

    const progressGradient = ctx.createLinearGradient(progressX, progressY, progressX + progressW, progressY);
    progressGradient.addColorStop(0, '#00bfff');
    progressGradient.addColorStop(0.55, '#49d0ff');
    progressGradient.addColorStop(1, '#7d5aff');

    ctx.fillStyle = progressGradient;
    roundRect(ctx, progressX, progressY, fillW, progressH, 23);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.fillText(
        `${formatNumber(rankData.current_level_xp)} / ${formatNumber(rankData.needed_xp)} XP`,
        progressX,
        236
    );

    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '28px Arial';
    ctx.fillText(`Messages Sent: ${formatNumber(rankData.messages)}`, progressX, 288);

    ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.font = '26px Arial';
    ctx.fillText(`Level ${computedLevel} • Rank #${rankData.rank_position || '—'}`, progressX, 336);

    ctx.fillStyle = '#8fdcff';
    ctx.font = '22px Arial';

    const buffer = await canvas.encode('png');
    return new AttachmentBuilder(buffer, { name: 'rank-card.png' });
}

async function buildLeaderboardAttachment({ guild, leaderboardRows }) {
    const width = 1600;
    const rowHeight = 118;
    const headerHeight = 220;
    const footerHeight = 56;
    const height = headerHeight + (leaderboardRows.length * rowHeight) + footerHeight;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#06111a');
    bgGradient.addColorStop(0.38, '#0a2133');
    bgGradient.addColorStop(0.72, '#10213c');
    bgGradient.addColorStop(1, '#1a1f46');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    const glowTop = ctx.createRadialGradient(280, 90, 10, 280, 90, 340);
    glowTop.addColorStop(0, 'rgba(0,191,255,0.20)');
    glowTop.addColorStop(1, 'rgba(0,191,255,0)');
    ctx.fillStyle = glowTop;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#ecfbff';
    ctx.font = 'bold 56px Arial';
    ctx.fillText('INFINITY RANK LEADERBOARD', 178, 88);

    const guildIconUrl = guild.iconURL({ extension: 'png', size: 256 });
    if (guildIconUrl) {
        const icon = await loadImage(guildIconUrl);
        ctx.drawImage(icon, 62, 28, 88, 88);
    }

    const guildPillX = 178;
    const guildPillY = 106;
    const guildPillW = 410;
    const guildPillH = 50;

    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(ctx, guildPillX, guildPillY, guildPillW, guildPillH, 16);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, guildPillX, guildPillY, guildPillW, guildPillH, 16);
    ctx.stroke();

    ctx.fillStyle = '#dff6ff';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(truncateText(ctx, guild.name, 368), guildPillX + 22, guildPillY + 33);

    const boardX = 42;
    const boardY = 172;
    const boardW = width - 84;
    const boardH = height - boardY - 36;

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(ctx, boardX, boardY, boardW, boardH, 32);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 2;
    roundRect(ctx, boardX, boardY, boardW, boardH, 32);
    ctx.stroke();

    const rankColCenter = 110;
    const memberColX = 238;
    const levelColCenter = 1190;
    const xpColCenter = 1330;
    const messagesColCenter = 1470;

    ctx.fillStyle = '#9fdcff';
    ctx.font = 'bold 22px Arial';
    drawCenteredText(ctx, 'RANK', rankColCenter, 216);
    ctx.fillText('MEMBER', memberColX, 216);
    drawCenteredText(ctx, 'LEVEL', levelColCenter, 216);
    drawCenteredText(ctx, 'XP', xpColCenter, 216);
    drawCenteredText(ctx, 'MESSAGES', messagesColCenter, 216);

    for (let i = 0; i < leaderboardRows.length; i++) {
        const row = leaderboardRows[i];
        const y = 244 + (i * rowHeight);

        let rowFill = i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.03)';
        let rowStroke = 'rgba(255,255,255,0.06)';

        if (i === 0) {
            rowFill = 'rgba(255,215,0,0.10)';
            rowStroke = 'rgba(255,215,0,0.18)';
        } else if (i === 1) {
            rowFill = 'rgba(210,220,255,0.08)';
            rowStroke = 'rgba(210,220,255,0.15)';
        } else if (i === 2) {
            rowFill = 'rgba(205,127,50,0.10)';
            rowStroke = 'rgba(205,127,50,0.16)';
        }

        ctx.fillStyle = rowFill;
        roundRect(ctx, 62, y, width - 124, 92, 24);
        ctx.fill();

        ctx.strokeStyle = rowStroke;
        ctx.lineWidth = 1.5;
        roundRect(ctx, 62, y, width - 124, 92, 24);
        ctx.stroke();

        const placeLabel = `#${i + 1}`;

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 30px Arial';
        drawCenteredText(ctx, placeLabel, rankColCenter, y + 58);

        if (row.avatarUrl) {
            try {
                await drawAvatarCircle(ctx, row.avatarUrl, 180, y + 16, 60);
            } catch {}
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 34px Arial';
        ctx.fillText(truncateText(ctx, row.displayName, 620), 270, y + 38);

        ctx.fillStyle = 'rgba(255,255,255,0.62)';
        ctx.font = '22px Arial';
        ctx.fillText(truncateText(ctx, `@${row.username}`, 620), 270, y + 72);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 30px Arial';
        drawCenteredText(ctx, String(row.level), levelColCenter, y + 58);
        drawCenteredText(ctx, formatNumber(row.xp), xpColCenter, y + 58);
        drawCenteredText(ctx, formatNumber(row.messages), messagesColCenter, y + 58);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.54)';
    ctx.font = '20px Arial';
    

    const buffer = await canvas.encode('png');
    return new AttachmentBuilder(buffer, { name: 'leaderboard.png' });
}

async function getRankSettings(guildId) {
    const [rows] = await pool.query(
        `SELECT * FROM rank_settings WHERE guild_id = ? LIMIT 1`,
        [guildId]
    );

    if (rows[0]) return rows[0];

    await pool.query(
        `INSERT INTO rank_settings (guild_id) VALUES (?)`,
        [guildId]
    );

    return {
        guild_id: guildId,
        mode: 'all_whitelisted',
        xp_min: 15,
        xp_max: 25,
        xp_cooldown_seconds: 60
    };
}

async function getRankUser(guildId, userId) {
    const [rows] = await pool.query(
        `SELECT * FROM rank_users WHERE guild_id = ? AND user_id = ? LIMIT 1`,
        [guildId, userId]
    );

    if (rows[0]) return rows[0];

    await pool.query(
        `INSERT INTO rank_users (guild_id, user_id) VALUES (?, ?)`,
        [guildId, userId]
    );

    return {
        guild_id: guildId,
        user_id: userId,
        xp: 0,
        level: 0,
        messages: 0,
        last_xp_at: 0
    };
}

async function getWhitelistChannels(guildId) {
    const [rows] = await pool.query(
        `SELECT channel_id FROM rank_whitelist_channels WHERE guild_id = ?`,
        [guildId]
    );

    return rows.map(row => row.channel_id);
}

async function getBlacklistChannels(guildId) {
    const [rows] = await pool.query(
        `SELECT channel_id FROM rank_blacklist_channels WHERE guild_id = ?`,
        [guildId]
    );

    return rows.map(row => row.channel_id);
}

async function canEarnXp(guildId, channelId) {
    const settings = await getRankSettings(guildId);
    const blacklist = await getBlacklistChannels(guildId);

    if (blacklist.includes(channelId)) {
        return false;
    }

    if (settings.mode === 'all_whitelisted') {
        return true;
    }

    const whitelist = await getWhitelistChannels(guildId);
    return whitelist.includes(channelId);
}

function canGainXpNow(guildId, userId, cooldownSeconds) {
    const key = `${guildId}:${userId}`;
    const now = Date.now();
    const last = xpCooldownCache.get(key) || 0;

    if (now - last < cooldownSeconds * 1000) {
        return false;
    }

    xpCooldownCache.set(key, now);
    return true;
}

async function giveMessageXp(message) {
    if (!message.guild || !message.author || message.author.bot) return null;
    if (!message.content?.trim()) return null;

    const guildId = message.guild.id;
    const userId = message.author.id;
    const channelId = message.channel.id;

    const isAllowed = await canEarnXp(guildId, channelId);
    if (!isAllowed) return null;

    const settings = await getRankSettings(guildId);

    if (!canGainXpNow(guildId, userId, settings.xp_cooldown_seconds)) {
        await incrementMessageCount(guildId, userId, false);
        return null;
    }

    const gainedXp = randomBetween(settings.xp_min, settings.xp_max);
    const user = await getRankUser(guildId, userId);

    const newXp = Number(user.xp) + gainedXp;
    const levelData = calculateLevelFromXp(newXp);
    const oldLevel = Number(user.level);
    const newLevel = levelData.level;

    await pool.query(
        `
        UPDATE rank_users
        SET xp = ?, level = ?, messages = messages + 1, last_xp_at = ?
        WHERE guild_id = ? AND user_id = ?
        `,
        [newXp, newLevel, Date.now(), guildId, userId]
    );

    return {
        gainedXp,
        oldLevel,
        newLevel,
        leveledUp: newLevel > oldLevel
    };
}

async function incrementMessageCount(guildId, userId, createIfMissing = true) {
    if (createIfMissing) {
        await getRankUser(guildId, userId);
    }

    await pool.query(
        `
        UPDATE rank_users
        SET messages = messages + 1
        WHERE guild_id = ? AND user_id = ?
        `,
        [guildId, userId]
    );
}

async function addWhitelistChannel(guildId, channelId) {
    await pool.query(
        `INSERT IGNORE INTO rank_whitelist_channels (guild_id, channel_id) VALUES (?, ?)`,
        [guildId, channelId]
    );
}

async function removeWhitelistChannel(guildId, channelId) {
    await pool.query(
        `DELETE FROM rank_whitelist_channels WHERE guild_id = ? AND channel_id = ?`,
        [guildId, channelId]
    );
}

async function addBlacklistChannel(guildId, channelId) {
    await pool.query(
        `INSERT IGNORE INTO rank_blacklist_channels (guild_id, channel_id) VALUES (?, ?)`,
        [guildId, channelId]
    );
}

async function removeBlacklistChannel(guildId, channelId) {
    await pool.query(
        `DELETE FROM rank_blacklist_channels WHERE guild_id = ? AND channel_id = ?`,
        [guildId, channelId]
    );
}

async function setRankMode(guildId, mode) {
    await getRankSettings(guildId);

    await pool.query(
        `UPDATE rank_settings SET mode = ? WHERE guild_id = ?`,
        [mode, guildId]
    );
}

async function setRankXpConfig(guildId, xpMin, xpMax, cooldownSeconds) {
    await getRankSettings(guildId);

    await pool.query(
        `
        UPDATE rank_settings
        SET xp_min = ?, xp_max = ?, xp_cooldown_seconds = ?
        WHERE guild_id = ?
        `,
        [xpMin, xpMax, cooldownSeconds, guildId]
    );
}

async function getUserRankPosition(guildId, userId) {
    const [rows] = await pool.query(
        `
        SELECT position FROM (
            SELECT
                user_id,
                ROW_NUMBER() OVER (ORDER BY xp DESC, messages DESC, user_id ASC) AS position
            FROM rank_users
            WHERE guild_id = ?
        ) ranked
        WHERE user_id = ?
        LIMIT 1
        `,
        [guildId, userId]
    );

    return rows[0]?.position || 0;
}

async function getLeaderboard(guildId, limit = 10, offset = 0) {
    const [rows] = await pool.query(
        `
        SELECT
            user_id,
            xp,
            level,
            messages
        FROM rank_users
        WHERE guild_id = ?
        ORDER BY xp DESC, messages DESC, user_id ASC
        LIMIT ? OFFSET ?
        `,
        [guildId, limit, offset]
    );

    return rows;
}

async function getRankCardData(guildId, userId) {
    const user = await getRankUser(guildId, userId);
    const position = await getUserRankPosition(guildId, userId);
    const levelData = calculateLevelFromXp(Number(user.xp));

    return {
        ...user,
        rank_position: position,
        current_level_xp: levelData.currentLevelXp,
        needed_xp: levelData.neededXp,
        progress_bar: buildProgressBar(levelData.currentLevelXp, levelData.neededXp, 14)
    };
}

module.exports = {
    xpForLevel,
    calculateLevelFromXp,
    buildProgressBar,
    getRankSettings,
    getRankUser,
    getWhitelistChannels,
    getBlacklistChannels,
    canEarnXp,
    giveMessageXp,
    addWhitelistChannel,
    removeWhitelistChannel,
    addBlacklistChannel,
    removeBlacklistChannel,
    setRankMode,
    setRankXpConfig,
    getUserRankPosition,
    getLeaderboard,
    getRankCardData,
    buildRankCardAttachment,
    buildLeaderboardAttachment
};