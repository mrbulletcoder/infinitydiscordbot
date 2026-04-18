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
    setRankXpConfig
} = require('../../utils/rank');

module.exports = {
    name: 'ranks',
    description: 'Manage the rank system.',
    usage: '/ranks config | mode | whitelistadd | whitelistremove | blacklistadd | blacklistremove | xpsettings',
    userPermissions: PermissionFlagsBits.ManageGuild,

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
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const sub = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            if (sub === 'config') {
                const settings = await getRankSettings(guildId);
                const whitelist = await getWhitelistChannels(guildId);
                const blacklist = await getBlacklistChannels(guildId);

                const embed = new EmbedBuilder()
                    .setTitle('🏆 Infinity Rank Settings')
                    .setColor('#00bfff')
                    .addFields(
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
                    .setFooter({ text: 'All channels are whitelisted by default unless blacklisted' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'mode') {
                const mode = interaction.options.getString('mode', true);
                await setRankMode(guildId, mode);

                return interaction.editReply({
                    content: `✅ Rank mode set to **${mode === 'all_whitelisted' ? 'All Whitelisted' : 'Whitelist Only'}**.`
                });
            }

            if (sub === 'whitelistadd') {
                const channel = interaction.options.getChannel('channel', true);
                await addWhitelistChannel(guildId, channel.id);

                return interaction.editReply({
                    content: `✅ Added ${channel} to the XP whitelist.`
                });
            }

            if (sub === 'whitelistremove') {
                const channel = interaction.options.getChannel('channel', true);
                await removeWhitelistChannel(guildId, channel.id);

                return interaction.editReply({
                    content: `✅ Removed ${channel} from the XP whitelist.`
                });
            }

            if (sub === 'blacklistadd') {
                const channel = interaction.options.getChannel('channel', true);
                await addBlacklistChannel(guildId, channel.id);

                return interaction.editReply({
                    content: `✅ Added ${channel} to the XP blacklist.`
                });
            }

            if (sub === 'blacklistremove') {
                const channel = interaction.options.getChannel('channel', true);
                await removeBlacklistChannel(guildId, channel.id);

                return interaction.editReply({
                    content: `✅ Removed ${channel} from the XP blacklist.`
                });
            }

            if (sub === 'xpsettings') {
                const xpMin = interaction.options.getInteger('xp_min', true);
                const xpMax = interaction.options.getInteger('xp_max', true);
                const cooldown = interaction.options.getInteger('cooldown', true);

                if (xpMin > xpMax) {
                    return interaction.editReply({
                        content: '❌ `xp_min` cannot be greater than `xp_max`.'
                    });
                }

                await setRankXpConfig(guildId, xpMin, xpMax, cooldown);

                return interaction.editReply({
                    content: `✅ XP settings updated to **${xpMin}-${xpMax} XP** with a **${cooldown}s** cooldown.`
                });
            }

            return interaction.editReply({
                content: '❌ Unknown subcommand.'
            });
        } catch (error) {
            console.error('Ranks command error:', error);

            return interaction.editReply({
                content: '❌ Something went wrong while running that command.'
            });
        }
    }
};