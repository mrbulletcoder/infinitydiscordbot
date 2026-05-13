const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');

const { pool } = require('../database');

const { notifySetupIssue } = require('../utils/setupNotifier');

const defaultWelcome = {
    channel: null,
    title: '✨ A New Legend Has Arrived',
    message: 'Welcome to **{server}**, {user}!\nYou just joined a community full of energy, good vibes, and unforgettable moments.\n\nJump in, meet everyone, and make yourself at home — your adventure starts now.',
    color: '#00bfff',
    rulesChannel: null,
    chatChannel: null,
    autoRole: null
};

module.exports = {
    name: 'guildMemberAdd',

    async execute(member) {
        try {
            const [rows] = await pool.query(
                `SELECT
                    welcome_enabled,
                    welcome_channel,
                    welcome_message,
                    welcome_title,
                    welcome_color,
                    welcome_rules_channel,
                    welcome_chat_channel,
                    welcome_auto_role
                 FROM guild_settings
                 WHERE guild_id = ?`,
                [member.guild.id]
            );

            const row = rows[0] || {};

            const settings = {
                ...defaultWelcome,
                channel: row.welcome_channel ?? defaultWelcome.channel,
                title: row.welcome_title ?? defaultWelcome.title,
                message: row.welcome_message ?? defaultWelcome.message,
                color: row.welcome_color ?? defaultWelcome.color,
                rulesChannel: row.welcome_rules_channel ?? defaultWelcome.rulesChannel,
                chatChannel: row.welcome_chat_channel ?? defaultWelcome.chatChannel,
                autoRole: row.welcome_auto_role ?? defaultWelcome.autoRole,
                enabled: row.welcome_enabled ?? 0
            };

            if (!settings.enabled || !settings.channel) return;

            const channel = member.guild.channels.cache.get(settings.channel)
                || await member.guild.channels.fetch(settings.channel).catch(() => null);

            if (!channel) {
                await notifySetupIssue(member.guild, {
                    system: 'Welcome System',
                    issueCode: 'missing_welcome_channel',
                    title: 'Welcome Channel Missing',
                    description:
                        'Infinity tried to send a welcome message, but the configured welcome channel no longer exists.',
                    fix:
                        'Run `/setwelcomeconfig` again and choose a valid welcome channel.',
                    severity: 'warning'
                });

                return;
            }

            const me = member.guild.members.me ||
                await member.guild.members.fetchMe().catch(() => null);

            const channelPerms = channel.permissionsFor(me);

            if (!channelPerms?.has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks
            ])) {
                console.warn(`Cannot send welcome message in ${member.guild.name} #${channel.name}: Missing permissions.`);

                await notifySetupIssue(member.guild, {
                    system: 'Welcome System',
                    issueCode: 'welcome_channel_permissions',
                    title: 'Welcome Channel Permissions Missing',
                    description:
                        `Infinity cannot send welcome messages in ${channel}.`,
                    fix:
                        'Give Infinity these permissions in the welcome channel:\n' +
                        '• View Channel\n' +
                        '• Send Messages\n' +
                        '• Embed Links',
                    severity: 'danger'
                });

                return;
            }

            if (settings.autoRole) {
                const role =
                    member.guild.roles.cache.get(settings.autoRole) ||
                    await member.guild.roles.fetch(settings.autoRole).catch(() => null);

                const me = member.guild.members.me ||
                    await member.guild.members.fetchMe().catch(() => null);

                if (!role) {
                    console.warn(`Welcome auto-role no longer exists in ${member.guild.name}: ${settings.autoRole}`);

                    await notifySetupIssue(member.guild, {
                        system: 'Welcome System',
                        issueCode: 'missing_welcome_auto_role',
                        title: 'Welcome Auto-Role Missing',
                        description:
                            'Infinity could not assign the configured welcome role because that role no longer exists.',
                        fix:
                            'Run `/setwelcomeconfig` again and choose a valid auto-role, or remove the auto-role setting.',
                        severity: 'warning'
                    });

                } else if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    console.warn(`Cannot assign welcome role in ${member.guild.name}: Missing Manage Roles permission.`);

                    await notifySetupIssue(member.guild, {
                        system: 'Welcome System',
                        issueCode: 'missing_manage_roles',
                        title: 'Missing Manage Roles Permission',
                        description:
                            `Infinity cannot assign the welcome role ${role} because it does not have **Manage Roles** permission.`,
                        fix:
                            'Give Infinity the Manage Roles permission in Server Settings → Roles.',
                        severity: 'danger'
                    });

                } else if (me.roles.highest.position <= role.position) {
                    console.warn(`Cannot assign welcome role "${role.name}" in ${member.guild.name}: Bot role is too low.`);

                    await notifySetupIssue(member.guild, {
                        system: 'Welcome System',
                        issueCode: 'bot_role_too_low',
                        title: 'Bot Role Is Too Low',
                        description:
                            `Infinity cannot assign ${role} because the Infinity role is below that role.`,
                        fix:
                            'Move the Infinity bot role above the welcome auto-role in Server Settings → Roles.',
                        severity: 'danger'
                    });

                } else {
                    await member.roles.add(role).catch(err => {
                        console.warn(`Role assign error in ${member.guild.name}: ${err.message}`);
                    });
                }
            }

            const message = settings.message
                .replaceAll('{user}', `${member}`)
                .replaceAll('{server}', member.guild.name);

            const embed = new EmbedBuilder()
                .setColor(settings.color)
                .setAuthor({
                    name: `${member.guild.name} • Welcome System`,
                    iconURL: member.guild.iconURL({ dynamic: true }) || undefined
                })
                .setTitle(settings.title)
                .setDescription(
                    `## ${message}\n\n` +
                    `> We’re excited to have you here. Take a look around, meet the community, and enjoy your stay.\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `👤 **Member:** ${member.user.tag}\n` +
                    `🆔 **User ID:** \`${member.user.id}\`\n` +
                    `📊 **Member Count:** **${member.guild.memberCount}**\n` +
                    `🕒 **Joined:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━`
                )
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .setImage(member.guild.bannerURL({ size: 1024 }) || null)
                .setFooter({
                    text: `Welcome to ${member.guild.name}`,
                    iconURL: member.guild.iconURL({ dynamic: true }) || undefined
                })
                .setTimestamp();

            const buttons = [];

            if (settings.rulesChannel) {
                buttons.push(
                    new ButtonBuilder()
                        .setLabel('📜 Rules')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/channels/${member.guild.id}/${settings.rulesChannel}`)
                );
            }

            if (settings.chatChannel) {
                buttons.push(
                    new ButtonBuilder()
                        .setLabel('💬 Chat')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/channels/${member.guild.id}/${settings.chatChannel}`)
                );
            }

            const rowComponent = buttons.length
                ? new ActionRowBuilder().addComponents(buttons)
                : null;

            await channel.send({
                content: `🎉 Welcome ${member}!`,
                embeds: [embed],
                components: rowComponent ? [rowComponent] : []
            });
        } catch (error) {
            console.error('guildMemberAdd error:', error);
        }
    }
};