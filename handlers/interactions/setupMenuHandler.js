const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    ChannelType,
    RoleSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const { pool } = require('../../database');
const {
    getLogSettings,
    setLogChannel,
    setLoggingEnabled
} = require('../../utils/advancedLogger');

const { safeDeferUpdate, safeReply } = require('./safeReply');

const pendingLoggingSetups = new Map();
const pendingFullSetups = new Map();
const pendingApplicationPositions = new Map();

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
                    '5. Optional: applications\n' +
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
                    '👋 **Welcome** — configure welcome messages\n' +
                    '📝 **Applications** — configure staff applications',
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
            .setCustomId('setup_applications')
            .setLabel('Applications')
            .setEmoji('📝')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('setup_diagnose')
            .setLabel('Diagnose')
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Secondary)
    );

    return [row1, row2];
}

function buildSetupProgressEmbed(interaction, title, steps, activeIndex = 0) {
    return new EmbedBuilder()
        .setColor('#00bfff')
        .setAuthor({
            name: 'Infinity Setup Wizard',
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTitle(title)
        .setDescription(
            steps.map((step, index) => {
                if (index < activeIndex) return `✅ ${step}`;
                if (index === activeIndex) return `🔄 ${step}`;
                return `⏳ ${step}`;
            }).join('\n')
        )
        .setFooter({ text: 'Infinity Bot • Setting things up ⚡' })
        .setTimestamp();
}

async function updateSetupProgress(interaction, title, steps, activeIndex) {
    return safeReply(interaction, {
        embeds: [buildSetupProgressEmbed(interaction, title, steps, activeIndex)],
        components: []
    });
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

    const hasPerm = (permission) => me?.permissions.has(permission);

    const permissionChecks = [
        ['Manage Channels', hasPerm(PermissionFlagsBits.ManageChannels)],
        ['Manage Roles', hasPerm(PermissionFlagsBits.ManageRoles)],
        ['Manage Messages', hasPerm(PermissionFlagsBits.ManageMessages)],
        ['Embed Links', hasPerm(PermissionFlagsBits.EmbedLinks)]
    ];

    const permissionOk = permissionChecks.every(([, ok]) => ok);

    const logging = await getLogSettings(guild.id).catch(() => null);

    const loggingChannels = [
        logging?.message_logs,
        logging?.member_logs,
        logging?.moderation_logs,
        logging?.role_logs,
        logging?.channel_logs,
        logging?.server_logs
    ].filter(Boolean);

    const loggingOk = Boolean(Number(logging?.enabled) && loggingChannels.length);

    const [ticketRows] = await pool.query(
        `SELECT panel_channel_id, transcript_channel_id, support_role_id
         FROM ticket_settings
         WHERE guild_id = ?
         LIMIT 1`,
        [guild.id]
    ).catch(() => [[]]);

    const tickets = ticketRows[0];

    const ticketsOk = Boolean(
        tickets?.panel_channel_id &&
        tickets?.transcript_channel_id
    );

    const [appRows] = await pool.query(
        `SELECT panel_channel_id, review_channel_id
         FROM application_settings
         WHERE guild_id = ?
         LIMIT 1`,
        [guild.id]
    ).catch(() => [[]]);

    const apps = appRows[0];

    const [positionRows] = await pool.query(
        `SELECT id
         FROM application_positions
         WHERE guild_id = ? AND enabled = 1`,
        [guild.id]
    ).catch(() => [[]]);

    const applicationsOk = Boolean(
        apps?.panel_channel_id &&
        apps?.review_channel_id
    );

    const applicationPositionsOk = positionRows.length > 0;

    const [welcomeRows] = await pool.query(
        `SELECT welcome_enabled, welcome_channel, welcome_rules_channel, welcome_chat_channel
         FROM guild_settings
         WHERE guild_id = ?
         LIMIT 1`,
        [guild.id]
    ).catch(() => [[]]);

    const welcome = welcomeRows[0];

    const welcomeOk = Boolean(
        welcome?.welcome_enabled &&
        welcome?.welcome_channel &&
        welcome?.welcome_rules_channel &&
        welcome?.welcome_chat_channel
    );

    const checks = [
        {
            name: 'Bot Permissions',
            emoji: '🔐',
            ok: permissionOk,
            detail: permissionOk
                ? 'Infinity has the required setup permissions.'
                : permissionChecks
                    .filter(([, ok]) => !ok)
                    .map(([name]) => `Missing: ${name}`)
                    .join('\n')
        },
        {
            name: 'Logging',
            emoji: '🛡️',
            ok: loggingOk,
            detail: loggingOk
                ? `${loggingChannels.length}/6 logging channels configured.`
                : 'Logging is not fully configured.'
        },
        {
            name: 'Tickets',
            emoji: '🎫',
            ok: ticketsOk,
            detail: ticketsOk
                ? 'Panel and transcript channels are configured.'
                : 'Ticket panel or transcript channel is missing.'
        },
        {
            name: 'Applications',
            emoji: '📝',
            ok: applicationsOk && applicationPositionsOk,
            detail:
                applicationsOk && applicationPositionsOk
                    ? `Application channels are configured with ${positionRows.length} staff position(s).`
                    : applicationsOk
                        ? 'Application channels are configured, but no staff positions exist yet.'
                        : 'Application panel or review channel is missing.'
        },
        {
            name: 'Welcome System',
            emoji: '👋',
            ok: welcomeOk,
            detail: welcomeOk
                ? 'Welcome, rules, and general channels are linked.'
                : 'Welcome system is not fully configured.'
        }
    ];

    const passed = checks.filter(check => check.ok).length;
    const total = checks.length;
    const percent = Math.round((passed / total) * 100);

    const barFilled = Math.round(percent / 10);
    const progressBar =
        '█'.repeat(barFilled) +
        '░'.repeat(10 - barFilled);

    const nextFix = checks.find(check => !check.ok);

    const embed = new EmbedBuilder()
        .setColor(
            passed === total
                ? '#57f287'
                : passed >= 3
                    ? '#ffaa00'
                    : '#ff4d4d'
        )
        .setAuthor({
            name: 'Infinity Setup Wizard',
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTitle('🔍 Infinity Setup Diagnose')
        .setDescription(
            `**Setup Health:** \`${passed}/${total}\` checks passed\n` +
            `\`${progressBar}\` **${percent}% Complete**\n\n` +
            (
                passed === total
                    ? '✅ Infinity is ready to manage your community.'
                    : '⚠️ Some setup areas still need attention.'
            )
        )
        .addFields(
            {
                name: '📋 System Status',
                value: checks.map(check =>
                    `${check.ok ? '✅' : '❌'} **${check.emoji} ${check.name}**\n` +
                    `> ${check.detail}`
                ).join('\n\n'),
                inline: false
            },
            {
                name: '💡 Recommended Next Step',
                value: nextFix
                    ? `Fix **${nextFix.name}** next from the setup menu.`
                    : 'No action needed. Everything looks good.',
                inline: false
            }
        )
        .setFooter({ text: 'Infinity Bot • Setup Diagnose ⚡' })
        .setTimestamp();

    return embed;
}

function getSetupKey(interaction) {
    return `${interaction.guild.id}:${interaction.user.id}`;
}

async function handleLoggingRoleSelect(interaction) {
    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

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

    return safeReply(interaction, {
        embeds: [embed],
        components: [row]
    }).catch(() => null);
}

async function handleFullSetupRoleSelect(interaction) {
    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    const selectedRoleIds = interaction.values;
    const key = getSetupKey(interaction);

    pendingFullSetups.set(key, {
        roleIds: selectedRoleIds,
        createdAt: Date.now()
    });

    const embed = new EmbedBuilder()
        .setColor('#00bfff')
        .setAuthor({
            name: 'Infinity Setup Wizard',
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTitle('🎯 Confirm Full Setup')
        .setDescription(
            'Infinity will automatically configure the main systems for your server.\n\n' +
            '**This will setup:**\n' +
            '```yaml\n' +
            'Logging Channels\n' +
            'Ticket System\n' +
            'Welcome System\n' +
            'Recommended AutoMod\n' +
            '```\n\n' +
            '**Roles that can view logging channels:**\n' +
            selectedRoleIds.map(id => `• <@&${id}>`).join('\n') +
            '\n\n' +
            'Click **Start Full Setup** to continue.'
        )
        .setFooter({ text: 'Infinity Bot • Full Setup Confirmation ⚡' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('setup_full_confirm')
            .setLabel('Start Full Setup')
            .setEmoji('🚀')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId('setup_back')
            .setLabel('Cancel')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Secondary)
    );

    return safeReply(interaction, {
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

    const steps = [
        'Checking selected logging roles...',
        'Preparing private permissions...',
        'Creating logs category...',
        'Creating logging channels...',
        'Saving logging settings...',
        'Finalizing logging setup...'
    ];

    if (!pending?.roleIds?.length) {
        return safeReply(interaction, {
            content: '❌ No logging roles selected. Please go back and select roles first.',
            components: [buildBackButton()]
        });
    }

    const allowedRoleIds = pending.roleIds;
    pendingLoggingSetups.delete(key);

    await updateSetupProgress(interaction, '🛡️ Setting Up Logging', steps, 0);

    try {

        await updateSetupProgress(interaction, '🛡️ Setting Up Logging', steps, 1);

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

        await updateSetupProgress(interaction, '🛡️ Setting Up Logging', steps, 2);

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

        await updateSetupProgress(interaction, '🛡️ Setting Up Logging', steps, 3);

        const channels = {
            message: await createOrFindChannel('message-logs'),
            member: await createOrFindChannel('member-logs'),
            moderation: await createOrFindChannel('moderation-logs'),
            role: await createOrFindChannel('role-logs'),
            channel: await createOrFindChannel('channel-logs'),
            server: await createOrFindChannel('server-logs')
        };

        await updateSetupProgress(interaction, '🛡️ Setting Up Logging', steps, 4);

        await setLoggingEnabled(guild.id, true);

        await setLogChannel(guild.id, 'message', channels.message.id);
        await setLogChannel(guild.id, 'member', channels.member.id);
        await setLogChannel(guild.id, 'moderation', channels.moderation.id);
        await setLogChannel(guild.id, 'role', channels.role.id);
        await setLogChannel(guild.id, 'channel', channels.channel.id);
        await setLogChannel(guild.id, 'server', channels.server.id);

        await updateSetupProgress(interaction, '🛡️ Setting Up Logging', steps, 5);

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

    const steps = [
        'Checking support role...',
        'Creating ticket category...',
        'Creating ticket channels...',
        'Saving ticket settings...',
        'Sending ticket panel...',
        'Finalizing ticket setup...'
    ];

    try {
        await updateSetupProgress(interaction, '🎫 Setting Up Tickets', steps, 0);

        let staffRole =
            guild.roles.cache.find(r => r.name.toLowerCase().trim() === 'support');

        if (!staffRole) {
            staffRole = await guild.roles.create({
                name: 'Support',
                color: 0x00bfff,
                reason: 'Infinity setup wizard created staff role'
            });
        }

        await updateSetupProgress(interaction, '🎫 Setting Up Tickets', steps, 1);

        const createOrFindCategory = async (name) => {
            const existing = guild.channels.cache.find(channel =>
                channel.type === ChannelType.GuildCategory &&
                channel.name.toLowerCase() === name.toLowerCase()
            );

            if (existing) return existing;

            return guild.channels.create({
                name,
                type: ChannelType.GuildCategory,
                reason: 'Infinity setup wizard created ticket category'
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
                reason: 'Infinity setup wizard created ticket channel'
            });
        };

        const category = await createOrFindCategory('Tickets');

        await updateSetupProgress(interaction, '🎫 Setting Up Tickets', steps, 2);

        const panelChannel = await createOrFindChannel('create-a-ticket', category.id);
        const transcriptChannel = await createOrFindChannel('ticket-transcripts', category.id);

        await transcriptChannel.permissionOverwrites.set([
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: staffRole.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            },
            {
                id: interaction.client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            }
        ]).catch(() => null);

        await updateSetupProgress(interaction, '🎫 Setting Up Tickets', steps, 3);

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

        await updateSetupProgress(interaction, '🎫 Setting Up Tickets', steps, 4);

        const existingPanelMessages = await panelChannel.messages.fetch({ limit: 20 }).catch(() => null);

        const existingPanelMessage = existingPanelMessages?.find(message =>
            message.author.id === interaction.client.user.id &&
            message.components?.some(actionRow =>
                actionRow.components?.some(component =>
                    component.customId === 'ticket_create'
                )
            )
        );

        if (!existingPanelMessage) {
            await panelChannel.send({
                embeds: [embed],
                components: [row]
            });
        }

        await updateSetupProgress(interaction, '🎫 Setting Up Tickets', steps, 5);

        const successEmbed = new EmbedBuilder()
            .setColor('#57f287')
            .setAuthor({
                name: 'Infinity Setup Wizard',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('✅ Ticket Setup Complete')
            .setDescription(
                existingPanelMessage
                    ? 'Infinity reused your existing ticket panel and saved the setup.'
                    : 'Infinity created your ticket panel and saved the setup.'
            )
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
                    value: `${transcriptChannel}\n🔒 Visible to ${staffRole} only`,
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

    const steps = [
        'Creating information category...',
        'Creating community category...',
        'Creating welcome channel...',
        'Creating rules channel...',
        'Creating general channel...',
        'Saving welcome settings...',
        'Finalizing welcome setup...'
    ];

    try {
        await updateSetupProgress(interaction, '👋 Setting Up Welcome System', steps, 0);
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

        await updateSetupProgress(interaction, '👋 Setting Up Welcome System', steps, 0);

        const informationCategory = await createOrFindCategory('Information');

        await updateSetupProgress(interaction, '👋 Setting Up Welcome System', steps, 1);

        const communityCategory = await createOrFindCategory('Community');

        await updateSetupProgress(interaction, '👋 Setting Up Welcome System', steps, 2);

        const welcomeChannel = await createOrFindChannel('welcome', informationCategory.id);

        await updateSetupProgress(interaction, '👋 Setting Up Welcome System', steps, 3);

        const rulesChannel = await createOrFindChannel('rules', informationCategory.id);

        await updateSetupProgress(interaction, '👋 Setting Up Welcome System', steps, 4);

        const chatChannel = await createOrFindChannel('general', communityCategory.id);

        const welcomeTitle = '✨ Welcome to the Server';
        const welcomeMessage =
            'Welcome to **{server}**, {user}!\n\n' +
            'We’re happy to have you here. Make sure to read the rules, introduce yourself, and enjoy the community.';

        await updateSetupProgress(interaction, '👋 Setting Up Welcome System', steps, 5);

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

        await updateSetupProgress(interaction, '👋 Setting Up Welcome System', steps, 6);

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

async function handleAutoApplicationSetup(interaction) {
    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    const guild = interaction.guild;

    const steps = [
        'Creating staff applications category...',
        'Creating application panel channel...',
        'Creating application review channel...',
        'Saving application settings...',
        'Checking application panel...',
        'Finalizing application setup...'
    ];

    try {
        await updateSetupProgress(interaction, '📝 Setting Up Applications', steps, 0);

        const createOrFindCategory = async (name) => {
            const existing = guild.channels.cache.find(channel =>
                channel.type === ChannelType.GuildCategory &&
                channel.name.toLowerCase() === name.toLowerCase()
            );

            if (existing) return existing;

            return guild.channels.create({
                name,
                type: ChannelType.GuildCategory,
                reason: 'Infinity setup wizard application auto setup'
            });
        };

        const createOrFindChannel = async (name, parentId, overwrites = null) => {
            const existing = guild.channels.cache.find(channel =>
                channel.type === ChannelType.GuildText &&
                channel.name === name
            );

            if (existing) {
                if (existing.parentId !== parentId) {
                    await existing.setParent(parentId).catch(() => null);
                }

                if (overwrites) {
                    await existing.permissionOverwrites.set(overwrites).catch(() => null);
                }

                return existing;
            }

            return guild.channels.create({
                name,
                type: ChannelType.GuildText,
                parent: parentId,
                permissionOverwrites: overwrites || undefined,
                reason: 'Infinity setup wizard application auto setup'
            });
        };

        const category = await createOrFindCategory('Staff Applications');

        await updateSetupProgress(interaction, '📝 Setting Up Applications', steps, 1);

        const panelChannel = await createOrFindChannel('apply-here', category.id);

        await updateSetupProgress(interaction, '📝 Setting Up Applications', steps, 2);

        const reviewOverwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: interaction.client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            }
        ];

        const reviewChannel = await createOrFindChannel('application-review', category.id, reviewOverwrites);

        await updateSetupProgress(interaction, '📝 Setting Up Applications', steps, 3);

        await pool.query(
            `INSERT INTO application_settings
                (guild_id, panel_channel_id, review_channel_id, application_cooldown_hours, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                panel_channel_id = VALUES(panel_channel_id),
                review_channel_id = VALUES(review_channel_id),
                application_cooldown_hours = VALUES(application_cooldown_hours),
                updated_at = VALUES(updated_at)`,
            [
                guild.id,
                panelChannel.id,
                reviewChannel.id,
                24,
                Date.now()
            ]
        );

        await updateSetupProgress(interaction, '📝 Setting Up Applications', steps, 4);

        const existingPanelMessages = await panelChannel.messages.fetch({ limit: 20 }).catch(() => null);

        const existingPanelMessage = existingPanelMessages?.find(message =>
            message.author.id === interaction.client.user.id &&
            message.components?.some(actionRow =>
                actionRow.components?.some(component =>
                    component.customId === 'application_position_select'
                )
            )
        );

        await updateSetupProgress(interaction, '📝 Setting Up Applications', steps, 5);

        const [positionRows] = await pool.query(
            `SELECT id, name
     FROM application_positions
     WHERE guild_id = ? AND enabled = 1
     ORDER BY id ASC`,
            [guild.id]
        );

        const hasPositions = positionRows.length > 0;

        const applicationButtons = [
            new ButtonBuilder()
                .setCustomId('setup_applications_add_position')
                .setLabel(hasPositions ? 'Add More Positions' : 'Add Staff Position')
                .setEmoji('➕')
                .setStyle(ButtonStyle.Primary)
        ];

        if (hasPositions) {
            applicationButtons.push(
                new ButtonBuilder()
                    .setCustomId('setup_applications_finish')
                    .setLabel('Send Panel')
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success)
            );
        }

        applicationButtons.push(
            new ButtonBuilder()
                .setCustomId('setup_back')
                .setLabel('Back')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );

        const successEmbed = new EmbedBuilder()
            .setColor('#57f287')
            .setAuthor({
                name: 'Infinity Setup Wizard',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('✅ Application Setup Complete')
            .setDescription(
                existingPanelMessage
                    ? 'Infinity reused your existing application panel and saved the setup.'
                    : 'Infinity created or reused your application channels and saved the setup.'
            )
            .addFields(
                {
                    name: '📂 Category',
                    value: `${category}`,
                    inline: true
                },
                {
                    name: '📝 Apply Channel',
                    value: `${panelChannel}`,
                    inline: true
                },
                {
                    name: '📋 Review Channel',
                    value: `${reviewChannel}\n🔒 Visible to Admins only`,
                    inline: true
                },
                {
                    name: '✨ Next Step',
                    value: hasPositions
                        ? `You already have **${positionRows.length}** staff position(s).\nClick **Send Panel** to publish the application dropdown, or **Add More Positions** to add more.`
                        : 'Click **Add Staff Position** below to begin creating application roles and panel options.',
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Bot • Application Setup ⚡' })
            .setTimestamp();

        return safeReply(interaction, {
            embeds: [successEmbed],
            components: [
                new ActionRowBuilder().addComponents(applicationButtons)
            ]
        });

    } catch (error) {
        console.error('Auto application setup error:', error);

        return safeReply(interaction, {
            content: '❌ Failed to auto setup applications. Make sure I have **Manage Channels**, **Send Messages**, and **Embed Links**.',
            embeds: [],
            components: [buildBackButton()]
        });
    }
}

async function handleFullAutoSetup(interaction) {
    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    const guild = interaction.guild;
    const key = getSetupKey(interaction);
    const pending = pendingFullSetups.get(key);

    const steps = [
        'Checking selected logging roles...',
        'Creating logging system...',
        'Creating ticket system...',
        'Creating welcome system...',
        'Applying recommended AutoMod...',
        'Saving all settings...',
        'Finalizing full setup...'
    ];

    if (!pending?.roleIds?.length) {
        return safeReply(interaction, {
            content: '❌ No logging roles selected. Please go back and select roles first.',
            components: [buildBackButton()]
        });
    }

    pendingFullSetups.delete(key);

    const allowedRoleIds = pending.roleIds;

    await updateSetupProgress(interaction, '🎯 Running Full Setup', steps, 0);

    try {
        await updateSetupProgress(interaction, '🎯 Running Full Setup', steps, 1);

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

        const createOrFindCategory = async (name, overwrites = null) => {
            const existing = guild.channels.cache.find(channel =>
                channel.type === ChannelType.GuildCategory &&
                channel.name.toLowerCase() === name.toLowerCase()
            );

            if (existing) {
                if (overwrites) {
                    await existing.permissionOverwrites.set(overwrites).catch(() => null);
                }

                return existing;
            }

            return guild.channels.create({
                name,
                type: ChannelType.GuildCategory,
                permissionOverwrites: overwrites || undefined,
                reason: 'Infinity full setup auto setup'
            });
        };

        const createOrFindChannel = async (name, parentId, overwrites = null) => {
            const existing = guild.channels.cache.find(channel =>
                channel.type === ChannelType.GuildText &&
                channel.name === name
            );

            if (existing) {
                if (existing.parentId !== parentId) {
                    await existing.setParent(parentId).catch(() => null);
                }

                if (overwrites) {
                    await existing.permissionOverwrites.set(overwrites).catch(() => null);
                }

                return existing;
            }

            return guild.channels.create({
                name,
                type: ChannelType.GuildText,
                parent: parentId,
                permissionOverwrites: overwrites || undefined,
                reason: 'Infinity full setup auto setup'
            });
        };

        // Logging setup
        const logsCategory = await createOrFindCategory('Infinity Logs', permissionOverwrites);

        const messageLogs = await createOrFindChannel('message-logs', logsCategory.id, permissionOverwrites);
        const memberLogs = await createOrFindChannel('member-logs', logsCategory.id, permissionOverwrites);
        const moderationLogs = await createOrFindChannel('moderation-logs', logsCategory.id, permissionOverwrites);
        const roleLogs = await createOrFindChannel('role-logs', logsCategory.id, permissionOverwrites);
        const channelLogs = await createOrFindChannel('channel-logs', logsCategory.id, permissionOverwrites);
        const serverLogs = await createOrFindChannel('server-logs', logsCategory.id, permissionOverwrites);

        await setLoggingEnabled(guild.id, true);
        await setLogChannel(guild.id, 'message', messageLogs.id);
        await setLogChannel(guild.id, 'member', memberLogs.id);
        await setLogChannel(guild.id, 'moderation', moderationLogs.id);
        await setLogChannel(guild.id, 'role', roleLogs.id);
        await setLogChannel(guild.id, 'channel', channelLogs.id);
        await setLogChannel(guild.id, 'server', serverLogs.id);

        await updateSetupProgress(interaction, '🎯 Running Full Setup', steps, 2);

        // Ticket setup
        let supportRole = guild.roles.cache.find(role =>
            role.name.toLowerCase().trim() === 'support'
        );

        if (!supportRole) {
            supportRole = await guild.roles.create({
                name: 'Support',
                color: 0x00bfff,
                reason: 'Infinity full setup created support role'
            });
        }

        const ticketCategory = await createOrFindCategory('Tickets');
        const ticketPanel = await createOrFindChannel('create-a-ticket', ticketCategory.id);
        const ticketTranscripts = await createOrFindChannel('ticket-transcripts', ticketCategory.id);

        await ticketTranscripts.permissionOverwrites.set([
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: supportRole.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            },
            {
                id: interaction.client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            }
        ]).catch(() => null);

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
                ticketCategory.id,
                ticketPanel.id,
                ticketTranscripts.id,
                supportRole.id,
                Date.now()
            ]
        );

        const ticketEmbed = new EmbedBuilder()
            .setColor('#00bfff')
            .setAuthor({
                name: '🎫 Infinity Support Center',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setDescription('Click the button below to create a support ticket.');

        const ticketRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_create')
                .setLabel('Create Ticket')
                .setEmoji('🎫')
                .setStyle(ButtonStyle.Primary)
        );

        await ticketPanel.send({
            embeds: [ticketEmbed],
            components: [ticketRow]
        }).catch(() => null);

        await updateSetupProgress(interaction, '🎯 Running Full Setup', steps, 3);

        // Welcome setup
        const informationCategory = await createOrFindCategory('Information');
        const communityCategory = await createOrFindCategory('Community');

        const welcomeChannel = await createOrFindChannel('welcome', informationCategory.id);
        const rulesChannel = await createOrFindChannel('rules', informationCategory.id);
        const generalChannel = await createOrFindChannel('general', communityCategory.id);

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
                '✨ Welcome to the Server',
                'Welcome to **{server}**, {user}!\n\nWe’re happy to have you here. Make sure to read the rules, introduce yourself, and enjoy the community.',
                '#00bfff',
                rulesChannel.id,
                generalChannel.id
            ]
        );

        await updateSetupProgress(interaction, '🎯 Running Full Setup', steps, 4);

        // Recommended AutoMod setup
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
            [guild.id]
        );

        const automodRules = ['spam', 'links', 'invites', 'caps', 'filter'].flatMap(type => [
            [type, 1, 'warn'],
            [type, 2, 'warn'],
            [type, 3, 'timeout:60000'],
            [type, 4, 'timeout:300000'],
            [type, 5, 'kick']
        ]);

        for (const [type, offense, punishment] of automodRules) {
            await pool.query(
                `INSERT INTO automod_punishments (guild_id, type, offense_number, punishment)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE punishment = VALUES(punishment)`,
                [guild.id, type, offense, punishment]
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
                `INSERT IGNORE INTO automod_filtered_words (guild_id, word, created_at)
                VALUES (?, ?, ?)`,
                [guild.id, word, Date.now()]
            );
        }

        await updateSetupProgress(interaction, '🎯 Running Full Setup', steps, 5);

        const automodCache = require('../../utils/automod');
        automodCache.invalidateAutomodCache(guild.id);

        await updateSetupProgress(interaction, '🎯 Running Full Setup', steps, 6);

        const summaryEmbed = new EmbedBuilder()
            .setColor('#57f287')
            .setAuthor({
                name: 'Infinity Setup Wizard',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('✅ Full Setup Complete')
            .setDescription(
                'Infinity has successfully configured the main systems for your server.'
            )
            .addFields(
                {
                    name: '🛡️ Logging',
                    value:
                        `${messageLogs}\n${memberLogs}\n${moderationLogs}\n${roleLogs}\n${channelLogs}\n${serverLogs}`,
                    inline: false
                },
                {
                    name: '🎫 Tickets',
                    value:
                        `Panel: ${ticketPanel}\n` +
                        `Transcripts: ${ticketTranscripts}\n` +
                        `Support Role: ${supportRole}`,
                    inline: false
                },
                {
                    name: '👋 Welcome',
                    value:
                        `Welcome: ${welcomeChannel}\n` +
                        `Rules: ${rulesChannel}\n` +
                        `General: ${generalChannel}`,
                    inline: false
                },
                {
                    name: '🤖 AutoMod',
                    value:
                        '```yaml\n' +
                        'Preset: Recommended\n' +
                        'Spam: Enabled\n' +
                        'Links: Enabled\n' +
                        'Invites: Enabled\n' +
                        'Caps: Enabled\n' +
                        'Word Filter: Enabled\n' +
                        '```',
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Bot • Full Setup Complete ⚡' })
            .setTimestamp();

        return safeReply(interaction, {
            embeds: [summaryEmbed],
            components: [buildBackButton()]
        });

    } catch (error) {
        console.error('Full auto setup error:', error);

        return safeReply(interaction, {
            content: '❌ Full setup failed. Make sure Infinity has **Manage Channels**, **Manage Roles**, **Send Messages**, and **Embed Links**.',
            embeds: [],
            components: [buildBackButton()]
        });
    }
}

async function handleAutomodPreset(interaction, preset) {
    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    const guildId = interaction.guild.id;

    const presetName = preset.charAt(0).toUpperCase() + preset.slice(1);

    const steps = [
        `Applying ${presetName} protection preset...`,
        'Saving protection settings...',
        'Saving punishment rules...',
        'Refreshing AutoMod cache...',
        'Finalizing AutoMod setup...'
    ];

    await updateSetupProgress(interaction, '🤖 Setting Up AutoMod', steps, 0);

    try {
        if (preset === 'basic') {
            await updateSetupProgress(interaction, '🤖 Setting Up AutoMod', steps, 1);

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

            await updateSetupProgress(interaction, '🤖 Setting Up AutoMod', steps, 2);

            for (const [type, offense, punishment] of rules) {
                await pool.query(
                    `INSERT INTO automod_punishments (guild_id, type, offense_number, punishment)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE punishment = VALUES(punishment)`,
                    [guildId, type, offense, punishment]
                );
            }

            const automodCache = require('../../utils/automod');

            await updateSetupProgress(interaction, '🤖 Setting Up AutoMod', steps, 3);

            automodCache.invalidateAutomodCache(guildId);

            await updateSetupProgress(interaction, '🤖 Setting Up AutoMod', steps, 4);

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
            await updateSetupProgress(interaction, '🤖 Setting Up AutoMod', steps, 1);

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

            await updateSetupProgress(interaction, '🤖 Setting Up AutoMod', steps, 2);

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
            await updateSetupProgress(interaction, '🤖 Setting Up AutoMod', steps, 3);

            automodCache.invalidateAutomodCache(guildId);

            await updateSetupProgress(interaction, '🤖 Setting Up AutoMod', steps, 4);

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
            await updateSetupProgress(interaction, '🤖 Setting Up AutoMod', steps, 1);

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

            await updateSetupProgress(interaction, '🤖 Setting Up AutoMod', steps, 2);

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

            await updateSetupProgress(interaction, '🤖 Setting Up AutoMod', steps, 3);

            automodCache.invalidateAutomodCache(guildId);

            await updateSetupProgress(interaction, '🤖 Setting Up AutoMod', steps, 4);

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

async function getApplicationSetupSettings(guildId) {
    const [rows] = await pool.query(
        `SELECT panel_channel_id, review_channel_id
         FROM application_settings
         WHERE guild_id = ?
         LIMIT 1`,
        [guildId]
    );

    return rows[0] || null;
}

async function requireApplicationSetupFirst(interaction) {
    const settings = await getApplicationSetupSettings(interaction.guild.id);

    if (settings?.panel_channel_id && settings?.review_channel_id) {
        return true;
    }

    return safeReply(interaction, {
        content:
            '❌ Please run **Applications Auto Setup** first.\n\n' +
            'Infinity needs to create or save these first:\n' +
            '```yaml\n' +
            'Category: Staff Applications\n' +
            'Panel Channel: #apply-here\n' +
            'Review Channel: #application-review\n' +
            '```\n\n' +
            'After that, you can add staff positions.',
        components: [buildBackButton()]
    });
}

async function handleApplicationAddPositionButton(interaction) {
    const setupReady = await requireApplicationSetupFirst(interaction);
    if (setupReady !== true) return;

    const modal = new ModalBuilder()
        .setCustomId('setup_application_position_modal')
        .setTitle('Add Staff Position');

    const nameInput = new TextInputBuilder()
        .setCustomId('position_name')
        .setLabel('Staff position name')
        .setPlaceholder('Example: Moderator, Helper, Support Team')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

    modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput)
    );

    return interaction.showModal(modal).catch(() => null);
}

async function handleApplicationPositionModal(interaction) {
    const positionName = interaction.fields.getTextInputValue('position_name');
    const key = getSetupKey(interaction);

    pendingApplicationPositions.set(key, {
        name: positionName,
        createdAt: Date.now()
    });

    const embed = new EmbedBuilder()
        .setColor('#00bfff')
        .setAuthor({
            name: 'Infinity Setup Wizard',
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTitle('🏷️ Select Position Role')
        .setDescription(
            `Now select the Discord role for **${positionName}**.\n\n` +
            'This is the role that can be linked to this application position.'
        )
        .setFooter({ text: 'Infinity Bot • Application Setup ⚡' })
        .setTimestamp();

    const roleRow = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId('setup_application_position_role')
            .setPlaceholder(`Select role for ${positionName}`)
            .setMinValues(1)
            .setMaxValues(1)
    );

    return safeReply(interaction, {
        embeds: [embed],
        components: [roleRow]
    }, true).catch(() => null);
}

async function handleApplicationPositionRoleSelect(interaction) {
    const key = getSetupKey(interaction);
    const pending = pendingApplicationPositions.get(key);

    if (!pending?.name) {
        return safeReply(interaction, {
            content: '❌ No pending application position found. Please click **Add Staff Position** again.'
        }, true);
    }

    const roleId = interaction.values[0];

    pendingApplicationPositions.delete(key);

    const [result] = await pool.query(
        `INSERT INTO application_positions
            (guild_id, name, role_id, enabled, created_at)
         VALUES (?, ?, ?, 1, ?)`,
        [
            interaction.guild.id,
            pending.name,
            roleId,
            Date.now()
        ]
    );

    const embed = new EmbedBuilder()
        .setColor('#57f287')
        .setAuthor({
            name: '✅ Application Position Added',
            iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
        })
        .setDescription(
            `Added a new application position.\n\n` +
            `**Position:** ${pending.name}\n` +
            `**Role:** <@&${roleId}>\n` +
            `**Position ID:** \`${result.insertId}\``
        )
        .setFooter({ text: 'Infinity Applications' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('setup_applications_add_position')
            .setLabel('Add Another Position')
            .setEmoji('➕')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('setup_applications_finish')
            .setLabel('Finish & Send Panel')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
    );

    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    return safeReply(interaction, {
        embeds: [embed],
        components: [row]
    }).catch(() => null);
}

async function handleSendApplicationPanelFromSetup(interaction) {
    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    try {
        const [settingsRows] = await pool.query(
            `SELECT panel_channel_id, review_channel_id
             FROM application_settings
             WHERE guild_id = ?
             LIMIT 1`,
            [interaction.guild.id]
        );

        const settings = settingsRows[0];

        if (!settings?.panel_channel_id || !settings?.review_channel_id) {
            return safeReply(interaction, {
                content: '❌ Applications are not configured yet. Run Applications Auto Setup first.',
                embeds: [],
                components: [buildBackButton()]
            });
        }

        const [positions] = await pool.query(
            `SELECT id, name
             FROM application_positions
             WHERE guild_id = ? AND enabled = 1
             ORDER BY id ASC`,
            [interaction.guild.id]
        );

        if (!positions.length) {
            return safeReply(interaction, {
                content: '❌ No enabled application positions found. Add at least one staff position first.',
                embeds: [],
                components: [buildBackButton()]
            });
        }

        const panelChannel =
            interaction.guild.channels.cache.get(settings.panel_channel_id) ||
            await interaction.guild.channels.fetch(settings.panel_channel_id).catch(() => null);

        if (!panelChannel) {
            return safeReply(interaction, {
                content: '❌ The application panel channel could not be found.',
                embeds: [],
                components: [buildBackButton()]
            });
        }

        const existingPanelMessages = await panelChannel.messages.fetch({ limit: 20 }).catch(() => null);

        const existingPanelMessage = existingPanelMessages?.find(message =>
            message.author.id === interaction.client.user.id &&
            message.components?.some(actionRow =>
                actionRow.components?.some(component =>
                    component.customId === 'application_position_select'
                )
            )
        );

        if (existingPanelMessage) {
            return safeReply(interaction, {
                content: `✅ Application panel already exists in ${panelChannel}.`,
                embeds: [],
                components: [buildBackButton()]
            });
        }

        const { StringSelectMenuBuilder } = require('discord.js');

        const embed = new EmbedBuilder()
            .setAuthor({
                name: '📝 Infinity Applications',
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
            })
            .setColor('#00bfff')
            .setDescription(
                'Want to apply for a role?\n\n' +
                'Choose a position from the dropdown below and submit your application.\n' +
                'Make sure your answers are honest, detailed, and thoughtful.\n\n' +
                'A staff member will review it as soon as possible.'
            )
            .setFooter({ text: 'Infinity Applications' })
            .setTimestamp();

        const select = new StringSelectMenuBuilder()
            .setCustomId('application_position_select')
            .setPlaceholder('Select a position to apply for')
            .addOptions(
                positions.slice(0, 25).map(position => ({
                    label: position.name.slice(0, 100),
                    value: String(position.id),
                    description: `Apply for ${position.name}`.slice(0, 100),
                    emoji: '📝'
                }))
            );

        const row = new ActionRowBuilder().addComponents(select);

        await panelChannel.send({
            embeds: [embed],
            components: [row]
        });

        return safeReply(interaction, {
            content: `✅ Application panel sent to ${panelChannel}.`,
            embeds: [],
            components: [buildBackButton()]
        });

    } catch (error) {
        console.error('Send application panel from setup error:', error);

        return safeReply(interaction, {
            content: '❌ Failed to send the application panel. Make sure Infinity has **View Channel**, **Send Messages**, **Embed Links**, and **Read Message History** in the apply channel.',
            embeds: [],
            components: [buildBackButton()]
        });
    }
}

async function handleSetupButton(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return safeReply(interaction, {
            content: '❌ Only server administrators can use the setup wizard.'
        }, true).catch(() => null);
    }

    if (interaction.customId === 'setup_applications_add_position') {
        return handleApplicationAddPositionButton(interaction);
    }

    if (interaction.customId === 'setup_logging_confirm') {
        return handleAutoLoggingSetup(interaction);
    }

    if (interaction.customId === 'setup_full_confirm') {
        return handleFullAutoSetup(interaction);
    }

    if (interaction.customId === 'setup_tickets_auto') {
        return handleAutoTicketSetup(interaction);
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

    if (interaction.customId === 'setup_applications_auto') {
        return handleAutoApplicationSetup(interaction);
    }

    if (interaction.customId === 'setup_applications_finish') {
        return handleSendApplicationPanelFromSetup(interaction);
    }

    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    if (interaction.customId === 'setup_back') {
        return safeReply(interaction, {
            embeds: [buildSetupMainEmbed(interaction)],
            components: buildSetupMainComponents()
        });
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

        return safeReply(interaction, {
            embeds: [embed],
            components: [buildBackButton()]
        });
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
                'Infinity will automatically create or reuse your ticket system.\n\n' +
                '**Auto Setup will configure:**\n' +
                '```yaml\n' +
                'Category: Tickets\n' +
                'Channels:\n' +
                '  - create-a-ticket\n' +
                '  - ticket-transcripts\n' +
                'Role:\n' +
                '  - Support\n' +
                '```\n\n' +
                '**Permissions:**\n' +
                '```yaml\n' +
                '@everyone: Can create tickets\n' +
                'Support: Can manage tickets\n' +
                'ticket-transcripts: Hidden from everyone\n' +
                '```\n\n' +
                'Infinity will also send or reuse the ticket panel automatically.'
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

        return safeReply(interaction, {
            embeds: [embed],
            components: [row]
        });
    }

    if (type === 'diagnose') {
        const embed = await buildDiagnoseEmbed(interaction);

        return safeReply(interaction, {
            embeds: [embed],
            components: [buildBackButton()]
        });
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
                'Infinity will automatically create or reuse your logging category and log channels.\n\n' +
                '**Auto Setup will configure:**\n' +
                '```yaml\n' +
                'Category: Infinity Logs\n' +
                'Channels:\n' +
                '  - message-logs\n' +
                '  - member-logs\n' +
                '  - moderation-logs\n' +
                '  - role-logs\n' +
                '  - channel-logs\n' +
                '  - server-logs\n' +
                '```\n\n' +
                '**Permissions:**\n' +
                '```yaml\n' +
                '@everyone: Hidden\n' +
                'Selected roles: Can view logs\n' +
                'Infinity: Can send log messages\n' +
                '```\n\n' +
                'Select the staff roles that should be able to view private logging channels.'
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

        return safeReply(interaction, {
            embeds: [embed],
            components: [roleRow, backRow]
        });
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
                'Infinity will automatically create or reuse your welcome system channels.\n\n' +
                '**Auto Setup will configure:**\n' +
                '```yaml\n' +
                'Categories:\n' +
                '  - Information\n' +
                '  - Community\n' +
                '\n' +
                'Channels:\n' +
                '  - welcome\n' +
                '  - rules\n' +
                '  - general\n' +
                '```\n\n' +
                '**Welcome System:**\n' +
                '```yaml\n' +
                'Welcome Messages: Enabled\n' +
                'Rules Channel: Linked\n' +
                'General Chat: Linked\n' +
                'Welcome Preview: Sent Automatically\n' +
                '```\n\n' +
                'Infinity will automatically configure and preview the welcome system.'
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

        return safeReply(interaction, {
            embeds: [embed],
            components: [row]
        });
    }

    if (type === 'applications') {
        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setAuthor({
                name: 'Infinity Setup Wizard',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('📝 Application Setup')
            .setDescription(
                'Applications let members apply for staff or custom server roles.\n\n' +
                '**Setup order:**\n' +
                '```yaml\n' +
                '1. Auto Setup Channels\n' +
                '2. Add Staff Positions\n' +
                '3. Finish & Send Panel\n' +
                '```\n\n' +
                '**Auto Setup will create or reuse:**\n' +
                '```yaml\n' +
                'Category: Staff Applications\n' +
                'Panel Channel: #apply-here\n' +
                'Review Channel: #application-review\n' +
                '```\n\n' +
                'You must run **Auto Setup Channels** before adding staff positions.'
            )
            .setFooter({ text: 'Infinity Bot • Application Setup ⚡' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_applications_auto')
                .setLabel('1. Auto Setup Channels')
                .setEmoji('⚡')
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId('setup_applications_add_position')
                .setLabel('2. Add Staff Position')
                .setEmoji('➕')
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId('setup_back')
                .setLabel('Back')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );

        return safeReply(interaction, {
            embeds: [embed],
            components: [row]
        });
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

        return safeReply(interaction, {
            embeds: [embed],
            components: [row1, row2]
        });
    }

    if (type === 'full') {
        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setAuthor({
                name: 'Infinity Setup Wizard',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('🎯 Full Setup')
            .setDescription(
                'Full Setup will automatically configure the main systems for your server.\n\n' +
                '**Infinity will setup:**\n' +
                '```yaml\n' +
                'Logging Channels\n' +
                'Ticket System\n' +
                'Welcome System\n' +
                'Recommended AutoMod\n' +
                '```\n\n' +
                'Select the staff roles that should be able to view private logging channels.'
            )
            .setFooter({ text: 'Infinity Bot • Full Setup ⚡' })
            .setTimestamp();

        const roleRow = new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId('setup_full_roles')
                .setPlaceholder('Select roles that should see logging channels')
                .setMinValues(1)
                .setMaxValues(10)
        );

        return safeReply(interaction, {
            embeds: [embed],
            components: [roleRow, buildBackButton()]
        });
    }

    const pages = {
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
        return safeReply(interaction, {
            content: '❌ Unknown setup option.'
        }, true);
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

    return safeReply(interaction, {
        embeds: [embed],
        components: [buildBackButton()]
    });
}

module.exports = {
    buildSetupMainEmbed,
    buildSetupMainComponents,
    handleSetupButton,
    handleAutoLoggingSetup,
    handleAutoWelcomeSetup,
    handleAutoApplicationSetup,
    handleApplicationAddPositionButton,
    handleApplicationPositionModal,
    handleApplicationPositionRoleSelect,
    handleSendApplicationPanelFromSetup,
    handleAutomodPreset,
    handleLoggingRoleSelect,
    handleFullSetupRoleSelect,
    handleFullAutoSetup,
};