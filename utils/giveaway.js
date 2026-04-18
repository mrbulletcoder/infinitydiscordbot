const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');

const { pool } = require('../database');

const activeGiveawayIntervals = new Map();

function parseDuration(input) {
    const value = String(input).toLowerCase().trim();
    const regex = /(\d+)\s*(s|m|h|d|w)/g;

    let totalMs = 0;
    let match;

    while ((match = regex.exec(value)) !== null) {
        const amount = Number(match[1]);
        const unit = match[2];

        if (unit === 's') totalMs += amount * 1000;
        if (unit === 'm') totalMs += amount * 60 * 1000;
        if (unit === 'h') totalMs += amount * 60 * 60 * 1000;
        if (unit === 'd') totalMs += amount * 24 * 60 * 60 * 1000;
        if (unit === 'w') totalMs += amount * 7 * 24 * 60 * 60 * 1000;
    }

    return totalMs;
}

function formatDuration(ms) {
    if (ms <= 0) return '0s';

    const parts = [];
    const units = [
        ['w', 7 * 24 * 60 * 60 * 1000],
        ['d', 24 * 60 * 60 * 1000],
        ['h', 60 * 60 * 1000],
        ['m', 60 * 1000],
        ['s', 1000]
    ];

    let remaining = ms;

    for (const [label, unitMs] of units) {
        const amount = Math.floor(remaining / unitMs);
        if (amount > 0) {
            parts.push(`${amount}${label}`);
            remaining -= amount * unitMs;
        }
    }

    return parts.slice(0, 3).join(' ');
}

