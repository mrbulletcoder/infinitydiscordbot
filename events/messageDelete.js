const {
    AuditLogEvent,
    DANGER_COLOR,
    block,
    fetchAuditEntry,
    formatUser,
    sendAdvancedLog
} = require('../utils/advancedLogger');

module.exports = {
    name: 'messageDelete',

    async execute(message) {
        try {
            if (message.partial) {
                message = await message.fetch().catch(() => message);
            }

            if (!message.guild || message.author?.bot) return;

            const automodDelete =
                message.client.recentAutomodDeletes?.get(message.id);

            const audit = automodDelete
                ? null
                : await fetchAuditEntry(
                    message.guild,
                    AuditLogEvent.MessageDelete,
                    message.author?.id,
                    7_000
                );

            const deletedBy =
                automodDelete?.executor ||
                audit?.executor ||
                null;

            const attachmentText = message.attachments?.size
                ? message.attachments
                    .map(a => `[${a.name || 'Attachment'}](${a.url})`)
                    .join('\n')
                : 'None';

            const deleteColor = automodDelete
                ? '#ff4d4d'
                : audit?.executor
                    ? '#ffaa00'
                    : '#5865f2';

            const authorAccountAge = message.author?.createdTimestamp
                ? `<t:${Math.floor(message.author.createdTimestamp / 1000)}:R>`
                : '`Unknown`';

            await sendAdvancedLog(message.guild, 'message', {
                color: deleteColor,
                title: 'Message Deleted',
                description: 'A message was deleted from the server.',
                sourceChannelId: message.channel?.id,
                thumbnail:
                    message.author?.displayAvatarURL?.({
                        dynamic: true,
                        size: 256
                    }) || null,

                fields: [
                    {
                        name: '👤 Author',
                        value:
                            `${formatUser(message.author, 'Unknown User')}\n` +
                            `Account: ${authorAccountAge}`,
                        inline: true
                    },

                    {
                        name: '📍 Channel',
                        value: message.channel
                            ? `${message.channel}\n\`${message.channel.id}\``
                            : '`Unknown Channel`',
                        inline: true
                    },

                    {
                        name: '🛡️ Deleted By',
                        value: automodDelete
                            ? `🤖 ${formatUser(deletedBy)}\n\`Infinity AutoMod\``
                            : audit?.executor
                                ? `🛡️ ${formatUser(deletedBy)}\n\`Moderator Action\``
                                : `👤 ${formatUser(message.author, 'Unknown User')}\n• Self Deleted`,
                        inline: false
                    },

                    {
                        name: '📋 Delete Summary',
                        value:
                            automodDelete
                                ? [
                                    '```yaml',
                                    'Action: AutoMod deleted message',
                                    `Reason: ${automodDelete.reason || 'AutoMod rule triggered'}`,
                                    'Handled By: Infinity AutoMod',
                                    '```'
                                ].join('\n')
                                : audit?.executor
                                    ? [
                                        '```yaml',
                                        'Action: Message deleted by moderator',
                                        `Deleted By: ${audit.executor.tag}`,
                                        '```'
                                    ].join('\n')
                                    : [
                                        '```yaml',
                                        'Action: User deleted their own message',
                                        `Deleted By: ${message.author?.tag || 'Unknown User'}`,
                                        '```'
                                    ].join('\n'),

                        inline: false
                    },

                    {
                        name: '🧾 Message Info',
                        value: [
                            '```yaml',
                            `Message ID: ${message.id}`,
                            `Attachments: ${attachmentText}`,
                            '```'
                        ].join('\n'),
                        inline: false
                    },

                    {
                        name: '📝 Deleted Content',
                        value: message.content
                            ? block(message.content)
                            : '`No text content.`',
                        inline: false
                    }
                ]
            });
        } catch (error) {
            console.error('messageDelete logging error:', error);
        }
    }
};