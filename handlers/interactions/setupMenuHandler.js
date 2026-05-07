const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    ChannelType,
    RoleSelectMenuBuilder
} = require('discord.js');

const { pool } = require('../../database');
const {
    getLogSettings,
    setLogChannel,
    setLoggingEnabled
} = require('../../utils/advancedLogger');

const { safeDeferUpdate, safeReply } = require('./safeReply');

const pendingLoggingSetups = new Map();

function buildSetupMainEmbed(interaction) {
    return new EmbedBuilder()
        .setColor('#00bfff')
        .setAuthor({
            name: 'Infinity Setup Wizard',
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTitle('🚀 Welcome to Infinity Setup')
        .setDescription(
            'Let’s get Infinity configured for your server.\n\n' +
            'Choose what you want to set up below. If this is your first time using Infinity, start with **Full Setup**.'
        )
        .addFields(
            {
                name: '⚡ Recommended First Steps',
                value:
                    '```yaml\n' +
                    '1. Configure logging\n' +
                    '2. Configure tickets\n' +
                    '3. Configure AutoMod\n' +
                    '4. Configure welcome messages\n' +
                    '5. Optional: applications, ranks, reaction roles\n' +
                    '```',
                inline: false
            },
            {
                name: '🧩 Setup Options',
                value:
                    '🎯 **Full Setup** — guided server setup\n' +
                    '🛡️ **Logging** — configure log channels\n' +
                    '🎫 **Tickets** — configure support tickets\n' +
                    '🤖 **AutoMod** — configure protection\n' +
                    '👋 **Welcome** — configure welcome messages',
                inline: false
            }
        )
        .setFooter({ text: 'Infinity Bot • Setup System ⚡' })
        .setTimestamp();
}

function buildSetupMainComponents() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('setup_full')
            .setLabel('Full Setup')
            .setEmoji('🎯')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId('setup_logging')
            .setLabel('Logging')
            .setEmoji('🛡️')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('setup_tickets')
            .setLabel('Tickets')
            .setEmoji('🎫')
            .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('setup_automod')
            .setLabel('AutoMod')
            .setEmoji('🤖')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('setup_welcome')
            .setLabel('Welcome')
            .setEmoji('👋')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('setup_diagnose')
            .setLabel('Diagnose')
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Secondary)
    );

    return [row1, row2];
}

function buildBackButton() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('setup_back')
            .setLabel('Back')
            .setEmoji('⬅️')
            .setStyle(ButtonStyle.Secondary)
    );
}

