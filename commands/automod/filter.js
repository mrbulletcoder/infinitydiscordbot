const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');

const { pool } = require('../../database');
const automodCache = require('../../utils/automod');
const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

module.exports = {
    name: 'automod-filter',
    description: 'Manage blocked words for AutoMod.',
    usage: '/automod-filter action:<add|remove|view> [word]',
    category: 'automod',
    userPermissions: PermissionFlagsBits.Administrator,
    botPermissions: [
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('automod-filter')
        .setDescription('Manage AutoMod blocked words')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option
                .setName('action')
                .setDescription('Choose what to do')
                .setRequired(true)
                .addChoices(
                    { name: 'add', value: 'add' },
                    { name: 'remove', value: 'remove' },
                    { name: 'view', value: 'view' }
                )
        )
        .addStringOption(option =>
            option
                .setName('word')
                .setDescription('Word or phrase to add/remove')
                .setRequired(false)
        ),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        const guildId = interaction.guild.id;
        const action = interaction.options.getString('action', true);
        const rawWord = interaction.options.getString('word');
        const word = rawWord?.trim().toLowerCase();

        if ((action === 'add' || action === 'remove') && !word) {
            return safeReply(interaction, {
                content: '❌ You need to provide a word for this action.'
            }, true);
        }

        if (action === 'view') {
            const [rows] = await pool.query(
                `SELECT word
                 FROM automod_filtered_words
                 WHERE guild_id = ?
                 ORDER BY word ASC`,
                [guildId]
            );

            const words = rows.map(row => `• \`${row.word}\``);

            const embed = new EmbedBuilder()
                .setColor('#00bfff')
                .setTitle('🚫 AutoMod Word Filter')
                .setDescription(
                    words.length
                        ? words.join('\n')
                        : 'No blocked words have been added yet.'
                )
                .setFooter({ text: 'Infinity AutoMod • Word Filter ⚡' })
                .setTimestamp();

            return safeReply(interaction, { embeds: [embed] }, true);
        }

        if (action === 'add') {
            await pool.query(
                `INSERT INTO automod_filtered_words (guild_id, word, created_at)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE word = VALUES(word)`,
                [guildId, word, Date.now()]
            );

            automodCache.invalidateAutomodCache(guildId);

            return safeReply(interaction, {
                content: `✅ Added \`${word}\` to the AutoMod word filter.`
            }, true);
        }

        if (action === 'remove') {
            const [result] = await pool.query(
                `DELETE FROM automod_filtered_words
                 WHERE guild_id = ? AND word = ?`,
                [guildId, word]
            );

            automodCache.invalidateAutomodCache(guildId);

            if (!result.affectedRows) {
                return safeReply(interaction, {
                    content: `❌ \`${word}\` is not in the word filter.`
                }, true);
            }

            return safeReply(interaction, {
                content: `✅ Removed \`${word}\` from the AutoMod word filter.`
            }, true);
        }
    }
};