const {
    EDIT_COLOR,
    block,
    formatChannel,
    formatUser,
    sendAdvancedLog
} = require('../utils/advancedLogger');

module.exports = {
    name: 'messageUpdate',

    async execute(oldMessage, newMessage) {
        try {
            if (oldMessage.partial) {
                oldMessage = await oldMessage.fetch().catch(() => oldMessage);
            }

            if (newMessage.partial) {
                newMessage = await newMessage.fetch().catch(() => newMessage);
            }

            if (!newMessage.guild || newMessage.author?.bot) return;

            if (oldMessage.content === newMessage.content) return;

            await sendAdvancedLog(newMessage.guild, 'message', {
                color: EDIT_COLOR,
                title: 'Message Edited',
                description: 'A message was edited in the server.',
                sourceChannelId: newMessage.channel?.id,
                url: newMessage.url,

                thumbnail:
                    newMessage.author?.displayAvatarURL?.({
                        dynamic: true,
                        size: 256
                    }) || null,

                fields: [
                    {
                        name: '👤 Author',
                        value: formatUser(newMessage.author),
                        inline: true
                    },

                    {
                        name: '📍 Channel',
                        value: newMessage.channel
                            ? formatChannel(newMessage.channel)
                            : '`Unknown Channel`',
                        inline: true
                    },

                    {
                        name: '🔗 Message',
                        value: `[Jump to Message](${newMessage.url})`,
                        inline: false
                    },

                    {
                        name: '📋 Edit Summary',
                        value: [
                            '```yaml',
                            'Action: Message edited',
                            `Edited By: ${newMessage.author?.tag || 'Unknown User'}`,
                            '```'
                        ].join('\n'),
                        inline: false
                    },

                    {
                        name: '📝 Before',
                        value: block(oldMessage.content || 'No content'),
                        inline: false
                    },

                    {
                        name: '📝 After',
                        value: block(newMessage.content || 'No content'),
                        inline: false
                    }
                ]
            });
        } catch (error) {
            console.error('messageUpdate logging error:', error);
        }
    }
};