async function buildDiagnoseEmbed(interaction) {
    const guild = interaction.guild;
    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);

    const checks = [];
    const hasPerm = (permission) => me?.permissions.has(permission);

    checks.push({
        name: 'Bot Permissions',
        ok:
            hasPerm(PermissionFlagsBits.ManageChannels) &&
            hasPerm(PermissionFlagsBits.ManageRoles) &&
            hasPerm(PermissionFlagsBits.ManageMessages) &&
            hasPerm(PermissionFlagsBits.EmbedLinks),
        note: 'Needs Manage Channels, Manage Roles, Manage Messages, and Embed Links.'
    });

    const logging = await getLogSettings(guild.id).catch(() => null);

    checks.push({
        name: 'Logging',
        ok: Boolean(
            Number(logging?.enabled) &&
            (
                logging?.message_logs ||
                logging?.member_logs ||
                logging?.role_logs ||
                logging?.channel_logs ||
                logging?.server_logs ||
                logging?.moderation_logs
            )
        ),
        note: logging
            ? 'At least one logging channel is configured.'
            : 'Run `/logging setup` to configure logs.'
    });

    const [ticketRows] = await pool.query(
        `SELECT panel_channel_id
         FROM ticket_settings
         WHERE guild_id = ?
         LIMIT 1`,
        [guild.id]
    ).catch(() => [[]]);

    const tickets = ticketRows[0];

    checks.push({
        name: 'Tickets',
        ok: Boolean(tickets?.panel_channel_id),
        note: tickets?.panel_channel_id
            ? 'Ticket panel channel is configured.'
            : 'Run `/ticketconfig` and `/ticketpanel`.'
    });

    const [appRows] = await pool.query(
        `SELECT panel_channel_id
         FROM application_settings
         WHERE guild_id = ?
         LIMIT 1`,
        [guild.id]
    ).catch(() => [[]]);

    const apps = appRows[0];

    checks.push({
        name: 'Applications',
        ok: Boolean(apps?.panel_channel_id),
        note: apps?.panel_channel_id
            ? 'Application panel channel configured.'
            : 'Optional: use `/applicationconfig` if this server uses applications.'
    });

    const [welcomeRows] = await pool.query(
        `SELECT welcome_enabled, welcome_channel
         FROM guild_settings
         WHERE guild_id = ?
         LIMIT 1`,
        [guild.id]
    ).catch(() => [[]]);

    const welcome = welcomeRows[0];

    checks.push({
        name: 'Welcome System',
        ok: Boolean(welcome?.welcome_enabled && welcome?.welcome_channel),
        note: welcome?.welcome_enabled && welcome?.welcome_channel
            ? 'Welcome system is configured.'
            : 'Optional: use `/setwelcomeconfig`.'
    });

    const lines = checks.map(check => {
        const icon = check.ok ? '✅' : '❌';
        return `${icon} **${check.name}**\n> ${check.note}`;
    });

    const score = checks.filter(check => check.ok).length;

    return new EmbedBuilder()
        .setColor(score === checks.length ? '#57f287' : '#ffaa00')
        .setAuthor({
            name: 'Infinity Setup Wizard',
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTitle('🔍 Infinity Setup Diagnose')
        .setDescription(
            `Setup Progress: **${score}/${checks.length}** checks passed\n\n` +
            lines.join('\n\n')
        )
        .setFooter({ text: 'Infinity Bot • Setup Diagnose ⚡' })
        .setTimestamp();
}

function getSetupKey(interaction) {
    return `${interaction.guild.id}:${interaction.user.id}`;
}

async function handleLoggingRoleSelect(interaction) {
    const selectedRoleIds = interaction.values;
    const key = getSetupKey(interaction);

    pendingLoggingSetups.set(key, {
        roleIds: selectedRoleIds,
        createdAt: Date.now()
    });

    const embed = new EmbedBuilder()
        .setColor('#00bfff')
        .setAuthor({
            name: 'Infinity Setup Wizard',
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTitle('🛡️ Confirm Logging Setup')
        .setDescription(
            'Infinity will create or update the logging channels with private permissions.\n\n' +
            '**Roles that will see logs:**\n' +
            selectedRoleIds.map(id => `• <@&${id}>`).join('\n') +
            '\n\n' +
            '```yaml\n' +
            '@everyone: View Channel denied\n' +
            'Selected roles: View Channel allowed\n' +
            'Infinity: View, Send Messages, Embed Links allowed\n' +
            '```'
        )
        .setFooter({ text: 'Infinity Bot • Logging Setup Confirmation ⚡' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('setup_logging_confirm')
            .setLabel('Confirm Setup')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId('setup_back')
            .setLabel('Cancel')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Secondary)
    );

    return interaction.update({
        embeds: [embed],
        components: [row]
    }).catch(() => null);
}

async function handleAutoLoggingSetup(interaction) {
    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    const guild = interaction.guild;

    const key = getSetupKey(interaction);
    const pending = pendingLoggingSetups.get(key);

    if (!pending?.roleIds?.length) {
        return safeReply(interaction, {
            content: '❌ No logging roles selected. Please go back and select roles first.',
            components: [buildBackButton()]
        });
    }

    const allowedRoleIds = pending.roleIds;
    pendingLoggingSetups.delete(key);

    try {

        const permissionOverwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: interaction.client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.EmbedLinks
                ]
            },
            ...allowedRoleIds.map(roleId => ({
                id: roleId,
                allow: [PermissionFlagsBits.ViewChannel]
            }))
        ];

        const existingLogging = await getLogSettings(guild.id).catch(() => null);
        const alreadyConfigured = Boolean(
            Number(existingLogging?.enabled) &&
            (
                existingLogging?.message_logs ||
                existingLogging?.member_logs ||
                existingLogging?.role_logs ||
                existingLogging?.channel_logs ||
                existingLogging?.server_logs ||
                existingLogging?.moderation_logs
            )
        );

        const existingCategory =
            guild.channels.cache.find(channel =>
                channel.type === ChannelType.GuildCategory &&
                channel.name.toLowerCase() === 'infinity logs'
            );

        const category = existingCategory || await guild.channels.create({
            name: 'Infinity Logs',
            type: ChannelType.GuildCategory,
            permissionOverwrites,
            reason: 'Infinity setup wizard logging auto setup'
        });

        await category.permissionOverwrites.set(permissionOverwrites).catch(() => null);

        const createOrFindChannel = async (name) => {
            const existing = guild.channels.cache.find(channel =>
                channel.type === ChannelType.GuildText &&
                channel.name === name
            );

            if (existing) {
                await existing.permissionOverwrites.set(permissionOverwrites).catch(() => null);
                if (existing.parentId !== category.id) {
                    await existing.setParent(category.id).catch(() => null);
                }
                return existing;
            }

            return guild.channels.create({
                name,
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites,
                reason: 'Infinity setup wizard logging auto setup'
            });
        };

        const channels = {
            message: await createOrFindChannel('message-logs'),
            member: await createOrFindChannel('member-logs'),
            moderation: await createOrFindChannel('moderation-logs'),
            role: await createOrFindChannel('role-logs'),
            channel: await createOrFindChannel('channel-logs'),
            server: await createOrFindChannel('server-logs')
        };

        await setLoggingEnabled(guild.id, true);

        await setLogChannel(guild.id, 'message', channels.message.id);
        await setLogChannel(guild.id, 'member', channels.member.id);
        await setLogChannel(guild.id, 'moderation', channels.moderation.id);
        await setLogChannel(guild.id, 'role', channels.role.id);
        await setLogChannel(guild.id, 'channel', channels.channel.id);
        await setLogChannel(guild.id, 'server', channels.server.id);

        const embed = new EmbedBuilder()
            .setColor('#57f287')
            .setAuthor({
                name: 'Infinity Setup Wizard',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('✅ Logging Auto Setup Complete')
            .setDescription(
                alreadyConfigured
                    ? 'Infinity updated your existing logging setup and refreshed channel permissions.'
                    : 'Infinity created and configured your logging channels.'
            )
            .addFields(
                {
                    name: '📁 Created / Configured',
                    value:
                        `${channels.message}\n` +
                        `${channels.member}\n` +
                        `${channels.moderation}\n` +
                        `${channels.role}\n` +
                        `${channels.channel}\n` +
                        `${channels.server}`,
                    inline: false
                },
                {
                    name: '🔐 Logging Access',
                    value:
                        '**Allowed Roles:**\n' +
                        allowedRoleIds.map(id => `• <@&${id}>`).join('\n') +
                        '\n\n**@everyone:** View Channel denied',
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Bot • Logging Setup ⚡' })
            .setTimestamp();

        return safeReply(interaction, {
            embeds: [embed],
            components: [buildBackButton()]
        });

    } catch (error) {
        console.error('Auto logging setup error:', error);

        return safeReply(interaction, {
            content: '❌ Failed to auto configure logging. Make sure I have **Manage Channels** and **Embed Links**.',
            embeds: [],
            components: [buildBackButton()]
        });
    }
}

async function handleAutoTicketSetup(interaction) {
    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    const guild = interaction.guild;

    try {
        let staffRole =
            guild.roles.cache.find(r => r.name.toLowerCase().trim() === 'support');

        if (!staffRole) {
            staffRole = await guild.roles.create({
                name: 'Support',
                color: 0x00bfff,
                reason: 'Infinity setup wizard created staff role'
            });
        }

        const category = await guild.channels.create({
            name: 'Tickets',
            type: ChannelType.GuildCategory,
            reason: 'Infinity setup wizard created ticket category'
        });

        const panelChannel = await guild.channels.create({
            name: 'create-a-ticket',
            type: ChannelType.GuildText,
            parent: category.id,
            reason: 'Infinity setup wizard created ticket panel channel'
        });

        const transcriptChannel = await guild.channels.create({
            name: 'ticket-transcripts',
            type: ChannelType.GuildText,
            parent: category.id,
            reason: 'Infinity setup wizard created transcript channel'
        });

        await pool.query(
            `INSERT INTO ticket_settings 
    (guild_id, category_id, panel_channel_id, transcript_channel_id, support_role_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
        category_id = VALUES(category_id),
        panel_channel_id = VALUES(panel_channel_id),
        transcript_channel_id = VALUES(transcript_channel_id),
        support_role_id = VALUES(support_role_id),
        updated_at = VALUES(updated_at)`,
            [
                guild.id,
                category.id,
                panelChannel.id,
                transcriptChannel.id,
                staffRole.id,
                Date.now()
            ]
        );

        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setAuthor({
                name: '🎫 Infinity Support Center',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setDescription(
                'Click the button below to create a support ticket.'
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_create')
                .setLabel('Create Ticket')
                .setEmoji('🎫')
                .setStyle(ButtonStyle.Primary)
        );

        await panelChannel.send({
            embeds: [embed],
            components: [row]
        });

        const successEmbed = new EmbedBuilder()
            .setColor('#57f287')
            .setAuthor({
                name: 'Infinity Setup Wizard',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('✅ Ticket Setup Complete')
            .setDescription('Your ticket system has been fully configured.')
            .addFields(
                {
                    name: '📂 Ticket Category',
                    value: `${category}`,
                    inline: true
                },
                {
                    name: '📍 Panel Channel',
                    value: `${panelChannel}`,
                    inline: true
                },
                {
                    name: '📝 Transcripts Channel',
                    value: `${transcriptChannel}`,
                    inline: true
                },
                {
                    name: '🛡️ Support Role',
                    value: `${staffRole}`,
                    inline: true
                }
            )
            .setFooter({ text: 'Infinity Bot • Ticket Setup ⚡' })
            .setTimestamp();

        return safeReply(interaction, {
            embeds: [successEmbed],
            components: [buildBackButton()]
        });

    } catch (error) {
        console.error('Auto ticket setup error:', error);

        return safeReply(interaction, {
            content: '❌ Failed to auto setup tickets.',
            components: [buildBackButton()]
        });
    }
}

async function handleAutoWelcomeSetup(interaction) {
    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    const guild = interaction.guild;

    try {
        const createOrFindCategory = async (name) => {
            const existing = guild.channels.cache.find(channel =>
                channel.type === ChannelType.GuildCategory &&
                channel.name.toLowerCase() === name.toLowerCase()
            );

            if (existing) return existing;

            return guild.channels.create({
                name,
                type: ChannelType.GuildCategory,
                reason: 'Infinity setup wizard welcome auto setup'
            });
        };

        const createOrFindChannel = async (name, parentId) => {
            const existing = guild.channels.cache.find(channel =>
                channel.type === ChannelType.GuildText &&
                channel.name === name
            );

            if (existing) {
                if (existing.parentId !== parentId) {
                    await existing.setParent(parentId).catch(() => null);
                }

                return existing;
            }

            return guild.channels.create({
                name,
                type: ChannelType.GuildText,
                parent: parentId,
                reason: 'Infinity setup wizard welcome auto setup'
            });
        };

        const informationCategory = await createOrFindCategory('Information');
        const communityCategory = await createOrFindCategory('Community');

        const welcomeChannel = await createOrFindChannel('welcome', informationCategory.id);
        const rulesChannel = await createOrFindChannel('rules', informationCategory.id);
        const chatChannel = await createOrFindChannel('general', communityCategory.id);

        const welcomeTitle = '✨ Welcome to the Server';
        const welcomeMessage =
            'Welcome to **{server}**, {user}!\n\n' +
            'We’re happy to have you here. Make sure to read the rules, introduce yourself, and enjoy the community.';

        await pool.query(
            `INSERT INTO guild_settings (
                guild_id,
                welcome_enabled,
                welcome_channel,
                welcome_title,
                welcome_message,
                welcome_color,
                welcome_rules_channel,
                welcome_chat_channel
            )
            VALUES (?, 1, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                welcome_enabled = 1,
                welcome_channel = VALUES(welcome_channel),
                welcome_title = VALUES(welcome_title),
                welcome_message = VALUES(welcome_message),
                welcome_color = VALUES(welcome_color),
                welcome_rules_channel = VALUES(welcome_rules_channel),
                welcome_chat_channel = VALUES(welcome_chat_channel)`,
            [
                guild.id,
                welcomeChannel.id,
                welcomeTitle,
                welcomeMessage,
                '#00bfff',
                rulesChannel.id,
                chatChannel.id
            ]
        );

        const previewEmbed = new EmbedBuilder()
            .setColor('#00bfff')
            .setAuthor({
                name: `${guild.name} • Welcome System`,
                iconURL: guild.iconURL({ dynamic: true }) || undefined
            })
            .setTitle(welcomeTitle)
            .setDescription(
                `## ${welcomeMessage
                    .replaceAll('{server}', guild.name)
                    .replaceAll('{user}', `${interaction.user}`)}\n\n` +
                `> New members will see a welcome message like this when they join.\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📜 **Rules:** ${rulesChannel}\n` +
                `💬 **Chat:** ${chatChannel}\n` +
                `📍 **Welcome Channel:** ${welcomeChannel}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`
            )
            .setFooter({ text: `Welcome to ${guild.name}` })
            .setTimestamp();

        await welcomeChannel.send({
            content: `🎉 Welcome system preview for ${interaction.user}`,
            embeds: [previewEmbed]
        }).catch(() => null);

        const successEmbed = new EmbedBuilder()
            .setColor('#57f287')
            .setAuthor({
                name: 'Infinity Setup Wizard',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('✅ Welcome Setup Complete')
            .setDescription('Infinity created and configured your welcome system.')
            .addFields(
                {
                    name: '👋 Welcome Channel',
                    value: `${welcomeChannel}`,
                    inline: true
                },
                {
                    name: '📜 Rules Channel',
                    value: `${rulesChannel}`,
                    inline: true
                },
                {
                    name: '💬 Chat Channel',
                    value: `${chatChannel}`,
                    inline: true
                },
                {
                    name: '📂 Information Category',
                    value: `${informationCategory}`,
                    inline: true
                },
                {
                    name: '📂 Community Category',
                    value: `${communityCategory}`,
                    inline: true
                },
            )
            .setFooter({ text: 'Infinity Bot • Welcome Setup ⚡' })
            .setTimestamp();

        return safeReply(interaction, {
            embeds: [successEmbed],
            components: [buildBackButton()]
        });

    } catch (error) {
        console.error('Auto welcome setup error:', error);

        return safeReply(interaction, {
            content: '❌ Failed to auto setup welcome messages. Make sure I have **Manage Channels**, **Send Messages**, and **Embed Links**.',
            components: [buildBackButton()]
        });
    }
}

async function handleAutomodPreset(interaction, preset) {
    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    const guildId = interaction.guild.id;

    try {
        if (preset === 'basic') {
            await pool.query(
                `INSERT INTO automod_config (
                    guild_id,
                    spam_enabled,
                    links_enabled,
                    invites_enabled,
                    caps_enabled,
                    filter_enabled
                )
                VALUES (?, 1, 0, 1, 1, 0)
                ON DUPLICATE KEY UPDATE
                    spam_enabled = 1,
                    links_enabled = 0,
                    invites_enabled = 1,
                    caps_enabled = 1,
                    filter_enabled = 0`,
                [guildId]
            );

            const rules = [
                ['spam', 1, 'warn'],
                ['spam', 2, 'timeout:300000'],
                ['spam', 3, 'kick'],

                ['invites', 1, 'warn'],
                ['invites', 2, 'timeout:300000'],
                ['invites', 3, 'kick'],

                ['caps', 1, 'warn'],
                ['caps', 2, 'timeout:300000'],
                ['caps', 3, 'kick']
            ];

            for (const [type, offense, punishment] of rules) {
                await pool.query(
                    `INSERT INTO automod_punishments (guild_id, type, offense_number, punishment)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE punishment = VALUES(punishment)`,
                    [guildId, type, offense, punishment]
                );
            }

            const automodCache = require('../../utils/automod');
            automodCache.invalidateAutomodCache(guildId);

            const embed = new EmbedBuilder()
                .setColor('#57f287')
                .setAuthor({
                    name: 'Infinity Setup Wizard',
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setTitle('✅ Basic AutoMod Protection Enabled')
                .setDescription(
                    'Infinity has applied a safe beginner-friendly AutoMod setup for your server.'
                )
                .addFields(
                    {
                        name: '🛡️ Enabled Protections',
                        value:
                            '```yaml\n' +
                            'Spam: Enabled\n' +
                            'Invites: Enabled\n' +
                            'Caps: Enabled\n' +
                            'Links: Disabled\n' +
                            'Word Filter: Disabled\n' +
                            '```',
                        inline: false
                    },
                    {
                        name: '⚖️ Punishment Rules',
                        value:
                            '```yaml\n' +
                            'Offense #1: Warn\n' +
                            'Offense #2: Timeout 5 minutes\n' +
                            'Offense #3: Kick\n' +
                            '```',
                        inline: false
                    }
                )
                .setFooter({ text: 'Infinity Bot • Basic AutoMod Setup ⚡' })
                .setTimestamp();

            return safeReply(interaction, {
                embeds: [embed],
                components: [buildBackButton()]
            });
        }
        if (preset === 'recommended') {
            await pool.query(
                `INSERT INTO automod_config (
            guild_id,
            spam_enabled,
            links_enabled,
            invites_enabled,
            caps_enabled,
            filter_enabled
        )
        VALUES (?, 1, 1, 1, 1, 1)
        ON DUPLICATE KEY UPDATE
            spam_enabled = 1,
            links_enabled = 1,
            invites_enabled = 1,
            caps_enabled = 1,
            filter_enabled = 1`,
                [guildId]
            );

            const rules = [
                ['spam', 1, 'warn'],
                ['spam', 2, 'warn'],
                ['spam', 3, 'timeout:60000'],
                ['spam', 4, 'timeout:300000'],
                ['spam', 5, 'kick'],

                ['links', 1, 'warn'],
                ['links', 2, 'warn'],
                ['links', 3, 'timeout:60000'],
                ['links', 4, 'timeout:300000'],
                ['links', 5, 'kick'],

                ['invites', 1, 'warn'],
                ['invites', 2, 'warn'],
                ['invites', 3, 'timeout:60000'],
                ['invites', 4, 'timeout:300000'],
                ['invites', 5, 'kick'],

                ['caps', 1, 'warn'],
                ['caps', 2, 'warn'],
                ['caps', 3, 'timeout:60000'],
                ['caps', 4, 'timeout:300000'],
                ['caps', 5, 'kick'],

                ['filter', 1, 'warn'],
                ['filter', 2, 'warn'],
                ['filter', 3, 'timeout:60000'],
                ['filter', 4, 'timeout:300000'],
                ['filter', 5, 'kick'],
            ];

            for (const [type, offense, punishment] of rules) {
                await pool.query(
                    `INSERT INTO automod_punishments (
                guild_id,
                type,
                offense_number,
                punishment
            )
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                punishment = VALUES(punishment)`,
                    [guildId, type, offense, punishment]
                );
            }

            const starterWords = [
                'discord.gg',
                'free nitro',
                '@everyone',
                '@here'
            ];

            for (const word of starterWords) {
                await pool.query(
                    `INSERT IGNORE INTO automod_filtered_words (
                guild_id,
                word,
                created_at
            )
            VALUES (?, ?, ?)`,
                    [guildId, word, Date.now()]
                );
            }

            const automodCache = require('../../utils/automod');
            automodCache.invalidateAutomodCache(guildId);

            const embed = new EmbedBuilder()
                .setColor('#57f287')
                .setAuthor({
                    name: 'Infinity Setup Wizard',
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setTitle('✅ Recommended AutoMod Protection Enabled')
                .setDescription(
                    'Infinity applied the recommended AutoMod setup for your server.\n\n' +
                    'This setup is designed for most public Discord communities.'
                )
                .addFields(
                    {
                        name: '🛡️ Enabled Protections',
                        value:
                            '```yaml\n' +
                            'Spam: Enabled\n' +
                            'Links: Enabled\n' +
                            'Invites: Enabled\n' +
                            'Caps: Enabled\n' +
                            'Word Filter: Enabled\n' +
                            '```',
                        inline: false
                    },
                    {
                        name: '⚖️ Punishment Rules',
                        value:
                            '```yaml\n' +
                            'Offense #1: Warn\n' +
                            'Offense #2: Warn\n' +
                            'Offense #3: Timeout 1 minute\n' +
                            'Offense #4: Timeout 5 minutes\n' +
                            'Offense #5: Kick\n' +
                            '```',
                        inline: false
                    },
                    {
                        name: '🚫 Starter Word Filter',
                        value:
                            '```yaml\n' +
                            'discord.gg\n' +
                            'free nitro\n' +
                            '@everyone\n' +
                            '@here\n' +
                            '```',
                        inline: false
                    }
                )
                .setFooter({ text: 'Infinity Bot • Recommended AutoMod Setup ⚡' })
                .setTimestamp();

            return safeReply(interaction, {
                embeds: [embed],
                components: [buildBackButton()]
            });
        }
        if (preset === 'aggressive') {
            await pool.query(
                `INSERT INTO automod_config (
            guild_id,
            spam_enabled,
            links_enabled,
            invites_enabled,
            caps_enabled,
            filter_enabled
        )
        VALUES (?, 1, 1, 1, 1, 1)
        ON DUPLICATE KEY UPDATE
            spam_enabled = 1,
            links_enabled = 1,
            invites_enabled = 1,
            caps_enabled = 1,
            filter_enabled = 1`,
                [guildId]
            );

            const types = ['spam', 'links', 'invites', 'caps', 'filter'];

            const rules = types.flatMap(type => [
                [type, 1, 'warn'],
                [type, 2, 'timeout:300000'],
                [type, 3, 'timeout:1800000'],
                [type, 4, 'kick'],
                [type, 5, 'kick']
            ]);

            for (const [type, offense, punishment] of rules) {
                await pool.query(
                    `INSERT INTO automod_punishments (
                guild_id,
                type,
                offense_number,
                punishment
            )
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                punishment = VALUES(punishment)`,
                    [guildId, type, offense, punishment]
                );
            }

            const starterWords = [
                'discord.gg',
                'free nitro',
                '@everyone',
                '@here'
            ];

            for (const word of starterWords) {
                await pool.query(
                    `INSERT IGNORE INTO automod_filtered_words (
                guild_id,
                word,
                created_at
            )
            VALUES (?, ?, ?)`,
                    [guildId, word, Date.now()]
                );
            }

            const automodCache = require('../../utils/automod');
            automodCache.invalidateAutomodCache(guildId);

            const embed = new EmbedBuilder()
                .setColor('#ff4d4d')
                .setAuthor({
                    name: 'Infinity Setup Wizard',
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setTitle('✅ Aggressive AutoMod Protection Enabled')
                .setDescription(
                    'Infinity applied a stricter AutoMod setup for your server.\n\n' +
                    'This preset is best for large public servers, raids, or high-risk communities.'
                )
                .addFields(
                    {
                        name: '🛡️ Enabled Protections',
                        value:
                            '```yaml\n' +
                            'Spam: Enabled\n' +
                            'Links: Enabled\n' +
                            'Invites: Enabled\n' +
                            'Caps: Enabled\n' +
                            'Word Filter: Enabled\n' +
                            '```',
                        inline: false
                    },
                    {
                        name: '⚖️ Punishment Rules',
                        value:
                            '```yaml\n' +
                            'Offense #1: Warn\n' +
                            'Offense #2: Timeout 5 minutes\n' +
                            'Offense #3: Timeout 30 minutes\n' +
                            'Offense #4: Kick\n' +
                            'Offense #5: Kick\n' +
                            '```',
                        inline: false
                    },
                    {
                        name: '🚫 Starter Word Filter',
                        value:
                            '```yaml\n' +
                            'discord.gg\n' +
                            'free nitro\n' +
                            '@everyone\n' +
                            '@here\n' +
                            '```',
                        inline: false
                    }
                )
                .setFooter({ text: 'Infinity Bot • Aggressive AutoMod Setup ⚡' })
                .setTimestamp();

            return safeReply(interaction, {
                embeds: [embed],
                components: [buildBackButton()]
            });
        }
    } catch (error) {
        console.error('AutoMod preset setup error:', error);

        return safeReply(interaction, {
            content: '❌ Failed to apply AutoMod preset.',
            components: [buildBackButton()]
        });
    }
}

async function handleSetupButton(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
            content: '❌ Only server administrators can use the setup wizard.',
            ephemeral: true
        }).catch(() => null);
    }

    if (interaction.customId === 'setup_back') {
        return interaction.update({
            embeds: [buildSetupMainEmbed(interaction)],
            components: buildSetupMainComponents()
        }).catch(() => null);
    }

    if (interaction.customId === 'setup_logging_confirm') {
        return handleAutoLoggingSetup(interaction);
    }

    if (interaction.customId === 'setup_tickets_auto') {
        return handleAutoTicketSetup(interaction);
    }

    if (interaction.customId === 'setup_automod_advanced') {
        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setAuthor({
                name: 'Infinity Setup Wizard',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('⚙️ AutoMod Advanced Configuration')
            .setDescription(
                'Use these commands to fine tune AutoMod manually.\n\n' +
                '```yaml\n' +
                '/automod: enable or disable protection types\n' +
                '/automod-rules: set punishments by offense number\n' +
                '/automod-filter: add, remove, or view blocked words\n' +
                '/automod-view: view your full AutoMod setup\n' +
                '/automod-whitelist: bypass users, roles, or channels\n' +
                '```\n\n' +
                'For most servers, **Recommended Protection** is the best starting point.'
            )
            .setFooter({ text: 'Infinity Bot • AutoMod Advanced Setup ⚡' })
            .setTimestamp();

        return interaction.update({
            embeds: [embed],
            components: [buildBackButton()]
        }).catch(() => null);
    }

    if (interaction.customId === 'setup_automod_basic') {
        return handleAutomodPreset(interaction, 'basic');
    }

    if (interaction.customId === 'setup_automod_recommended') {
        return handleAutomodPreset(interaction, 'recommended');
    }

    if (interaction.customId === 'setup_automod_aggressive') {
        return handleAutomodPreset(interaction, 'aggressive');
    }

    if (interaction.customId === 'setup_welcome_auto') {
        return handleAutoWelcomeSetup(interaction);
    }

    const type = interaction.customId.replace('setup_', '');

    if (type === 'tickets') {
        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setAuthor({
                name: 'Infinity Setup Wizard',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('🎫 Ticket Setup')
            .setDescription(
                'Tickets let members create private support channels.\n\n' +
                '**Recommended setup:**\n' +
                '```yaml\n' +
                '1. Create a ticket category\n' +
                '2. Choose a staff role\n' +
                '3. Choose a ticket panel channel\n' +
                '4. Run /ticketconfig\n' +
                '5. Run /ticketpanel\n' +
                '```\n\n' +
                'Click **Auto Setup** to let Infinity configure everything for you.'
            )
            .setFooter({ text: 'Infinity Bot • Ticket Setup ⚡' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_tickets_auto')
                .setLabel('Auto Setup')
                .setEmoji('⚡')
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId('setup_back')
                .setLabel('Back')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );

        return interaction.update({
            embeds: [embed],
            components: [row]
        }).catch(() => null);
    }

    if (type === 'diagnose') {
        const embed = await buildDiagnoseEmbed(interaction);

        return interaction.update({
            embeds: [embed],
            components: [buildBackButton()]
        }).catch(() => null);
    }

    if (type === 'logging') {
        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setAuthor({
                name: 'Infinity Setup Wizard',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('🛡️ Logging Setup')
            .setDescription(
                'Logging helps your staff track moderation actions, deleted messages, member updates, channel changes, role changes, and more.\n\n' +
                '**Recommended channels:**\n' +
                '```yaml\n' +
                '#message-logs\n' +
                '#member-logs\n' +
                '#moderation-logs\n' +
                '#role-logs\n' +
                '#channel-logs\n' +
                '#server-logs\n' +
                '```\n\n' +
                'Select the roles that should be able to view the logging channels.\n\n' +
                '⚠️ @everyone will NOT be able to see these channels.'
            )
            .setFooter({ text: 'Infinity Bot • Logging Setup ⚡' })
            .setTimestamp();

        const roleRow = new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId('setup_logging_roles')
                .setPlaceholder('Select roles that should see logging channels')
                .setMinValues(1)
                .setMaxValues(10)
        );

        const backRow = buildBackButton();

        return interaction.update({
            embeds: [embed],
            components: [roleRow, backRow]
        }).catch(() => null);
    }

    if (type === 'welcome') {
        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setAuthor({
                name: 'Infinity Setup Wizard',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('👋 Welcome Setup')
            .setDescription(
                'Welcome messages help new members feel comfortable when they join your server.\n\n' +
                '**Auto Setup will create or use:**\n' +
                '```yaml\n' +
                '#welcome\n' +
                '#rules\n' +
                '#general\n' +
                '```\n\n' +
                'Infinity will enable welcome messages and send a preview in the welcome channel.'
            )
            .setFooter({ text: 'Infinity Bot • Welcome Setup ⚡' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_welcome_auto')
                .setLabel('Auto Setup')
                .setEmoji('⚡')
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId('setup_back')
                .setLabel('Back')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );

        return interaction.update({
            embeds: [embed],
            components: [row]
        }).catch(() => null);
    }

    if (type === 'automod') {
        const [[config]] = await pool.query(
            `SELECT
            spam_enabled,
            links_enabled,
            invites_enabled,
            caps_enabled,
            filter_enabled
         FROM automod_config
         WHERE guild_id = ?`,
            [interaction.guild.id]
        );

        const [ruleRows] = await pool.query(
            `SELECT type, offense_number, punishment
         FROM automod_punishments
         WHERE guild_id = ?`,
            [interaction.guild.id]
        ).catch(() => [[]]);

        const automodConfig = config || {};

        const protections = [
            ['Spam', automodConfig.spam_enabled],
            ['Links', automodConfig.links_enabled],
            ['Invites', automodConfig.invites_enabled],
            ['Caps', automodConfig.caps_enabled],
            ['Word Filter', automodConfig.filter_enabled]
        ];

        const enabledCount = protections.filter(([, enabled]) => Number(enabled)).length;

        const protectionLevel =
            enabledCount === 5
                ? '🟢 Strong'
                : enabledCount >= 3
                    ? '🟡 Moderate'
                    : enabledCount >= 1
                        ? '🟠 Basic'
                        : '🔴 Not Configured';

        const enabledSystems = protections
            .map(([name, enabled]) => `${name}: ${Number(enabled) ? 'Enabled' : 'Disabled'}`)
            .join('\n');

        const totalRules = ruleRows.length;

        let currentPreset = '⚙️ Custom / Manual';

        const hasBasicShape =
            Number(automodConfig.spam_enabled) &&
            !Number(automodConfig.links_enabled) &&
            Number(automodConfig.invites_enabled) &&
            Number(automodConfig.caps_enabled) &&
            !Number(automodConfig.filter_enabled);

        const hasRecommendedShape =
            enabledCount === 5 &&
            ruleRows.some(rule => rule.punishment === 'timeout:60000') &&
            ruleRows.some(rule => rule.punishment === 'timeout:300000') &&
            !ruleRows.some(rule => rule.punishment === 'timeout:1800000');

        const hasAggressiveShape =
            enabledCount === 5 &&
            ruleRows.some(rule => rule.punishment === 'timeout:1800000');

        if (hasAggressiveShape) {
            currentPreset = '🔴 Aggressive Protection';
        } else if (hasRecommendedShape) {
            currentPreset = '🟡 Recommended Protection';
        } else if (hasBasicShape) {
            currentPreset = '🟢 Basic Protection';
        } else if (enabledCount === 0) {
            currentPreset = '❌ Not Configured';
        }

        const recommendation =
            enabledCount === 0
                ? 'Start with **Recommended Protection**. It is the best option for most servers.'
                : enabledCount < 3
                    ? 'Your server has light protection. **Recommended Protection** would be safer.'
                    : enabledCount < 5
                        ? 'Your setup is decent, but enabling all protections gives better coverage.'
                        : 'Your AutoMod setup looks strong. Use **Advanced Config** if you want to fine tune it.';

        const embed = new EmbedBuilder()
            .setColor(
                enabledCount === 5
                    ? '#57f287'
                    : enabledCount >= 3
                        ? '#ffaa00'
                        : '#ff4d4d'
            )
            .setAuthor({
                name: 'Infinity Setup Wizard',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('🤖 AutoMod Setup')
            .setDescription(
                'AutoMod protects your server from spam, invite advertising, unsafe links, caps abuse, and filtered words.'
            )
            .addFields(
                {
                    name: '🛡️ Current Protection',
                    value:
                        `**Protection Level:** ${protectionLevel}\n` +
                        `**Current Preset:** ${currentPreset}\n` +
                        `**Enabled Protections:** \`${enabledCount}/5\`\n` +
                        `**Rules Configured:** \`${totalRules}\``,
                    inline: false
                },
                {
                    name: '⚙️ Enabled Systems',
                    value:
                        '```yaml\n' +
                        enabledSystems +
                        '\n```',
                    inline: false
                },
                {
                    name: '⚡ Protection Presets',
                    value:
                        '🟢 **Basic** — Small/private servers\n' +
                        '🟡 **Recommended** — Best for most communities\n' +
                        '🔴 **Aggressive** — Large or high-risk servers\n' +
                        '⚙️ **Advanced Config** — Manual fine tuning',
                    inline: false
                },
                {
                    name: '💡 Recommendation',
                    value: recommendation,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Bot • AutoMod Setup ⚡' })
            .setTimestamp();

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_automod_basic')
                .setLabel('Basic')
                .setEmoji('🟢')
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId('setup_automod_recommended')
                .setLabel('Recommended')
                .setEmoji('🟡')
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId('setup_automod_aggressive')
                .setLabel('Aggressive')
                .setEmoji('🔴')
                .setStyle(ButtonStyle.Danger)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_automod_advanced')
                .setLabel('Advanced Config')
                .setEmoji('⚙️')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId('setup_back')
                .setLabel('Back')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );

        return interaction.update({
            embeds: [embed],
            components: [row1, row2]
        }).catch(() => null);
    }

    const pages = {
        full: {
            title: '🎯 Full Setup',
            description:
                'This is the recommended setup path for new servers.\n\n' +
                '```yaml\n' +
                '1. Configure logging\n' +
                '2. Configure tickets\n' +
                '3. Configure AutoMod\n' +
                '4. Configure welcome messages\n' +
                '5. Optional: applications, ranks, reaction roles\n' +
                '```\n\n' +
                'Start by creating your logging channels, then use `/logging setup` for each log category.'
        },
        tickets: {
            title: '🎫 Ticket Setup',
            description:
                'Tickets let members create private support channels.\n\n' +
                '**Recommended setup:**\n' +
                '```yaml\n' +
                '1. Create a ticket category\n' +
                '2. Choose a staff role\n' +
                '3. Choose a ticket panel channel\n' +
                '4. Run /ticketconfig\n' +
                '5. Run /ticketpanel\n' +
                '```'
        },
        automod: {
            title: '🤖 AutoMod Setup',
            description:
                'AutoMod helps protect your server from spam, links, caps abuse, and repeat rule breaking.\n\n' +
                '**Recommended settings:**\n' +
                '```yaml\n' +
                'Spam: Enabled\n' +
                'Links: Enabled\n' +
                'Caps: Enabled\n' +
                'Punishments: warn -> timeout -> kick\n' +
                '```'
        },
        welcome: {
            title: '👋 Welcome Setup',
            description:
                'Welcome messages help new members know where to go first.\n\n' +
                '**Recommended setup:**\n' +
                '```yaml\n' +
                'Welcome Channel: #welcome\n' +
                'Rules Channel: #rules\n' +
                'Chat Channel: #general\n' +
                'Auto Role: optional\n' +
                '```\n\n' +
                'Use `/setwelcomeconfig` to configure this.'
        }
    };

    const page = pages[type];

    if (!page) {
        return interaction.reply({
            content: '❌ Unknown setup option.',
            ephemeral: true
        }).catch(() => null);
    }

    const embed = new EmbedBuilder()
        .setColor('#00bfff')
        .setAuthor({
            name: 'Infinity Setup Wizard',
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTitle(page.title)
        .setDescription(page.description)
        .setFooter({ text: 'Infinity Bot • Setup Wizard ⚡' })
        .setTimestamp();

    return interaction.update({
        embeds: [embed],
        components: [buildBackButton()]
    }).catch(() => null);
}

module.exports = {
    buildSetupMainEmbed,
    buildSetupMainComponents,
    handleSetupButton,
    handleAutoLoggingSetup,
    handleAutoWelcomeSetup,
    handleAutomodPreset,
    handleLoggingRoleSelect
};