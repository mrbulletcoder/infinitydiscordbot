const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');

const { pool } = require('../../database');

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);

    if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`;

    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''}`;
}

module.exports = {
    name: 'automod-rules',
    description: 'Edit automod rules such as spam, links, and caps.',
    usage: '/automod-rules type:<spam|links|caps|all> offense:<number> action:<warn|timeout|kick> [duration]',
    userPermissions: PermissionFlagsBits.Administrator,

    slashData: new SlashCommandBuilder()
        .setName('automod-rules')
        .setDescription('Set automod punishment rules')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of automod rule')
                .setRequired(true)
                .addChoices(
                    { name: 'spam', value: 'spam' },
                    { name: 'links', value: 'links' },
                    { name: 'caps', value: 'caps' },
                    { name: 'all', value: 'all' }
                )
        )
        .addIntegerOption(option =>
            option.setName('offense')
                .setDescription('Offense number')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10)
        )
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action type')
                .setRequired(true)
                .addChoices(
                    { name: 'warn', value: 'warn' },
                    { name: 'timeout', value: 'timeout' },
                    { name: 'kick', value: 'kick' }
                )
        )
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Timeout duration in seconds (only for timeout)')
                .setMinValue(1)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        const guildId = interaction.guild.id;
        const type = interaction.options.getString('type', true);
        const offense = interaction.options.getInteger('offense', true);
        const action = interaction.options.getString('action', true);
        const duration = interaction.options.getInteger('duration');

        const types = type === 'all' ? ['spam', 'links', 'caps'] : [type];

        if (action === 'timeout' && !duration) {
            return interaction.reply({
                content: '❌ You must provide a duration in seconds for timeout.',
                ephemeral: true
            });
        }

        const punishmentValue = action === 'timeout'
            ? `timeout:${duration * 1000}`
            : action;

        for (const currentType of types) {
            await pool.query(
                `INSERT INTO automod_punishments (guild_id, type, offense_number, punishment)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE punishment = VALUES(punishment)`,
                [guildId, currentType, offense, punishmentValue]
            );
        }

        let display;
        if (action === 'timeout') {
            display = `⏳ Timeout (${formatDuration(duration * 1000)})`;
        } else if (action === 'warn') {
            display = '⚠️ Warn';
        } else {
            display = '👢 Kick';
        }

        const embed = new EmbedBuilder()
            .setTitle('⚙️ AutoMod Rule Updated')
            .setColor('#00ff00')
            .setDescription(`**${type.toUpperCase()}** • Offense **#${offense}** → ${display}`)
            .setFooter({ text: 'Infinity AutoMod System' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};