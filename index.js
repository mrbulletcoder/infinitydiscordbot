const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
require('dotenv').config({ quiet: true });

const { testConnection } = require('./database');

// Global process error handlers
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
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
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction
    ]
});

client.commands = new Collection();

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
    console.error('Discord client error:', error);
});

async function startBot() {
    try {
        await testConnection();

        await require('./handlers/commandHandler')(client);
        require('./handlers/eventHandler')(client);

        await client.login(process.env.DISCORD_TOKEN);
        console.log('✅ Infinity is starting...');
    } catch (error) {
        console.error('❌ Failed to start Infinity:', error);
        process.exit(1);
    }
}

startBot();