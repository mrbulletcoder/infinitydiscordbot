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
            const audit = await fetchAuditEntry(role.guild, AuditLogEvent.RoleCreate, role.id);

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
                        name: '📌 Role Details',
                        value: [
                            '```yaml',
                            `Color: ${role.hexColor}`,
                            `Position: ${role.position}`,
                            `Mentionable: ${yesNo(role.mentionable)}`,
                            '```'
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '📄 Reason',
                        value: audit?.reason ? block(audit.reason) : '`No reason provided.`',
                        inline: false
                    }
                ]
            });
        } catch (error) {
            console.error('roleCreate logging error:', error);
        }
    }
};
