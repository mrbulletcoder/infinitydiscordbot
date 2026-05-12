const { MessageFlags } = require('discord.js');
const { error, warn } = require('./consoleLogger');

function generateErrorId() {
    return `INF-${Math.random().toString(16).slice(2, 7).toUpperCase()}`;
}

function cleanError(errorObj) {
    if (errorObj instanceof Error) {
        return {
            name: errorObj.name,
            message: errorObj.message,
            stack: errorObj.stack
        };
    }

    return {
        name: 'UnknownError',
        message: String(errorObj),
        stack: null
    };
}

function logError(type, errorObj, context = {}) {
    const errorId = generateErrorId();
    const cleaned = cleanError(errorObj);

    console.log('');
    error(`ERROR ID: ${errorId}`);
    console.log(`Type: ${type}`);
    console.log(`Name: ${cleaned.name}`);
    console.log(`Message: ${cleaned.message}`);

    if (context.event) console.log(`Event: ${context.event}`);
    if (context.file) console.log(`File: ${context.file}`);
    if (context.command) console.log(`Command: ${context.command}`);
    if (context.user) console.log(`User: ${context.user}`);
    if (context.guild) console.log(`Guild: ${context.guild}`);
    if (context.channel) console.log(`Channel: ${context.channel}`);

    if (cleaned.stack) {
        console.log('');
        console.log(cleaned.stack);
    }

    console.log('');

    return errorId;
}

async function replyWithError(interactionOrMessage, errorId) {
    const content = `❌ Something went wrong.\nError ID: \`${errorId}\``;

    try {
        if (!interactionOrMessage) return;

        if (typeof interactionOrMessage.reply === 'function') {
            if (interactionOrMessage.deferred || interactionOrMessage.replied) {
                return await interactionOrMessage.followUp({
                    content,
                    flags: MessageFlags.Ephemeral
                });
            }

            return await interactionOrMessage.reply({
                content,
                flags: MessageFlags.Ephemeral
            });
        }
    } catch (replyError) {
        warn(`Failed to send error reply for ${errorId}`);
    }
}

module.exports = {
    generateErrorId,
    logError,
    replyWithError
};