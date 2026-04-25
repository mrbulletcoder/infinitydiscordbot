async function safeErrorReply(interaction, message = '❌ Something went wrong while handling that interaction.') {
    try {
        if (interaction.replied || interaction.deferred) {
            return await interaction.followUp({ content: message, ephemeral: true });
        }

        return await interaction.reply({ content: message, ephemeral: true });
    } catch (error) {
        console.error('Failed to send safe error reply:', error);
    }
}

async function safeRun(interaction, label, fn) {
    try {
        return await fn();
    } catch (error) {
        console.error(`❌ Error in ${label}:`, error);
        return safeErrorReply(interaction);
    }
}

module.exports = { safeErrorReply, safeRun };
