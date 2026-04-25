const {
    AuditLogEvent,
    SUCCESS_COLOR,
    fetchAuditEntry,
    formatRole,
    formatUser,
    inlineCode,
    sendAdvancedLog,
    yesNo
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
                    { name: '🎭 Role', value: formatRole(role), inline: true },
                    { name: '🛡️ Created By', value: formatUser(audit?.executor, 'Unknown Moderator'), inline: true },
                    { name: '📄 Reason', value: audit?.reason || 'No reason provided', inline: true },
                    { name: '🎨 Color', value: inlineCode(role.hexColor), inline: true },
                    { name: '📌 Position', value: inlineCode(role.position), inline: true },
                    { name: '🔔 Mentionable', value: yesNo(role.mentionable), inline: true }
                ]
            });
        } catch (error) {
            console.error('roleCreate logging error:', error);
        }
    }
};
