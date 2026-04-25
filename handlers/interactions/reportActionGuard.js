const { safeErrorReply, safeRun } = require('./safeReply');

const reportActionCooldowns = new Map();
const reportActionLocks = new Map();

const REPORT_BUTTON_COOLDOWN_MS = 3000;
const REPORT_ACTION_LOCK_MS = 10000;

function getReportActionCooldownKey(interaction, action, reportId) {
    return `${interaction.guildId}:${interaction.user.id}:${action}:${reportId}`;
}

function getReportActionLockKey(interaction, action, reportId) {
    return `${interaction.guildId}:${action}:${reportId}`;
}

async function checkReportButtonSpam(interaction, action, reportId) {
    const now = Date.now();
    const cooldownKey = getReportActionCooldownKey(interaction, action, reportId);
    const cooldownExpiresAt = reportActionCooldowns.get(cooldownKey);

    if (cooldownExpiresAt && now < cooldownExpiresAt) {
        const remaining = ((cooldownExpiresAt - now) / 1000).toFixed(1);
        await safeErrorReply(interaction, `⏳ Please wait **${remaining}s** before trying to **${action}** this report again.`);
        return false;
    }

    const lockKey = getReportActionLockKey(interaction, action, reportId);
    const lockData = reportActionLocks.get(lockKey);

    if (lockData && now < lockData.expiresAt && lockData.userId !== interaction.user.id) {
        await safeErrorReply(interaction, `⚠️ This report is already being processed by <@${lockData.userId}>. Please wait a moment.`);
        return false;
    }

    reportActionCooldowns.set(cooldownKey, now + REPORT_BUTTON_COOLDOWN_MS);
    setTimeout(() => reportActionCooldowns.delete(cooldownKey), REPORT_BUTTON_COOLDOWN_MS);

    reportActionLocks.set(lockKey, { userId: interaction.user.id, expiresAt: now + REPORT_ACTION_LOCK_MS });
    setTimeout(() => {
        const current = reportActionLocks.get(lockKey);
        if (current && current.userId === interaction.user.id) reportActionLocks.delete(lockKey);
    }, REPORT_ACTION_LOCK_MS);

    return true;
}

function clearReportActionLock(interaction, action, reportId) {
    const lockKey = getReportActionLockKey(interaction, action, reportId);
    const current = reportActionLocks.get(lockKey);
    if (current && current.userId === interaction.user.id) reportActionLocks.delete(lockKey);
}

async function runReportButtonAction(interaction, action, reportId, handler) {
    const allowed = await checkReportButtonSpam(interaction, action, reportId);
    if (!allowed) return;

    try {
        return await safeRun(interaction, `report button ${action}_${reportId}`, () => handler());
    } finally {
        clearReportActionLock(interaction, action, reportId);
    }
}

module.exports = { runReportButtonAction };
