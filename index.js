const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
require('dotenv').config({ quiet: true });

const { testConnection } = require('./database');

const { logError } = require('./utils/errorHandler');

function validateEnv() {
    const required = [
        'DISCORD_TOKEN',
        'CLIENT_ID',
        'DB_HOST',
        'DB_USER',
        'DB_PASSWORD',
        'DB_NAME'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length) {
        throw new Error(`Missing required .env values: ${missing.join(', ')}`);
    }
}

// Global process error handlers
process.on('unhandledRejection', (reason) => {
    logError('UNHANDLED REJECTION', reason);
});

process.on('uncaughtException', (error) => {
    logError('UNCAUGHT EXCEPTION', error);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    process.exit(0);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildModeration
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember
    ]
});

client.commands = new Collection();
client.cooldowns = new Collection();

// Discord connection / shard logging
client.on('shardDisconnect', (event, id) => {
    console.warn(`Shard ${id} disconnected. Code: ${event.code}`);
});

client.on('shardReconnecting', (id) => {
    console.warn(`Shard ${id} reconnecting...`);
});

client.on('shardResume', (id, replayed) => {
    console.log(`Shard ${id} resumed. Replayed ${replayed} events.`);
});

client.on('error', (error) => {
    logError('DISCORD CLIENT', error);
});

async function startBot() {
    try {
        validateEnv();

        await testConnection();

        client.startupStats = {
            database: 'Connected'
        };

        await require('./handlers/commandHandler')(client);
        require('./handlers/eventHandler')(client);

        await client.login(process.env.DISCORD_TOKEN);
        console.log('✅ Infinity is starting...');
    } catch (error) {
        logError('STARTUP', error);
        process.exit(1);
    }
}

startBot();