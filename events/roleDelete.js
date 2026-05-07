const {
    AuditLogEvent,
    DANGER_COLOR,
    fetchAuditEntry,
    formatUser,
    inlineCode,
    sendAdvancedLog,
    yesNo,
    block
} = require('../utils/advancedLogger');

module.exports = {
    name: 'roleDelete',

    async execute(role) {
        try {
            await new Promise(resolve => setTimeout(resolve, 1200));

            const audit = await fetchAuditEntry(role.guild, AuditLogEvent.RoleDelete, role.id, 15_000);

            await sendAdvancedLog(role.guild, 'role', {
                color: DANGER_COLOR,
                title: 'Role Deleted',
                description: 'A role was deleted from the server.',
                fields: [
                    {
                        name: '🎭 Role',
                        value: `**${role.name}**\n\`${role.id}\``,
                        inline: true
                    },
                    {
                        name: '🛡️ Deleted By',
                        value: formatUser(audit?.executor, 'Unknown Moderator'),
                        inline: true
                    },
                    {
                        name: '📋 Role Info',
                        value: [
                            '```yaml',
                            'Action: Role deleted',
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
            console.error('roleDelete logging error:', error);
        }
    }
};
