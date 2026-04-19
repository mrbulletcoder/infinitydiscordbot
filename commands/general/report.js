const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');

const { pool } = require('../../database');

async function getGuildSettings(guildId) {
    const [rows] = await pool.query(
        `SELECT mod_logs, report_cooldown_seconds
         FROM guild_settings
         WHERE guild_id = ?
         LIMIT 1`,
        [guildId]
    );

    return rows[0] || null;
}

async function getModLogsChannel(guild) {
    const settings = await getGuildSettings(guild.id);
    const channelId = settings?.mod_logs;

    if (!channelId) return null;

    return guild.channels.cache.get(channelId) ||
        await guild.channels.fetch(channelId).catch(() => null);
}

function formatDuration(ms) {
    const totalSeconds = Math.ceil(ms / 1000);

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];

    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (!days && !hours && !minutes) parts.push(`${seconds}s`);

    return parts.join(' ');
}

async function getReportCooldown(guildId) {
    const settings = await getGuildSettings(guildId);
    return settings?.report_cooldown_seconds ?? 120;
}

async function getLatestUserReport(guildId, reporterId) {
    const [rows] = await pool.query(
        `SELECT id, created_at
         FROM reports
         WHERE guild_id = ? AND reporter_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [guildId, reporterId]
    );

    return rows[0] || null;
}

async function checkReportCooldown(guildId, reporterId) {
    const cooldownSeconds = await getReportCooldown(guildId);

    if (cooldownSeconds <= 0) return null;

    const latest = await getLatestUserReport(guildId, reporterId);
    if (!latest) return null;

    const expiresAt = Number(latest.created_at) + (cooldownSeconds * 1000);
    const remainingMs = expiresAt - Date.now();

    if (remainingMs > 0) {
        return {
            remainingMs,
            remainingText: formatDuration(remainingMs),
            expiresAt
        };
    }

    return null;
}

async function getNextReportCaseNumber(guildId) {
    const [rows] = await pool.query(
        `SELECT report_case_number
         FROM guild_settings
         WHERE guild_id = ?
         LIMIT 1`,
        [guildId]
    );

    let current = Number(rows[0]?.report_case_number || 0);
    const next = current + 1;

    await pool.query(
        `INSERT INTO guild_settings (guild_id, report_case_number)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE report_case_number = VALUES(report_case_number)`,
        [guildId, next]
    );

    return next;
}

function buildReportButtons(reportId) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`report_claim_${reportId}`)
                .setLabel('Claim')
                .setEmoji('🛄')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`report_resolve_${reportId}`)
                .setLabel('Resolve')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`report_dismiss_${reportId}`)
                .setLabel('Dismiss')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Danger)
        )
    ];
}

function buildReportEmbed({
    guild,
    caseNumber,
    reportId,
    reporter,
    target,
    reason,
    status = 'Open',
    claimedBy = null,
    handledBy = null,
    decision = null
}) {
    return new EmbedBuilder()
        .setAuthor({
            name: '🚨 Infinity Member Report',
            iconURL: guild.iconURL({ dynamic: true }) || undefined
        })
        .setColor(
            status === 'Resolved'
                ? '#00ff88'
                : status === 'Dismissed'
                    ? '#ff4d4d'
                    : claimedBy
                        ? '#ffaa00'
                        : '#ff4d4d'
        )
        .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 1024 }))
        .addFields(
            {
                name: '📌 Report Information',
                value:
                    '━━━━━━━━━━━━━━━━━━\n' +
                    `**Case:** \`#${caseNumber}\`\n` +
                    `**Report ID:** \`${reportId}\`\n` +
                    `**Status:** \`${status}\``,
                inline: true
            },
            {
                name: '👤 Reported User',
                value:
                    '━━━━━━━━━━━━━━━━━━\n' +
                    `${target.tag}\n` +
                    `\`${target.id}\``,
                inline: true
            },
            {
                name: '🧾 Reported By',
                value:
                    '━━━━━━━━━━━━━━━━━━\n' +
                    `${reporter.tag}\n` +
                    `\`${reporter.id}\``,
                inline: true
            },
            {
                name: '📄 Reason',
                value:
                    '━━━━━━━━━━━━━━━━━━\n' +
                    `${reason}`,
                inline: false
            },
            {
                name: '📅 Submitted',
                value:
                    '━━━━━━━━━━━━━━━━━━\n' +
                    `<t:${Math.floor(Date.now() / 1000)}:F>\n<t:${Math.floor(Date.now() / 1000)}:R>`,
                inline: true
            },
            {
                name: '🛄 Claimed By',
                value:
                    '━━━━━━━━━━━━━━━━━━\n' +
                    (claimedBy
                        ? `${claimedBy.tag}\n\`${claimedBy.id}\``
                        : '`Not claimed`'),
                inline: true
            },
            {
                name: '🛠️ Handled By',
                value:
                    '━━━━━━━━━━━━━━━━━━\n' +
                    (handledBy
                        ? `${handledBy.tag}\n\`${handledBy.id}\``
                        : '`Not handled yet`'),
                inline: true
            }
        )
        .setFooter({ text: 'Infinity Reports System' })
        .setTimestamp()
        .setDescription(
            decision
                ? `**Final Decision:** ${decision}`
                : 'A member report has been submitted and is awaiting staff review.'
        );
}

