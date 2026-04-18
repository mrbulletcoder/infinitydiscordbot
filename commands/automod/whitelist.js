const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ChannelType
} = require('discord.js');

const { pool } = require('../../database');

module.exports = {
    name: 'automod-whitelist',
    description: 'Manage users, roles, or channels that bypass automod.',
    usage: '/automod-whitelist type:<role|user|channel> action:<add|remove> <target>',
    userPermissions: PermissionFlagsBits.Administrator,

    slashData: new SlashCommandBuilder()
        .setName('automod-whitelist')
        .setDescription('Manage automod whitelist')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('What to whitelist')
                .setRequired(true)
                .addChoices(
                    { name: 'role', value: 'role' },
                    { name: 'user', value: 'user' },
                    { name: 'channel', value: 'channel' }
                )
        )
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Add or remove')
                .setRequired(true)
                .addChoices(
                    { name: 'add', value: 'add' },
                    { name: 'remove', value: 'remove' }
                )
        )
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role'))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User'))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel')
                .addChannelTypes(
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement,
                    ChannelType.GuildVoice,
                    ChannelType.GuildStageVoice,
                    ChannelType.GuildForum
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        const guildId = interaction.guild.id;
        const type = interaction.options.getString('type', true);
        const action = interaction.options.getString('action', true);

        const role = interaction.options.getRole('role');
        const user = interaction.options.getUser('user');
        const channel = interaction.options.getChannel('channel');

        let id;
        let label;
        let table;
        let column;

        if (type === 'role') {
            id = role?.id;
            label = role?.toString();
            table = 'automod_whitelist_roles';
            column = 'role_id';
        }

        if (type === 'user') {
            id = user?.id;
            label = user?.tag;
            table = 'automod_whitelist_users';
            column = 'user_id';
        }

        if (type === 'channel') {
            id = channel?.id;
            label = channel?.toString();
            table = 'automod_whitelist_channels';
            column = 'channel_id';
        }

        if (!id) {
            return interaction.reply({
                content: '❌ You must provide the correct option for the selected type.',
                ephemeral: true
            });
        }

        if (action === 'add') {
            const [existingRows] = await pool.query(
                `SELECT id FROM ${table} WHERE guild_id = ? AND ${column} = ? LIMIT 1`,
                [guildId, id]
            );

            if (existingRows.length) {
                return interaction.reply({
                    content: '❌ That target is already whitelisted.',
                    ephemeral: true
                });
            }

            await pool.query(
                `INSERT INTO ${table} (guild_id, ${column})
                 VALUES (?, ?)`,
                [guildId, id]
            );
        }

        if (action === 'remove') {
            const [existingRows] = await pool.query(
                `SELECT id FROM ${table} WHERE guild_id = ? AND ${column} = ? LIMIT 1`,
                [guildId, id]
            );

            if (!existingRows.length) {
                return interaction.reply({
                    content: '❌ That target is not currently whitelisted.',
                    ephemeral: true
                });
            }

            await pool.query(
                `DELETE FROM ${table}
                 WHERE guild_id = ? AND ${column} = ?`,
                [guildId, id]
            );
        }

        const embed = new EmbedBuilder()
            .setTitle('🛡️ AutoMod Whitelist Updated')
            .setColor('#00ff00')
            .setDescription(`${label} has been **${action}ed** ${action === 'add' ? 'to' : 'from'} the ${type} whitelist.`)
            .setFooter({ text: 'Infinity AutoMod System' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};