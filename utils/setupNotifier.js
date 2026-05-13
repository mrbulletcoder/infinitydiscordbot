const { EmbedBuilder } = require('discord.js');

const notifyCooldowns = new Map();
const COOLDOWN_MS = 6 * 60 * 60 * 1000;

function getCooldownKey(guildId, system, issueCode) {
    return `${guildId}:${system}:${issueCode}`;
}

async function notifySetupIssue(guild, options = {}) {
    const {
        system = 'Unknown System',
        issueCode = 'unknown_issue',
        title = 'Infinity Setup Issue',
        description = 'A setup issue was detected.',
        fix = 'Please review your Infinity setup settings.',
        severity = 'warning'
    } = options;

    const key = getCooldownKey(guild.id, system, issueCode);
    const existing = notifyCooldowns.get(key);

    if (existing && Date.now() - existing < COOLDOWN_MS) {
        return false;
    }

    notifyCooldowns.set(key, Date.now());

    const owner = await guild.fetchOwner().catch(() => null);
    if (!owner) return false;

    const color =
        severity === 'danger'
            ? '#ff4d4d'
            : severity === 'success'
                ? '#57f287'
                : '#ffaa00';

    const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({
            name: 'Infinity Setup Alert',
            iconURL: guild.client.user.displayAvatarURL()
        })
        .setTitle(`⚠️ ${title}`)
        .setDescription(description)
        .addFields(
            {
                name: '🏠 Server',
                value: `${guild.name}\n\`${guild.id}\``,
                inline: false
            },
            {
                name: '🧩 System',
                value: system,
                inline: true
            },
            {
                name: '🛠️ How To Fix',
                value: fix,
                inline: false
            }
        )
        .setFooter({ text: 'Infinity Bot • Setup Diagnostics ⚡' })
        .setTimestamp();

    await owner.send({ embeds: [embed] }).catch(() => null);

    return true;
}

module.exports = {
    notifySetupIssue
};