function safeParseEntries(entriesJson) {
    try {
        const parsed = JSON.parse(entriesJson || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function buildGiveawayButtons(ended = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('giveaway_enter')
                .setLabel(ended ? 'Giveaway Ended' : 'Enter Giveaway')
                .setEmoji('🎉')
                .setStyle(ButtonStyle.Success)
                .setDisabled(ended),
            new ButtonBuilder()
                .setCustomId('giveaway_entries')
                .setLabel('View Entries')
                .setEmoji('👥')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('giveaway_reroll')
                .setLabel('Reroll')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('giveaway_end')
                .setLabel('End Now')
                .setEmoji('⏹️')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(ended)
        )
    ];
}

function buildRequirementsText(giveaway) {
    const lines = [];

    if (giveaway.required_role_id) {
        lines.push(`• Must have <@&${giveaway.required_role_id}>`);
    }

    if (giveaway.blacklist_role_id) {
        lines.push(`• Must **not** have <@&${giveaway.blacklist_role_id}>`);
    }

    if (Number(giveaway.min_account_age_days) > 0) {
        lines.push(`• Account must be at least **${giveaway.min_account_age_days} day(s)** old`);
    }

    if (Number(giveaway.min_join_age_days) > 0) {
        lines.push(`• Must have joined the server at least **${giveaway.min_join_age_days} day(s)** ago`);
    }

    return lines.length ? lines.join('\n') : 'No special requirements';
}

function buildGiveawayEmbed(giveaway, guildName, winnerMentions = null) {
    const entries = safeParseEntries(giveaway.entries_json);
    const ended = Boolean(giveaway.ended);

    const embed = new EmbedBuilder()
        .setTitle(`🎉 ${ended ? 'Giveaway Ended' : 'Infinity Giveaway'}`)
        .setDescription([
            `# ${giveaway.prize}`,
            giveaway.description ? `> ${giveaway.description}` : null
        ].filter(Boolean).join('\n'))
        .setColor(ended ? '#ff4d4d' : '#00bfff')
        .addFields(
            {
                name: '📌 Status',
                value: ended ? '🔴 Ended' : '🟢 Live',
                inline: true
            },
            {
                name: '🏆 Winners',
                value: `${giveaway.winner_count}`,
                inline: true
            },
            {
                name: '👥 Entries',
                value: `${entries.length}`,
                inline: true
            },
            {
                name: '🧑 Host',
                value: `<@${giveaway.host_id}>`,
                inline: true
            },
            {
                name: ended ? '⏰ Ended At' : '⏰ Ends At',
                value: `<t:${Math.floor(giveaway.end_at / 1000)}:F>`,
                inline: true
            },
            {
                name: ended ? '⌛ Duration' : '⌛ Time Remaining',
                value: ended
                    ? 'Completed'
                    : formatDuration(Math.max(0, giveaway.end_at - Date.now())),
                inline: true
            },
            {
                name: '✅ Requirements',
                value: buildRequirementsText(giveaway),
                inline: false
            }
        )
        .setFooter({
            text: `${guildName} • Infinity Giveaways`
        })
        .setTimestamp();

    if (winnerMentions) {
        embed.addFields({
            name: `🏆 Winner${giveaway.winner_count > 1 ? 's' : ''}`,
            value: winnerMentions
        });
    }

    return embed;
}

function pickWinners(entries, count) {
    const uniqueEntries = [...new Set(entries)];
    if (!uniqueEntries.length) return [];

    const poolEntries = [...uniqueEntries];
    const winners = [];

    while (poolEntries.length && winners.length < count) {
        const index = Math.floor(Math.random() * poolEntries.length);
        winners.push(poolEntries.splice(index, 1)[0]);
    }

    return winners;
}

async function fetchGiveawayByMessage(messageId) {
    const [rows] = await pool.query(
        `SELECT * FROM giveaways WHERE message_id = ? LIMIT 1`,
        [messageId]
    );

    return rows[0] || null;
}

async function fetchGiveawayById(id) {
    const [rows] = await pool.query(
        `SELECT * FROM giveaways WHERE id = ? LIMIT 1`,
        [id]
    );

    return rows[0] || null;
}

async function updateGiveawayEntries(id, entries) {
    await pool.query(
        `UPDATE giveaways SET entries_json = ? WHERE id = ?`,
        [JSON.stringify(entries), id]
    );
}

async function editGiveawayMessage(client, giveaway, winnerMentions = null) {
    const guild = await client.guilds.fetch(giveaway.guild_id).catch(() => null);
    if (!guild) return null;

    const channel = await guild.channels.fetch(giveaway.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;

    const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
    if (!message) return null;

    const embed = buildGiveawayEmbed(giveaway, guild.name, winnerMentions);

    await message.edit({
        embeds: [embed],
        components: buildGiveawayButtons(Boolean(giveaway.ended))
    });

    return { guild, channel, message };
}

async function endGiveaway(client, giveawayId, reroll = false) {
    const giveaway = await fetchGiveawayById(giveawayId);
    if (!giveaway) return { ok: false, reason: 'not_found' };

    if (giveaway.ended && !reroll) {
        return { ok: false, reason: 'already_ended' };
    }

    const entries = safeParseEntries(giveaway.entries_json);

    if (!reroll) {
        await pool.query(
            `UPDATE giveaways SET ended = 1, end_at = ? WHERE id = ?`,
            [Date.now(), giveaway.id]
        );
    }

    const updatedGiveaway = await fetchGiveawayById(giveaway.id);
    const winners = pickWinners(entries, updatedGiveaway.winner_count);
    const winnerMentions = winners.length
        ? winners.map(id => `<@${id}>`).join(', ')
        : 'No valid entries';

    const edited = await editGiveawayMessage(client, updatedGiveaway, winnerMentions);

    if (edited?.channel) {
        await edited.channel.send({
            content: winners.length
                ? `🎉 Congratulations ${winnerMentions}! You won **${updatedGiveaway.prize}**`
                : `❌ Giveaway ended for **${updatedGiveaway.prize}**, but there were no valid entries.`
        }).catch(() => null);
    }

    clearGiveawayTimer(updatedGiveaway.id);

    return {
        ok: true,
        giveaway: updatedGiveaway,
        winners
    };
}

function clearGiveawayTimer(giveawayId) {
    const existing = activeGiveawayIntervals.get(giveawayId);
    if (existing) {
        clearInterval(existing);
        activeGiveawayIntervals.delete(giveawayId);
    }
}

async function scheduleGiveaway(client, giveawayId) {
    clearGiveawayTimer(giveawayId);

    const interval = setInterval(async () => {
        try {
            const giveaway = await fetchGiveawayById(giveawayId);
            if (!giveaway) {
                clearGiveawayTimer(giveawayId);
                return;
            }

            if (giveaway.ended) {
                clearGiveawayTimer(giveawayId);
                return;
            }

            if (Date.now() >= giveaway.end_at) {
                await endGiveaway(client, giveawayId, false);
                return;
            }

            await editGiveawayMessage(client, giveaway).catch(() => null);
        } catch (error) {
            console.error('Giveaway schedule error:', error);
        }
    }, 5000);

    activeGiveawayIntervals.set(giveawayId, interval);
}

async function initGiveawayScheduler(client) {
    const [rows] = await pool.query(
        `SELECT id FROM giveaways WHERE ended = 0`
    );

    for (const row of rows) {
        await scheduleGiveaway(client, row.id);
    }
}

function checkGiveawayRequirements(member, giveaway) {
    if (giveaway.required_role_id && !member.roles.cache.has(giveaway.required_role_id)) {
        return {
            ok: false,
            message: `❌ You need the <@&${giveaway.required_role_id}> role to enter this giveaway.`
        };
    }

    if (giveaway.blacklist_role_id && member.roles.cache.has(giveaway.blacklist_role_id)) {
        return {
            ok: false,
            message: `❌ You cannot enter this giveaway because you have the <@&${giveaway.blacklist_role_id}> role.`
        };
    }

    if (Number(giveaway.min_account_age_days) > 0) {
        const accountAgeMs = Date.now() - member.user.createdTimestamp;
        const neededMs = Number(giveaway.min_account_age_days) * 24 * 60 * 60 * 1000;

        if (accountAgeMs < neededMs) {
            return {
                ok: false,
                message: `❌ Your account must be at least **${giveaway.min_account_age_days} day(s)** old to enter.`
            };
        }
    }

    if (Number(giveaway.min_join_age_days) > 0) {
        const joinedTimestamp = member.joinedTimestamp || Date.now();
        const joinAgeMs = Date.now() - joinedTimestamp;
        const neededMs = Number(giveaway.min_join_age_days) * 24 * 60 * 60 * 1000;

        if (joinAgeMs < neededMs) {
            return {
                ok: false,
                message: `❌ You must have been in this server for at least **${giveaway.min_join_age_days} day(s)** to enter.`
            };
        }
    }

    return { ok: true };
}

async function handleGiveawayEnter(interaction) {
    const giveaway = await fetchGiveawayByMessage(interaction.message.id);
    if (!giveaway) {
        return interaction.reply({
            content: '❌ Giveaway data could not be found.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (giveaway.ended || Date.now() >= giveaway.end_at) {
        return interaction.reply({
            content: '❌ This giveaway has already ended.',
            flags: MessageFlags.Ephemeral
        });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
        return interaction.reply({
            content: '❌ Could not verify your server membership.',
            flags: MessageFlags.Ephemeral
        });
    }

    const requirementCheck = checkGiveawayRequirements(member, giveaway);
    if (!requirementCheck.ok) {
        return interaction.reply({
            content: requirementCheck.message,
            flags: MessageFlags.Ephemeral
        });
    }

    const entries = safeParseEntries(giveaway.entries_json);

    if (entries.includes(interaction.user.id)) {
        return interaction.reply({
            content: '❌ You are already entered in this giveaway.',
            flags: MessageFlags.Ephemeral
        });
    }

    entries.push(interaction.user.id);
    await updateGiveawayEntries(giveaway.id, entries);

    const updatedGiveaway = await fetchGiveawayById(giveaway.id);
    await editGiveawayMessage(interaction.client, updatedGiveaway).catch(() => null);

    return interaction.reply({
        content: `✅ You have entered **${updatedGiveaway.prize}**. Good luck!`,
        flags: MessageFlags.Ephemeral
    });
}

async function handleGiveawayEntries(interaction) {
    const giveaway = await fetchGiveawayByMessage(interaction.message.id);
    if (!giveaway) {
        return interaction.reply({
            content: '❌ Giveaway data could not be found.',
            flags: MessageFlags.Ephemeral
        });
    }

    const entries = safeParseEntries(giveaway.entries_json);

    return interaction.reply({
        content: entries.length
            ? `👥 **${giveaway.prize}** currently has **${entries.length}** entr${entries.length === 1 ? 'y' : 'ies'}.`
            : `👥 **${giveaway.prize}** currently has **0 entries**.`,
        flags: MessageFlags.Ephemeral
    });
}

async function handleGiveawayEnd(interaction) {
    if (!interaction.memberPermissions?.has('ManageGuild')) {
        return interaction.reply({
            content: '❌ You need **Manage Server** to end giveaways.',
            flags: MessageFlags.Ephemeral
        });
    }

    const giveaway = await fetchGiveawayByMessage(interaction.message.id);
    if (!giveaway) {
        return interaction.reply({
            content: '❌ Giveaway data could not be found.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (giveaway.ended) {
        return interaction.reply({
            content: '❌ This giveaway has already ended.',
            flags: MessageFlags.Ephemeral
        });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`giveaway_confirm_end_${giveaway.id}`)
            .setLabel('Confirm End')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`giveaway_cancel_end_${giveaway.id}`)
            .setLabel('Cancel')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({
        content: `⚠️ Are you sure you want to end **${giveaway.prize}** right now?`,
        components: [row],
        flags: MessageFlags.Ephemeral
    });
}

async function handleGiveawayConfirmEnd(interaction, giveawayId) {
    if (!interaction.memberPermissions?.has('ManageGuild')) {
        return interaction.reply({
            content: '❌ You need **Manage Server** to end giveaways.',
            flags: MessageFlags.Ephemeral
        });
    }

    const result = await endGiveaway(interaction.client, giveawayId, false);

    if (!result.ok && result.reason === 'already_ended') {
        return interaction.update({
            content: '❌ This giveaway has already ended.',
            components: []
        });
    }

    return interaction.update({
        content: `✅ Giveaway ended for **${result.giveaway.prize}**.`,
        components: []
    });
}

async function handleGiveawayCancelEnd(interaction) {
    return interaction.update({
        content: '✅ Giveaway end cancelled.',
        components: []
    });
}

async function handleGiveawayReroll(interaction) {
    if (!interaction.memberPermissions?.has('ManageGuild')) {
        return interaction.reply({
            content: '❌ You need **Manage Server** to reroll giveaways.',
            flags: MessageFlags.Ephemeral
        });
    }

    const giveaway = await fetchGiveawayByMessage(interaction.message.id);
    if (!giveaway) {
        return interaction.reply({
            content: '❌ Giveaway data could not be found.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (!giveaway.ended) {
        return interaction.reply({
            content: '❌ End the giveaway before rerolling it.',
            flags: MessageFlags.Ephemeral
        });
    }

    await endGiveaway(interaction.client, giveaway.id, true);

    return interaction.reply({
        content: `✅ Giveaway rerolled for **${giveaway.prize}**.`,
        flags: MessageFlags.Ephemeral
    });
}

module.exports = {
    parseDuration,
    formatDuration,
    buildGiveawayEmbed,
    buildGiveawayButtons,
    fetchGiveawayByMessage,
    fetchGiveawayById,
    updateGiveawayEntries,
    editGiveawayMessage,
    endGiveaway,
    scheduleGiveaway,
    initGiveawayScheduler,
    handleGiveawayEnter,
    handleGiveawayEntries,
    handleGiveawayEnd,
    handleGiveawayConfirmEnd,
    handleGiveawayCancelEnd,
    handleGiveawayReroll
};