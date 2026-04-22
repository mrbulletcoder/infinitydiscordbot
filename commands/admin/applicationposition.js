const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');
const { pool } = require('../../database');

module.exports = {
    name: 'applicationposition',
    description: 'Manage application positions.',
    usage: '/applicationposition <add|remove|list|toggle>',
    userPermissions: PermissionFlagsBits.Administrator,

    slashData: new SlashCommandBuilder()
        .setName('applicationposition')
        .setDescription('Manage application positions')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new application position')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Position name')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('Role to give when accepted')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove an application position')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('Position ID')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Enable or disable an application position')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('Position ID')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all application positions')
        ),

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const sub = interaction.options.getSubcommand();

        if (sub === 'add') {
            const name = interaction.options.getString('name', true);
            const role = interaction.options.getRole('role');

            const [result] = await pool.query(
                `INSERT INTO application_positions
                    (guild_id, name, role_id, enabled, created_at)
                 VALUES (?, ?, ?, 1, ?)`,
                [
                    interaction.guild.id,
                    name,
                    role?.id || null,
                    Date.now()
                ]
            );

            const embed = new EmbedBuilder()
                .setColor('#00bfff')
                .setAuthor({
                    name: '✅ Application Position Added',
                    iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
                })
                .addFields(
                    { name: '🆔 Position ID', value: `\`${result.insertId}\``, inline: true },
                    { name: '📌 Name', value: name, inline: true },
                    { name: '🏷️ Linked Role', value: role ? `<@&${role.id}>` : '`None`', inline: true }
                )
                .setFooter({ text: 'Infinity Applications' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'remove') {
            const id = interaction.options.getInteger('id', true);

            const [rows] = await pool.query(
                `SELECT * FROM application_positions
                 WHERE guild_id = ? AND id = ?
                 LIMIT 1`,
                [interaction.guild.id, id]
            );

            const position = rows[0];
            if (!position) {
                return interaction.editReply({
                    content: '❌ Application position not found.',
                    ephemeral: true
                });
            }

            await pool.query(
                `DELETE FROM application_positions
                 WHERE guild_id = ? AND id = ?`,
                [interaction.guild.id, id]
            );

            return interaction.editReply({
                content: `✅ Removed application position \`${position.name}\` (\`#${position.id}\`).`,
                ephemeral: true
            });
        }

        if (sub === 'toggle') {
            const id = interaction.options.getInteger('id', true);

            const [rows] = await pool.query(
                `SELECT * FROM application_positions
                 WHERE guild_id = ? AND id = ?
                 LIMIT 1`,
                [interaction.guild.id, id]
            );

            const position = rows[0];
            if (!position) {
                return interaction.editReply({
                    content: '❌ Application position not found.',
                    ephemeral: true
                });
            }

            const newState = position.enabled ? 0 : 1;

            await pool.query(
                `UPDATE application_positions
                 SET enabled = ?
                 WHERE guild_id = ? AND id = ?`,
                [newState, interaction.guild.id, id]
            );

            return interaction.editReply({
                content: `✅ Position \`${position.name}\` is now ${newState ? '**enabled**' : '**disabled**'}.`,
                ephemeral: true
            });
        }

        if (sub === 'list') {
            const [rows] = await pool.query(
                `SELECT * FROM application_positions
                 WHERE guild_id = ?
                 ORDER BY id ASC`,
                [interaction.guild.id]
            );

            if (!rows.length) {
                return interaction.editReply({
                    content: '❌ No application positions have been created yet.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#00bfff')
                .setAuthor({
                    name: '📋 Application Positions',
                    iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
                })
                .setDescription(
                    rows.map(position =>
                        `**#${position.id}** — ${position.name}\n` +
                        `Role: ${position.role_id ? `<@&${position.role_id}>` : '`None`'}\n` +
                        `Status: ${position.enabled ? '✅ Enabled' : '❌ Disabled'}`
                    ).join('\n\n')
                )
                .setFooter({ text: 'Infinity Applications' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed], ephemeral: true });
        }
    }
};