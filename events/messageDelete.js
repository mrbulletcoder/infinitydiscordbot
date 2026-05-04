const {
    AuditLogEvent,
    DANGER_COLOR,
    block,
    fetchAuditEntry,
    formatChannel,
    formatUser,
    sendAdvancedLog
} = require('../utils/advancedLogger');

module.exports = {
    name: 'messageDelete',

    async execute(message) {
        try {
            if (message.partial) message = await message.fetch().catch(() => message);
            if (!message.guild || message.author?.bot) return;

            const automodDelete = message.client.recentAutomodDeletes?.get(message.id);

            const audit = automodDelete
                ? null
                : await fetchAuditEntry(message.guild, AuditLogEvent.MessageDelete, message.author?.id, 7_000);

            const deletedBy = automodDelete?.executor || audit?.executor || null;
            const attachmentText = message.attachments?.size
                ? message.attachments.map(attachment => `[${attachment.name || 'Attachment'}](${attachment.url})`).join('\n')
                : 'None';

            const deleteColor = automodDelete
                ? '#ff4d4d'
                : audit?.executor
                    ? '#ffaa00'
                    : '#5865f2';

            await sendAdvancedLog(message.guild, 'message', {
                color: deleteColor,
                title: 'Message Deleted',
                description: 'A message was deleted from the server.',
                sourceChannelId: message.channel.id,
                thumbnail: message.author?.displayAvatarURL?.({ dynamic: true, size: 256 }) || null,
                fields: [
                    {
                        name: '👤 Author',
                        value:
                            `${formatUser(message.author)}\n` +
                            `Account: <t:${Math.floor(message.author.createdTimestamp / 1000)}:R>`,
                        inline: true
                    },
                    {
                        name: '📍 Channel',
                        value: `${message.channel}\n\`${message.channel.id}\``,
                        inline: true
                    },
                    {
                        name: '🛡️ Deleted By',
                        value: automodDelete
                            ? `🤖 ${formatUser(deletedBy)}\n\`Infinity AutoMod\``
                            : audit?.executor
                                ? `🛡️ ${formatUser(deletedBy)}\n\`Moderator Action\``
                                : `👤 Unknown / Self Deleted`,
                        inline: true
                    },
                    {
                        name: '📌 Delete Details',
                        value:
                            automodDelete
                                ? [
                                    '```yaml',
                                    'Type: AutoMod Action',
                                    `Reason: ${automodDelete.reason}`,
                                    `Source: Infinity`,
                                    '```'
                                ].join('\n')
                                : audit?.executor
                                    ? [
                                        '```yaml',
                                        'Type: Moderator Action',
                                        `Moderator: ${audit.executor.tag}`,
                                        '```'
                                    ].join('\n')
                                    : [
                                        '```yaml',
                                        'Type: User Deleted Message',
                                        'Source: Self Delete / Unknown',
                                        '```'
                                    ].join('\n'),
                        inline: false
                    },
                    {
                        name: '🧾 Message Info',
                        value:
                            `**Message ID:** \`${message.id}\`\n` +
                            `**Attachments:** ${attachmentText}`,
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
