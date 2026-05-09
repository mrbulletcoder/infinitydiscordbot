const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');

const {
    getRankSettings,
    getWhitelistChannels,
    getBlacklistChannels,
    addWhitelistChannel,
    removeWhitelistChannel,
    addBlacklistChannel,
    removeBlacklistChannel,
    setRankMode,
    setRankXpConfig,
    setRankEnabled
} = require('../../utils/rank');

const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

module.exports = {
    name: 'ranks',
    description: 'Manage the rank system.',
    usage: '/ranks config | mode | whitelistadd | whitelistremove | blacklistadd | blacklistremove | xpsettings',
    userPermissions: PermissionFlagsBits.ManageGuild,
    botPermissions: [
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('ranks')
        .setDescription('Manage the rank system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

        .addSubcommand(sub =>
            sub
                .setName('config')
                .setDescription('View current rank settings')
        )

        .addSubcommand(sub =>
            sub
                .setName('enable')
                .setDescription('Enable the rank XP system')
        )

        .addSubcommand(sub =>
            sub
                .setName('disable')
                .setDescription('Disable the rank XP system')
        )

        .addSubcommand(sub =>
            sub
                .setName('mode')
                .setDescription('Set rank channel mode')
                .addStringOption(option =>
                    option
                        .setName('mode')
                        .setDescription('Rank channel mode')
                        .addChoices(
                            { name: 'All Whitelisted', value: 'all_whitelisted' },
                            { name: 'Whitelist Only', value: 'whitelist_only' }
                        )
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName('whitelistadd')
                .setDescription('Add a channel to the XP whitelist')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to whitelist')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName('whitelistremove')
                .setDescription('Remove a channel from the XP whitelist')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to remove from whitelist')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName('blacklistadd')
                .setDescription('Add a channel to the XP blacklist')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to blacklist')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName('blacklistremove')
                .setDescription('Remove a channel from the XP blacklist')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to remove from blacklist')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName('xpsettings')
                .setDescription('Set XP range and cooldown')
                .addIntegerOption(option =>
                    option
                        .setName('xp_min')
                        .setDescription('Minimum XP per message')
                        .setMinValue(1)
                        .setMaxValue(100)
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('xp_max')
                        .setDescription('Maximum XP per message')
                        .setMinValue(1)
                        .setMaxValue(250)
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('cooldown')
                        .setDescription('XP cooldown in seconds')
                        .setMinValue(5)
                        .setMaxValue(600)
                        .setRequired(true)
                )
        ),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        try {
            const sub = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            if (sub === 'enable' || sub === 'disable') {
                const enabled = sub === 'enable';

                await setRankEnabled(guildId, enabled);

                return safeReply(interaction, {
                    content: enabled
                        ? '✅ Rank XP system has been **enabled**.'
                        : '✅ Rank XP system has been **disabled**.'
                }, true);
            }

            if (sub === 'config') {
                const settings = await getRankSettings(guildId);
                const whitelist = await getWhitelistChannels(guildId);
                const blacklist = await getBlacklistChannels(guildId);

                const embed = new EmbedBuilder()
                    .setTitle('🏆 Infinity Rank Settings')
                    .setColor('#00bfff')
                    .addFields(
                        {
                            name: 'Status',
                            value: Number(settings.enabled) ? '✅ Enabled' : '❌ Disabled',
                            inline: true
                        },
                        {
                            name: 'Mode',
                            value: settings.mode === 'all_whitelisted' ? 'All Whitelisted' : 'Whitelist Only',
                            inline: true
                        },
                        {
                            name: 'XP Range',
                            value: `${settings.xp_min} - ${settings.xp_max}`,
                            inline: true
                        },
                        {
                            name: 'Cooldown',
                            value: `${settings.xp_cooldown_seconds}s`,
                            inline: true
                        },
                        {
                            name: 'Whitelist Channels',
                            value: whitelist.length ? whitelist.map(id => `<#${id}>`).join(', ') : 'None set'
                        },
                        {
                            name: 'Blacklist Channels',
                            value: blacklist.length ? blacklist.map(id => `<#${id}>`).join(', ') : 'None set'
                        }
                    )
                    .setFooter({ text: 'Use /ranks enable to turn XP tracking on' })
                    .setTimestamp();

                return safeReply(interaction, { embeds: [embed] }, true);
            }

            if (sub === 'mode') {
                const mode = interaction.options.getString('mode', true);
                await setRankMode(guildId, mode);

                return safeReply(interaction, {
                    content: `✅ Rank mode set to **${mode === 'all_whitelisted' ? 'All Whitelisted' : 'Whitelist Only'}**.`
                }, true);
            }

            if (sub === 'whitelistadd') {
                const channel = interaction.options.getChannel('channel', true);
                await addWhitelistChannel(guildId, channel.id);

                return safeReply(interaction, {
                    content: `✅ Added ${channel} to the XP whitelist.`
                }, true);
            }

            if (sub === 'whitelistremove') {
                const channel = interaction.options.getChannel('channel', true);
                await removeWhitelistChannel(guildId, channel.id);

                return safeReply(interaction, {
                    content: `✅ Removed ${channel} from the XP whitelist.`
                }, true);
            }

            if (sub === 'blacklistadd') {
                const channel = interaction.options.getChannel('channel', true);
                await addBlacklistChannel(guildId, channel.id);

                return safeReply(interaction, {
                    content: `✅ Added ${channel} to the XP blacklist.`
                }, true);
            }

            if (sub === 'blacklistremove') {
                const channel = interaction.options.getChannel('channel', true);
                await removeBlacklistChannel(guildId, channel.id);

                return safeReply(interaction, {
                    content: `✅ Removed ${channel} from the XP blacklist.`
                }, true);
            }

            if (sub === 'xpsettings') {
                const xpMin = interaction.options.getInteger('xp_min', true);
                const xpMax = interaction.options.getInteger('xp_max', true);
                const cooldown = interaction.options.getInteger('cooldown', true);

                if (xpMin > xpMax) {
                    return safeReply(interaction, {
                        content: '❌ `xp_min` cannot be greater than `xp_max`.'
                    }, true);
                }

                await setRankXpConfig(guildId, xpMin, xpMax, cooldown);

                return safeReply(interaction, {
                    content: `✅ XP settings updated to **${xpMin}-${xpMax} XP** with a **${cooldown}s** cooldown.`
                }, true);
            }

            return safeReply(interaction, {
                content: '❌ Unknown subcommand.'
            }, true);
        } catch (error) {
            console.error('Ranks command error:', error);

            return safeReply(interaction, {
                content: '❌ Something went wrong while running that command.'
            }, true);
        }
    }
};