function buildReporterSuccessEmbed(target, reason, caseNumber) {
    return new EmbedBuilder()
        .setColor('#00bfff')
        .setTitle('✅ Report Submitted')
        .setDescription(
            `Your report against **${target.tag}** has been submitted to the staff team.`
        )
        .addFields(
            {
                name: '📌 Report Case',
                value: `\`#${caseNumber}\``,
                inline: true
            },
            {
                name: '📄 Reason',
                value: reason,
                inline: false
            }
        )
        .setFooter({ text: 'Infinity Reports System' })
        .setTimestamp();
}

module.exports = {
    name: 'report',
    description: 'Report a member to server staff.',
    usage: '!report @user <reason> / /report <user> <reason>',
    category: 'general',

    slashData: new SlashCommandBuilder()
        .setName('report')
        .setDescription('Report a member to server staff')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The member you want to report')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the report')
                .setRequired(true)
                .setMaxLength(1000)
        ),

    async executePrefix(message, args) {
        const targetUser = message.mentions.users.first();

        if (!targetUser) {
            return message.reply('❌ Please mention a user to report.');
        }

        const reason = args.slice(1).join(' ').trim();

        if (!reason) {
            return message.reply('❌ Please provide a reason for the report.');
        }

        return this.handleReport({
            ctx: message,
            guild: message.guild,
            reporter: message.author,
            target: targetUser,
            reason
        });
    },

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason', true).trim();

        return this.handleReport({
            ctx: interaction,
            guild: interaction.guild,
            reporter: interaction.user,
            target: targetUser,
            reason,
            isSlash: true
        });
    },

    async handleReport({ ctx, guild, reporter, target, reason, isSlash = false }) {
        if (!guild) {
            const content = '❌ This command can only be used in a server.';
            return isSlash
                ? ctx.editReply({ content })
                : ctx.reply(content);
        }

        if (target.id === reporter.id) {
            return isSlash
                ? ctx.editReply({ content: '❌ You cannot report yourself.' })
                : ctx.reply('❌ You cannot report yourself.');
        }

        if (target.bot) {
            return isSlash
                ? ctx.editReply({ content: '❌ You cannot report a bot.' })
                : ctx.reply('❌ You cannot report a bot.');
        }

        const member = await guild.members.fetch(target.id).catch(() => null);

        if (!member) {
            return isSlash
                ? ctx.editReply({ content: '❌ That user is not in this server.' })
                : ctx.reply('❌ That user is not in this server.');
        }

        const cooldown = await checkReportCooldown(guild.id, reporter.id);

        if (cooldown) {
            const text =
                `❌ You are on report cooldown.\n` +
                `You can report again in **${cooldown.remainingText}**.\n` +
                `Cooldown ends: <t:${Math.floor(cooldown.expiresAt / 1000)}:R>`;

            return isSlash
                ? ctx.editReply({ content: text })
                : ctx.reply(text);
        }

        const caseNumber = await getNextReportCaseNumber(guild.id);

        const [insertResult] = await pool.query(
            `INSERT INTO reports
            (guild_id, case_number, reporter_id, reported_user_id, reason, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?)`,
            [
                guild.id,
                caseNumber,
                reporter.id,
                target.id,
                reason,
                Date.now()
            ]
        );

        const reportId = insertResult.insertId;
        const modLogsChannel = await getModLogsChannel(guild);

        let sentMessage = null;

        if (modLogsChannel) {
            const embed = buildReportEmbed({
                guild,
                caseNumber,
                reportId,
                reporter,
                target,
                reason
            });

            sentMessage = await modLogsChannel.send({
                embeds: [embed],
                components: buildReportButtons(reportId)
            }).catch(() => null);
        }

        if (sentMessage) {
            await pool.query(
                `UPDATE reports
             SET message_id = ?, channel_id = ?
             WHERE id = ?`,
                [sentMessage.id, sentMessage.channel.id, reportId]
            );
        }

        const successEmbed = buildReporterSuccessEmbed(target, reason, caseNumber);

        return isSlash
            ? ctx.editReply({ embeds: [successEmbed] })
            : ctx.reply({ embeds: [successEmbed] });
    }
};