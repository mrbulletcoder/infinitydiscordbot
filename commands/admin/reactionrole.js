const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ChannelType,
    MessageFlags
} = require('discord.js');

const { pool } = require('../../database');
const {
    parseEmojiInput,
    getCategoryByName,
    buildReactionRoleEmbed,
    syncPanelReactions
} = require('../../utils/reactionRoles');

module.exports = {
    name: 'reactionrole',
    description: 'Create custom reaction role categories and panels.',
    usage: '/reactionrole createcategory | addrole | removerole | send | update | list | deletecategory',
    userPermissions: PermissionFlagsBits.ManageGuild,

    slashData: new SlashCommandBuilder()
        .setName('reactionrole')
        .setDescription('Manage custom reaction roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

        .addSubcommand(sub =>
            sub
                .setName('createcategory')
                .setDescription('Create a new reaction role category')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Category name, e.g. Gaming Roles')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('Description shown in the panel')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('mode')
                        .setDescription('Whether users can pick one role or many')
                        .addChoices(
                            { name: 'Multi Select', value: 'multi' },
                            { name: 'Single Select', value: 'single' }
                        )
                        .setRequired(false)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName('addrole')
                .setDescription('Add a role option to a category')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Category name')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('Role to give/remove')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('emoji')
                        .setDescription('Emoji for this role, e.g. 🎮 or <:xbox:123456789>')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('label')
                        .setDescription('Custom label shown in the panel')
                        .setRequired(false)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName('removerole')
                .setDescription('Remove a role option from a category')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Category name')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('Role to remove from the category')
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName('send')
                .setDescription('Send a reaction role panel to a channel')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Category name')
                        .setRequired(true)
                )
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to send the panel to')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName('update')
                .setDescription('Update all sent panels for a category without resending')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Category name')
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName('list')
                .setDescription('List all categories and their role options')
        )

        .addSubcommand(sub =>
            sub
                .setName('deletecategory')
                .setDescription('Delete a category and all its role options')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Category name')
                        .setRequired(true)
                )
        ),

    async executeSlash(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const sub = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            if (sub === 'createcategory') {
                const name = interaction.options.getString('name', true).trim();
                const description = interaction.options.getString('description')?.trim() || 'React below to choose your role.';
                const mode = interaction.options.getString('mode') || 'multi';

                const existing = await getCategoryByName(guildId, name);
                if (existing) {
                    return interaction.editReply({
                        content: '❌ A reaction role category with that name already exists.'
                    });
                }

                await pool.query(
                    `INSERT INTO reaction_role_categories (guild_id, name, description, mode) VALUES (?, ?, ?, ?)`,
                    [guildId, name, description, mode]
                );

                return interaction.editReply({
                    content: `✅ Created reaction role category **${name}** with **${mode}** mode.`
                });
            }

            if (sub === 'addrole') {
                const categoryName = interaction.options.getString('category', true).trim();
                const role = interaction.options.getRole('role', true);
                const emojiInput = interaction.options.getString('emoji', true);
                const label = interaction.options.getString('label')?.trim() || role.name;

                const category = await getCategoryByName(guildId, categoryName);
                if (!category) {
                    return interaction.editReply({
                        content: '❌ That category does not exist.'
                    });
                }

                const botMember = await interaction.guild.members.fetchMe();

                if (role.managed) {
                    return interaction.editReply({
                        content: '❌ That role is managed by an integration or bot and cannot be used.'
                    });
                }

                if (role.id === interaction.guild.id) {
                    return interaction.editReply({
                        content: '❌ The @everyone role cannot be used as a reaction role.'
                    });
                }

                if (role.position >= botMember.roles.highest.position) {
                    return interaction.editReply({
                        content: '❌ That role is higher than or equal to my highest role. Move my role above it first.'
                    });
                }

                const { emojiKey, emojiDisplay } = await parseEmojiInput(emojiInput, interaction.guild);

                const [existingEmoji] = await pool.query(
                    `SELECT id FROM reaction_role_items WHERE guild_id = ? AND category_id = ? AND emoji_key = ? LIMIT 1`,
                    [guildId, category.id, emojiKey]
                );

                if (existingEmoji.length) {
                    return interaction.editReply({
                        content: '❌ That emoji is already being used in this category.'
                    });
                }

                const [existingRole] = await pool.query(
                    `SELECT id FROM reaction_role_items WHERE guild_id = ? AND category_id = ? AND role_id = ? LIMIT 1`,
                    [guildId, category.id, role.id]
                );

                if (existingRole.length) {
                    return interaction.editReply({
                        content: '❌ That role is already in this category.'
                    });
                }

                await pool.query(
                    `
                    INSERT INTO reaction_role_items
                    (guild_id, category_id, role_id, emoji_key, emoji_display, label)
                    VALUES (?, ?, ?, ?, ?, ?)
                    `,
                    [guildId, category.id, role.id, emojiKey, emojiDisplay, label]
                );

                return interaction.editReply({
                    content: `✅ Added ${emojiDisplay} → **${role.name}** to **${category.name}**.`
                });
            }

            if (sub === 'removerole') {
                const categoryName = interaction.options.getString('category', true).trim();
                const role = interaction.options.getRole('role', true);

                const category = await getCategoryByName(guildId, categoryName);
                if (!category) {
                    return interaction.editReply({
                        content: '❌ That category does not exist.'
                    });
                }

                const [result] = await pool.query(
                    `DELETE FROM reaction_role_items WHERE guild_id = ? AND category_id = ? AND role_id = ?`,
                    [guildId, category.id, role.id]
                );

                if (!result.affectedRows) {
                    return interaction.editReply({
                        content: '❌ That role is not in this category.'
                    });
                }

                return interaction.editReply({
                    content: `✅ Removed **${role.name}** from **${category.name}**.`
                });
            }

            if (sub === 'send') {
                const categoryName = interaction.options.getString('category', true).trim();
                const channel = interaction.options.getChannel('channel', true);

                const category = await getCategoryByName(guildId, categoryName);
                if (!category) {
                    return interaction.editReply({
                        content: '❌ That category does not exist.'
                    });
                }

                const [items] = await pool.query(
                    `SELECT * FROM reaction_role_items WHERE guild_id = ? AND category_id = ? ORDER BY id ASC`,
                    [guildId, category.id]
                );

                if (!items.length) {
                    return interaction.editReply({
                        content: '❌ That category has no roles yet. Add roles first.'
                    });
                }

                const panelMessage = await channel.send({
                    embeds: [buildReactionRoleEmbed(category, items, interaction.guild.name)]
                });

                await syncPanelReactions(panelMessage, items);

                await pool.query(
                    `
                    INSERT INTO reaction_role_messages (guild_id, category_id, channel_id, message_id)
                    VALUES (?, ?, ?, ?)
                    `,
                    [guildId, category.id, channel.id, panelMessage.id]
                );

                return interaction.editReply({
                    content: `✅ Reaction role panel sent in ${channel}.`
                });
            }

            if (sub === 'update') {
                const categoryName = interaction.options.getString('category', true).trim();

                const category = await getCategoryByName(guildId, categoryName);
                if (!category) {
                    return interaction.editReply({
                        content: '❌ That category does not exist.'
                    });
                }

                const [items] = await pool.query(
                    `SELECT * FROM reaction_role_items WHERE guild_id = ? AND category_id = ? ORDER BY id ASC`,
                    [guildId, category.id]
                );

                if (!items.length) {
                    return interaction.editReply({
                        content: '❌ That category has no roles yet. Add roles first.'
                    });
                }

                const [panels] = await pool.query(
                    `SELECT * FROM reaction_role_messages WHERE guild_id = ? AND category_id = ? ORDER BY id ASC`,
                    [guildId, category.id]
                );

                if (!panels.length) {
                    return interaction.editReply({
                        content: '❌ No sent panels exist for that category yet.'
                    });
                }

                let updatedCount = 0;
                let removedCount = 0;

                for (const panel of panels) {
                    try {
                        const channel = await interaction.guild.channels.fetch(panel.channel_id).catch(() => null);
                        if (!channel || !channel.isTextBased()) {
                            await pool.query(
                                `DELETE FROM reaction_role_messages WHERE id = ?`,
                                [panel.id]
                            );
                            removedCount++;
                            continue;
                        }

                        const message = await channel.messages.fetch(panel.message_id).catch(() => null);
                        if (!message) {
                            await pool.query(
                                `DELETE FROM reaction_role_messages WHERE id = ?`,
                                [panel.id]
                            );
                            removedCount++;
                            continue;
                        }

                        await message.edit({
                            embeds: [buildReactionRoleEmbed(category, items, interaction.guild.name)]
                        });

                        await syncPanelReactions(message, items);
                        updatedCount++;
                    } catch (error) {
                        console.error(`Failed to update reaction role panel ${panel.message_id}:`, error);
                    }
                }

                return interaction.editReply({
                    content: `✅ Updated **${updatedCount}** panel(s) for **${category.name}**.${removedCount ? ` Removed **${removedCount}** stale panel record(s).` : ''}`
                });
            }

            if (sub === 'list') {
                const [categories] = await pool.query(
                    `SELECT * FROM reaction_role_categories WHERE guild_id = ? ORDER BY name ASC`,
                    [guildId]
                );

                if (!categories.length) {
                    return interaction.editReply({
                        content: '❌ No reaction role categories exist yet.'
                    });
                }

                const fields = [];

                for (const category of categories) {
                    const [items] = await pool.query(
                        `SELECT * FROM reaction_role_items WHERE guild_id = ? AND category_id = ? ORDER BY id ASC`,
                        [guildId, category.id]
                    );

                    fields.push({
                        name: `📂 ${category.name} (${category.mode === 'single' ? 'Single' : 'Multi'})`,
                        value: items.length
                            ? items.map(item => `${item.emoji_display} → <@&${item.role_id}>`).join('\n')
                            : 'No roles added yet.'
                    });
                }

                const embed = new EmbedBuilder()
                    .setTitle('🎭 Reaction Role Categories')
                    .setColor('#00bfff')
                    .addFields(fields)
                    .setTimestamp();

                return interaction.editReply({
                    embeds: [embed]
                });
            }

            if (sub === 'deletecategory') {
                const categoryName = interaction.options.getString('category', true).trim();

                const category = await getCategoryByName(guildId, categoryName);
                if (!category) {
                    return interaction.editReply({
                        content: '❌ That category does not exist.'
                    });
                }

                await pool.query(
                    `DELETE FROM reaction_role_messages WHERE guild_id = ? AND category_id = ?`,
                    [guildId, category.id]
                );

                await pool.query(
                    `DELETE FROM reaction_role_items WHERE guild_id = ? AND category_id = ?`,
                    [guildId, category.id]
                );

                await pool.query(
                    `DELETE FROM reaction_role_categories WHERE guild_id = ? AND id = ?`,
                    [guildId, category.id]
                );

                return interaction.editReply({
                    content: `✅ Deleted category **${category.name}** and all of its reaction roles.`
                });
            }

            return interaction.editReply({
                content: '❌ Unknown subcommand.'
            });
        } catch (error) {
            console.error('Reaction role command error:', error);

            return interaction.editReply({
                content: '❌ Something went wrong while running that command.'
            });
        }
    }
};