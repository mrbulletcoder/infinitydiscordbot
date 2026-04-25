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

            const audit = await fetchAuditEntry(message.guild, AuditLogEvent.MessageDelete, message.author?.id, 7_000);
            const attachmentText = message.attachments?.size
                ? message.attachments.map(attachment => `[${attachment.name || 'Attachment'}](${attachment.url})`).join('\n')
                : 'None';

            await sendAdvancedLog(message.guild, 'message', {
                color: DANGER_COLOR,
                title: 'Message Deleted',
                description: 'A message was deleted from the server.',
                sourceChannelId: message.channel.id,
                thumbnail: message.author?.displayAvatarURL?.({ dynamic: true, size: 256 }) || null,
                fields: [
                    { name: '👤 Author', value: formatUser(message.author), inline: true },
                    { name: '📍 Channel', value: formatChannel(message.channel), inline: true },
                    { name: '🛡️ Deleted By', value: formatUser(audit?.executor, 'Unknown / Self Deleted'), inline: true },
                    { name: '🆔 Message ID', value: `\`${message.id}\``, inline: true },
                    { name: '📎 Attachments', value: attachmentText, inline: true },
                    { name: '📝 Content', value: block(message.content), inline: false }
                ]
            });
        } catch (error) {
            console.error('messageDelete logging error:', error);
        }
    }
};
