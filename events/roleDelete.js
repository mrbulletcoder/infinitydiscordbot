const {
    AuditLogEvent,
    DANGER_COLOR,
    fetchAuditEntry,
    formatUser,
    inlineCode,
    sendAdvancedLog,
    yesNo
} = require('../utils/advancedLogger');

module.exports = {
    name: 'roleDelete',

    async execute(role) {
        try {
            const audit = await fetchAuditEntry(role.guild, AuditLogEvent.RoleDelete, role.id);

            await sendAdvancedLog(role.guild, 'role', {
                color: DANGER_COLOR,
                title: 'Role Deleted',
                description: 'A role was deleted from the server.',
                fields: [
                    { name: '🎭 Role Name', value: `**${role.name || 'Unknown Role'}**\n${inlineCode(role.id)}`, inline: true },
                    { name: '🛡️ Deleted By', value: formatUser(audit?.executor, 'Unknown Moderator'), inline: true },
                    { name: '📄 Reason', value: audit?.reason || 'No reason provided', inline: true },
                    { name: '🎨 Color', value: inlineCode(role.hexColor), inline: true },
                    { name: '📌 Position', value: inlineCode(role.position), inline: true },
                    { name: '🔔 Mentionable', value: yesNo(role.mentionable), inline: true }
                ]
            });
        } catch (error) {
            console.error('roleDelete logging error:', error);
        }
    }
};
