const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const { pool } = require('../../database');

async function ensureAutomodConfig(guildId) {
    await pool.query(
        `INSERT INTO automod_config (guild_id)
         VALUES (?)
         ON DUPLICATE KEY UPDATE guild_id = guild_id`,
        [guildId]
    );
}

module.exports = {
    name: 'automod',
    description: 'Configure and manage the server’s automod settings.',
    usage: '/automod',
    userPermissions: PermissionFlagsBits.Administrator,

    slashData: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configure automod system')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Feature to configure')
                .setRequired(false)
                .addChoices(
                    { name: 'spam', value: 'spam' },
                    { name: 'links', value: 'links' },
                    { name: 'caps', value: 'caps' }
                )
        )
        .addStringOption(option =>
            option.setName('state')
                .setDescription('Enable or disable')
                .setRequired(false)
                .addChoices(
                    { name: 'on', value: 'on' },
                    { name: 'off', value: 'off' }
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        const guildId = interaction.guild.id;
        const type = interaction.options.getString('type');
        const state = interaction.options.getString('state');

        await ensureAutomodConfig(guildId);

        const [rows] = await pool.query(
            `SELECT spam_enabled, links_enabled, caps_enabled
             FROM automod_config
             WHERE guild_id = ?`,
            [guildId]
        );

        const automod = rows[0] || {
            spam_enabled: 1,
            links_enabled: 1,
            caps_enabled: 1
        };

        if (!type || !state) {
            const embed = new EmbedBuilder()
                .setTitle('🤖 AutoMod Settings')
                .setColor('#00bfff')
                .addFields(
                    { name: '🚫 Spam', value: automod.spam_enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
                    { name: '🔗 Links', value: automod.links_enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
                    { name: '🔊 Caps', value: automod.caps_enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true }
                )
                .setFooter({ text: 'Infinity AutoMod System' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        const fieldMap = {
            spam: 'spam_enabled',
            links: 'links_enabled',
            caps: 'caps_enabled'
        };

        const field = fieldMap[type];
        const enabled = state === 'on' ? 1 : 0;

        await pool.query(
            `UPDATE automod_config
             SET ${field} = ?
             WHERE guild_id = ?`,
            [enabled, guildId]
        );

        const embed = new EmbedBuilder()
            .setTitle('⚙️ AutoMod Updated')
            .setColor('#00ff00')
            .setDescription(`**${type.toUpperCase()}** is now ${enabled ? '🟢 Enabled' : '🔴 Disabled'}`)
            .setFooter({ text: 'Infinity AutoMod System' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};