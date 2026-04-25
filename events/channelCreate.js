const {
    AuditLogEvent,
    SUCCESS_COLOR,
    fetchAuditEntry,
    formatChannel,
    formatUser,
    inlineCode,
    sendAdvancedLog
} = require('../utils/advancedLogger');

function channelTypeName(channel) {
    return channel.type === 0 ? 'Text Channel'
        : channel.type === 2 ? 'Voice Channel'
        : channel.type === 4 ? 'Category'
        : channel.type === 5 ? 'Announcement Channel'
        : channel.type === 13 ? 'Stage Channel'
        : `Type ${channel.type}`;
}

module.exports = {
    name: 'channelCreate',

    async execute(channel) {
        try {
            if (!channel.guild) return;

            const audit = await fetchAuditEntry(channel.guild, AuditLogEvent.ChannelCreate, channel.id);

            await sendAdvancedLog(channel.guild, 'channel', {
                color: SUCCESS_COLOR,
                title: 'Channel Created',
                description: 'A new channel was created in the server.',
                fields: [
                    { name: '📍 Channel', value: formatChannel(channel), inline: true },
                    { name: '🛡️ Created By', value: formatUser(audit?.executor, 'Unknown Moderator'), inline: true },
                    { name: '📄 Reason', value: audit?.reason || 'No reason provided', inline: true },
                    { name: '📦 Type', value: inlineCode(channelTypeName(channel)), inline: true },
                    { name: '📁 Category', value: channel.parent ? `${channel.parent.name}\n\`${channel.parentId}\`` : 'None', inline: true },
                    { name: '🔢 Position', value: inlineCode(channel.position ?? 'Unknown'), inline: true }
                ]
            });
        } catch (error) {
            console.error('channelCreate logging error:', error);
        }
    }
};
