const {
    AuditLogEvent,
    SUCCESS_COLOR,
    fetchAuditEntry,
    formatChannel,
    formatUser,
    inlineCode,
    sendAdvancedLog,
    block
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

            await new Promise(resolve => setTimeout(resolve, 1200));

            const audit = await fetchAuditEntry(channel.guild, AuditLogEvent.ChannelCreate, channel.id, 15_000);

            await sendAdvancedLog(channel.guild, 'channel', {
                color: SUCCESS_COLOR,
                title: 'Channel Created',
                description: 'A new channel was created in the server.',
                fields: [
                    {
                        name: '📍 Channel',
                        value: `#${channel.name || 'unknown'}\n\`${channel.id}\``,
                        inline: true
                    },
                    {
                        name: '🛡️ Created By',
                        value: formatUser(audit?.executor, 'Unknown Moderator'),
                        inline: true
                    },
                    {
                        name: '📋 Channel Info',
                        value: [
                            '```yaml',
                            'Action: Channel created',
                            `Type: ${channelTypeName(channel)}`,
                            `Category: ${channel.parent?.name || 'None'}`,
                            `Position: ${channel.position ?? 'Unknown'}`,
                            '```'
                        ].join('\n'),
                        inline: false
                    },
                ]
            });
        } catch (error) {
            console.error('channelCreate logging error:', error);
        }
    }
};
