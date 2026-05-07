const {
    AuditLogEvent,
    SUCCESS_COLOR,
    fetchAuditEntry,
    formatUser,
    inlineCode,
    sendAdvancedLog,
    yesNo,
    block
} = require('../utils/advancedLogger');

module.exports = {
    name: 'roleCreate',

    async execute(role) {
        try {
            await new Promise(resolve => setTimeout(resolve, 1200));

            const audit = await fetchAuditEntry(role.guild, AuditLogEvent.RoleCreate, role.id, 15_000);

            await sendAdvancedLog(role.guild, 'role', {
                color: SUCCESS_COLOR,
                title: 'Role Created',
                description: 'A new role was created in the server.',
                fields: [
                    {
                        name: '🎭 Role',
                        value: `**${role.name || 'Unknown Role'}**\n\`${role.id}\``,
                        inline: true
                    },
                    {
                        name: '🛡️ Created By',
                        value: formatUser(audit?.executor, 'Unknown Moderator'),
                        inline: true
                    },
                    {
                        name: '📋 Role Info',
                        value: [
                            '```yaml',
                            'Action: Role created',
                            `Color: ${role.hexColor}`,
                            `Position: ${role.position}`,
                            `Mentionable: ${yesNo(role.mentionable)}`,
                            '```'
                        ].join('\n'),
                        inline: false
                    },
                ]
            });
        } catch (error) {
            console.error('roleCreate logging error:', error);
        }
    }
};
