const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');

const { pool } = require('../../database');
const {
    parseDuration,
    buildGiveawayEmbed,
    buildGiveawayButtons,
    scheduleGiveaway,
    fetchGiveawayByMessage,
    endGiveaway,
    editGiveawayMessage
} = require('../../utils/giveaway');

module.exports = {
    name: 'giveaway',
    description: 'Create and manage giveaways.',
    usage: '/giveaway create | edit | end | reroll | list | delete',
    userPermissions: PermissionFlagsBits.ManageGuild,

    slashData: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Create and manage giveaways')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

        .addSubcommand(sub =>
            sub
                .setName('create')
                .setDescription('Create a new giveaway')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to send the giveaway in')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('prize')
                        .setDescription('Prize name')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('duration')
                        .setDescription('Duration, e.g. 10m, 1h, 2d')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('winners')
                        .setDescription('How many winners')
                        .setMinValue(1)
                        .setMaxValue(20)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('Optional giveaway description')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option
                        .setName('required_role')
                        .setDescription('Role required to enter')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option
                        .setName('blacklist_role')
                        .setDescription('Role blocked from entering')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('min_account_age_days')
                        .setDescription('Minimum account age in days')
                        .setMinValue(0)
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('min_join_age_days')
                        .setDescription('Minimum server join age in days')
                        .setMinValue(0)
                        .setRequired(false)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName('edit')
                .setDescription('Edit a giveaway by message ID')
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('Giveaway message ID')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('prize')
                        .setDescription('New prize name')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('New description')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('duration')
                        .setDescription('Add more time or set a fresh duration from now, e.g. 10m, 1h')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('winners')
                        .setDescription('New winner count')
                        .setMinValue(1)
                        .setMaxValue(20)
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option
                        .setName('required_role')
                        .setDescription('New required role')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option
                        .setName('blacklist_role')
                        .setDescription('New blacklist role')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('min_account_age_days')
                        .setDescription('New minimum account age')
                        .setMinValue(0)
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('min_join_age_days')
                        .setDescription('New minimum join age')
                        .setMinValue(0)
                        .setRequired(false)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName('end')
                .setDescription('End a giveaway by message ID')
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('Giveaway message ID')
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName('reroll')
                .setDescription('Reroll a giveaway by message ID')
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('Giveaway message ID')
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName('list')
                .setDescription('List active and ended giveaways')
        )

        .addSubcommand(sub =>
            sub
                .setName('delete')
                .setDescription('Delete a giveaway by message ID')
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('Giveaway message ID')
                        .setRequired(true)
                )
                .addBooleanOption(option =>
                    option
                        .setName('delete_message')
                        .setDescription('Also delete the giveaway message')
                        .setRequired(false)
                )
        ),

    async executeSlash(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const sub = interaction.options.getSubcommand();

            if (sub === 'create') {
                const channel = interaction.options.getChannel('channel', true);
                const prize = interaction.options.getString('prize', true).trim();
                const durationInput = interaction.options.getString('duration', true).trim();
                const winnerCount = interaction.options.getInteger('winners', true);
                const description = interaction.options.getString('description')?.trim() || null;
                const requiredRole = interaction.options.getRole('required_role');
                const blacklistRole = interaction.options.getRole('blacklist_role');
                const minAccountAgeDays = interaction.options.getInteger('min_account_age_days') || 0;
                const minJoinAgeDays = interaction.options.getInteger('min_join_age_days') || 0;

                const durationMs = parseDuration(durationInput);

                if (!durationMs || durationMs < 10_000) {
                    return interaction.editReply({
                        content: '❌ Duration must be at least **10s**. Example: `10m`, `1h`, `2d`'
                    });
                }

                const createdAt = Date.now();
                const endAt = createdAt + durationMs;

                const tempGiveaway = {
                    prize,
                    description,
                    winner_count: winnerCount,
                    entries_json: '[]',
                    ended: 0,
                    host_id: interaction.user.id,
                    end_at: endAt,
                    required_role_id: requiredRole?.id || null,
                    blacklist_role_id: blacklistRole?.id || null,
                    min_account_age_days: minAccountAgeDays,
                    min_join_age_days: minJoinAgeDays
                };

                const message = await channel.send({
                    embeds: [buildGiveawayEmbed(tempGiveaway, interaction.guild.name)],
                    components: buildGiveawayButtons(false)
                });

                const [result] = await pool.query(
                    `
                    INSERT INTO giveaways
                    (
                        guild_id, channel_id, message_id, host_id, prize, description,
                        winner_count, entries_json, ended, created_at, end_at,
                        required_role_id, blacklist_role_id, min_account_age_days, min_join_age_days
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `,
                    [
                        interaction.guild.id,
                        channel.id,
                        message.id,
                        interaction.user.id,
                        prize,
                        description,
                        winnerCount,
                        JSON.stringify([]),
                        0,
                        createdAt,
                        endAt,
                        requiredRole?.id || null,
                        blacklistRole?.id || null,
                        minAccountAgeDays,
                        minJoinAgeDays
                    ]
                );

                await scheduleGiveaway(interaction.client, result.insertId);

                return interaction.editReply({
                    content: `✅ Giveaway sent in ${channel} for **${prize}**.`
                });
            }

            if (sub === 'edit') {
                const messageId = interaction.options.getString('message_id', true).trim();
                const giveaway = await fetchGiveawayByMessage(messageId);

                if (!giveaway) {
                    return interaction.editReply({
                        content: '❌ Giveaway not found for that message ID.'
                    });
                }

                const newPrize = interaction.options.getString('prize');
                const newDescription = interaction.options.getString('description');
                const newDuration = interaction.options.getString('duration');
                const newWinners = interaction.options.getInteger('winners');
                const requiredRole = interaction.options.getRole('required_role');
                const blacklistRole = interaction.options.getRole('blacklist_role');
                const minAccountAgeDays = interaction.options.getInteger('min_account_age_days');
                const minJoinAgeDays = interaction.options.getInteger('min_join_age_days');

                let endAt = giveaway.end_at;

                if (newDuration) {
                    const durationMs = parseDuration(newDuration);
                    if (!durationMs || durationMs < 10_000) {
                        return interaction.editReply({
                            content: '❌ Duration must be at least **10s**.'
                        });
                    }
                    endAt = Date.now() + durationMs;
                }

                await pool.query(
                    `
                    UPDATE giveaways
                    SET prize = ?,
                        description = ?,
                        winner_count = ?,
                        end_at = ?,
                        required_role_id = ?,
                        blacklist_role_id = ?,
                        min_account_age_days = ?,
                        min_join_age_days = ?
                    WHERE id = ?
                    `,
                    [
                        newPrize?.trim() || giveaway.prize,
                        newDescription !== null ? (newDescription.trim() || null) : giveaway.description,
                        newWinners || giveaway.winner_count,
                        endAt,
                        requiredRole ? requiredRole.id : giveaway.required_role_id,
                        blacklistRole ? blacklistRole.id : giveaway.blacklist_role_id,
                        minAccountAgeDays !== null ? minAccountAgeDays : giveaway.min_account_age_days,
                        minJoinAgeDays !== null ? minJoinAgeDays : giveaway.min_join_age_days,
                        giveaway.id
                    ]
                );

                const updatedGiveaway = await fetchGiveawayByMessage(messageId);
                await editGiveawayMessage(interaction.client, updatedGiveaway);
                await scheduleGiveaway(interaction.client, updatedGiveaway.id);

                return interaction.editReply({
                    content: `✅ Giveaway updated for **${updatedGiveaway.prize}**.`
                });
            }

            if (sub === 'end') {
                const messageId = interaction.options.getString('message_id', true).trim();
                const giveaway = await fetchGiveawayByMessage(messageId);

                if (!giveaway) {
                    return interaction.editReply({
                        content: '❌ Giveaway not found for that message ID.'
                    });
                }

                const result = await endGiveaway(interaction.client, giveaway.id, false);

                if (!result.ok && result.reason === 'already_ended') {
                    return interaction.editReply({
                        content: '❌ That giveaway has already ended.'
                    });
                }

                return interaction.editReply({
                    content: `✅ Giveaway ended for **${giveaway.prize}**.`
                });
            }

            if (sub === 'reroll') {
                const messageId = interaction.options.getString('message_id', true).trim();
                const giveaway = await fetchGiveawayByMessage(messageId);

                if (!giveaway) {
                    return interaction.editReply({
                        content: '❌ Giveaway not found for that message ID.'
                    });
                }

                if (!giveaway.ended) {
                    return interaction.editReply({
                        content: '❌ End the giveaway before rerolling it.'
                    });
                }

                await endGiveaway(interaction.client, giveaway.id, true);

                return interaction.editReply({
                    content: `✅ Giveaway rerolled for **${giveaway.prize}**.`
                });
            }

            if (sub === 'list') {
                const [rows] = await pool.query(
                    `SELECT * FROM giveaways WHERE guild_id = ? ORDER BY ended ASC, end_at ASC LIMIT 20`,
                    [interaction.guild.id]
                );

                if (!rows.length) {
                    return interaction.editReply({
                        content: '❌ No giveaways found for this server.'
                    });
                }

                const active = rows.filter(row => !row.ended);
                const ended = rows.filter(row => row.ended);

                const embed = new EmbedBuilder()
                    .setTitle('🎉 Infinity Giveaways')
                    .setColor('#00bfff')
                    .setTimestamp();

                embed.addFields({
                    name: '🟢 Active Giveaways',
                    value: active.length
                        ? active.map(g => `**${g.prize}**\nMessage ID: \`${g.message_id}\`\nChannel: <#${g.channel_id}>\nEnds: <t:${Math.floor(g.end_at / 1000)}:R>`).join('\n\n')
                        : 'No active giveaways.'
                });

                embed.addFields({
                    name: '🔴 Ended Giveaways',
                    value: ended.length
                        ? ended.slice(0, 10).map(g => `**${g.prize}**\nMessage ID: \`${g.message_id}\`\nChannel: <#${g.channel_id}>`).join('\n\n')
                        : 'No ended giveaways.'
                });

                return interaction.editReply({
                    embeds: [embed]
                });
            }

            if (sub === 'delete') {
                const messageId = interaction.options.getString('message_id', true).trim();
                const deleteMessage = interaction.options.getBoolean('delete_message') || false;
                const giveaway = await fetchGiveawayByMessage(messageId);

                if (!giveaway) {
                    return interaction.editReply({
                        content: '❌ Giveaway not found for that message ID.'
                    });
                }

                if (deleteMessage) {
                    const channel = await interaction.guild.channels.fetch(giveaway.channel_id).catch(() => null);
                    if (channel && channel.isTextBased()) {
                        const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
                        if (message) {
                            await message.delete().catch(() => null);
                        }
                    }
                }

                await pool.query(`DELETE FROM giveaways WHERE id = ?`, [giveaway.id]);

                return interaction.editReply({
                    content: `✅ Giveaway deleted for **${giveaway.prize}**.`
                });
            }

            return interaction.editReply({
                content: '❌ Unknown subcommand.'
            });
        } catch (error) {
            console.error('Giveaway command error:', error);

            return interaction.editReply({
                content: '❌ Something went wrong while running that command.'
            });
        }
    }
};