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

const BRAND_COLOR = '#00bfff';
const ERROR_COLOR = '#ff4d4d';
const SUCCESS_COLOR = '#57f287';
const WARNING_COLOR = '#facc15';
const MAX_ROLES_PER_CATEGORY = 20;

function cleanText(value, fallback = '') {
    return String(value || fallback).trim();
}

function truncate(value, max = 1024) {
    const text = String(value || '');
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function successEmbed(description) {
    return new EmbedBuilder()
        .setColor(SUCCESS_COLOR)
        .setDescription(description)
        .setTimestamp();
}

function errorEmbed(description) {
    return new EmbedBuilder()
        .setColor(ERROR_COLOR)
        .setDescription(description)
        .setTimestamp();
}

function infoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(BRAND_COLOR)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
}

async function getItems(guildId, categoryId) {
    const [items] = await pool.query(
        `SELECT * FROM reaction_role_items WHERE guild_id = ? AND category_id = ? ORDER BY id ASC`,
        [guildId, categoryId]
    );

    return items;
}

async function getPanels(guildId, categoryId) {
    const [panels] = await pool.query(
        `SELECT * FROM reaction_role_messages WHERE guild_id = ? AND category_id = ? ORDER BY id ASC`,
        [guildId, categoryId]
    );

    return panels;
}

async function validateRole(interaction, role) {
    const botMember = await interaction.guild.members.fetchMe();

    if (role.managed) {
        return 'That role is managed by an integration or bot and cannot be used.';
    }

    if (role.id === interaction.guild.id) {
        return 'The @everyone role cannot be used as a reaction role.';
    }

    if (role.position >= botMember.roles.highest.position) {
        return 'That role is higher than or equal to my highest role. Move my role above it first.';
    }

    if (interaction.member?.roles?.highest && role.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
        return 'You cannot add a role that is higher than or equal to your highest role.';
    }

    return null;
}

async function updateCategoryPanels(interaction, category, items) {
    const guildId = interaction.guild.id;
    const panels = await getPanels(guildId, category.id);

    let updatedCount = 0;
    let removedCount = 0;
    const failed = [];

    for (const panel of panels) {
        try {
            const channel = await interaction.guild.channels.fetch(panel.channel_id).catch(() => null);

            if (!channel || !channel.isTextBased()) {
                await pool.query(`DELETE FROM reaction_role_messages WHERE id = ?`, [panel.id]);
                removedCount++;
                continue;
            }

            const message = await channel.messages.fetch(panel.message_id).catch(() => null);

            if (!message) {
                await pool.query(`DELETE FROM reaction_role_messages WHERE id = ?`, [panel.id]);
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
            failed.push(panel.message_id);
        }
    }

    return { updatedCount, removedCount, failedCount: failed.length };
}

async function refreshPanelsIfAny(interaction, category) {
    const items = await getItems(interaction.guild.id, category.id);
    const panels = await getPanels(interaction.guild.id, category.id);

    if (!panels.length || !items.length) {
        return null;
    }

    return updateCategoryPanels(interaction, category, items);
}

function buildCategorySummaryEmbed(guild, category, items, panels = []) {
    const rolesText = items.length
        ? items.map((item, index) => {
            const role = guild.roles.cache.get(item.role_id);
            const roleText = role ? `<@&${role.id}>` : `Deleted Role (${item.role_id})`;
            return `**${index + 1}.** ${item.emoji_display} ${roleText}\n> Label: **${item.label || role?.name || 'Unknown'}**`;
        }).join('\n')
        : 'No roles have been added yet.';

    const panelText = panels.length
        ? panels.map((panel, index) => `**${index + 1}.** <#${panel.channel_id}> • \`${panel.message_id}\``).join('\n')
        : 'No panels have been sent yet.';

    return new EmbedBuilder()
        .setColor(BRAND_COLOR)
        .setTitle(`🎭 ${category.name}`)
        .setDescription(truncate(category.description || 'No description set.', 3500))
        .addFields(
            {
                name: 'Selection Mode',
                value: category.mode === 'single' ? 'Single Select — one role at a time' : 'Multi Select — users can pick multiple roles',
                inline: false
            },
            {
                name: `Role Options (${items.length}/${MAX_ROLES_PER_CATEGORY})`,
                value: truncate(rolesText, 1024),
                inline: false
            },
            {
                name: `Sent Panels (${panels.length})`,
                value: truncate(panelText, 1024),
                inline: false
            }
        )
        .setFooter({ text: `${guild.name} • Reaction Roles` })
        .setTimestamp();
}

function buildAllCategoriesEmbed(categoriesWithItems) {
    const embed = new EmbedBuilder()
        .setColor(BRAND_COLOR)
        .setTitle('🎭 Reaction Role System')
        .setDescription('Here are all configured reaction role categories for this server.')
        .setTimestamp();

    for (const entry of categoriesWithItems.slice(0, 25)) {
        const { category, items, panelCount } = entry;
        const rolePreview = items.length
            ? items.slice(0, 8).map(item => `${item.emoji_display} <@&${item.role_id}>`).join('\n')
            : 'No roles added yet.';

        embed.addFields({
            name: `📂 ${category.name}`,
            value: truncate([
                `**Mode:** ${category.mode === 'single' ? 'Single Select' : 'Multi Select'}`,
                `**Roles:** ${items.length}/${MAX_ROLES_PER_CATEGORY}`,
                `**Panels:** ${panelCount}`,
                rolePreview,
                items.length > 8 ? `+${items.length - 8} more role(s)` : null
            ].filter(Boolean).join('\n'), 1024),
            inline: false
        });
    }

    return embed;
}

module.exports = {
    name: 'reactionrole',
    description: 'Create, manage, update, and send premium reaction role panels.',
    usage: '/reactionrole createcategory | editcategory | addrole | removerole | send | update | preview | info | list | clear | deletecategory',
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
                        .setMaxLength(80)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('Description shown in the panel')
                        .setMaxLength(1000)
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
                .setName('editcategory')
                .setDescription('Edit a reaction role category')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Current category name')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('New category name')
                        .setMaxLength(80)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('New category description')
                        .setMaxLength(1000)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('mode')
                        .setDescription('New selection mode')
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
                        .setMaxLength(80)
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
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
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
                .setName('preview')
                .setDescription('Preview a reaction role panel without sending it publicly')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Category name')
                        .setRequired(true)
                )
        )

        .addSubcommand(sub =>
            sub
                .setName('info')
                .setDescription('View detailed info for one reaction role category')
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
                .setName('clear')
                .setDescription('Remove every role option from a category but keep the category')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Category name')
                        .setRequired(true)
                )
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
                const name = cleanText(interaction.options.getString('name', true));
                const description = cleanText(interaction.options.getString('description'), 'React below to choose your role.');
                const mode = interaction.options.getString('mode') || 'multi';

                const existing = await getCategoryByName(guildId, name);
                if (existing) {
                    return interaction.editReply({ embeds: [errorEmbed('A reaction role category with that name already exists.')] });
                }

                await pool.query(
                    `INSERT INTO reaction_role_categories (guild_id, name, description, mode) VALUES (?, ?, ?, ?)`,
                    [guildId, name, description, mode]
                );

                return interaction.editReply({
                    embeds: [successEmbed(`Created reaction role category **${name}**.\n**Mode:** ${mode === 'single' ? 'Single Select' : 'Multi Select'}`)]
                });
            }

            if (sub === 'editcategory') {
                const categoryName = cleanText(interaction.options.getString('category', true));
                const newName = interaction.options.getString('name')?.trim();
                const newDescription = interaction.options.getString('description')?.trim();
                const newMode = interaction.options.getString('mode');

                const category = await getCategoryByName(guildId, categoryName);
                if (!category) {
                    return interaction.editReply({ embeds: [errorEmbed('That category does not exist.')] });
                }

                if (!newName && !newDescription && !newMode) {
                    return interaction.editReply({ embeds: [errorEmbed('Give me at least one thing to update: name, description, or mode.')] });
                }

                if (newName && newName.toLowerCase() !== category.name.toLowerCase()) {
                    const existing = await getCategoryByName(guildId, newName);
                    if (existing) {
                        return interaction.editReply({ embeds: [errorEmbed('Another category already uses that name.')] });
                    }
                }

                await pool.query(
                    `UPDATE reaction_role_categories SET name = ?, description = ?, mode = ? WHERE guild_id = ? AND id = ?`,
                    [newName || category.name, newDescription || category.description, newMode || category.mode, guildId, category.id]
                );

                const updatedCategory = {
                    ...category,
                    name: newName || category.name,
                    description: newDescription || category.description,
                    mode: newMode || category.mode
                };

                const panelResult = await refreshPanelsIfAny(interaction, updatedCategory);

                return interaction.editReply({
                    embeds: [successEmbed([
                        `Updated category **${updatedCategory.name}**.`,
                        panelResult ? `Refreshed **${panelResult.updatedCount}** panel(s).` : null
                    ].filter(Boolean).join('\n'))]
                });
            }

            if (sub === 'addrole') {
                const categoryName = cleanText(interaction.options.getString('category', true));
                const role = interaction.options.getRole('role', true);
                const emojiInput = interaction.options.getString('emoji', true);
                const label = cleanText(interaction.options.getString('label'), role.name);

                const category = await getCategoryByName(guildId, categoryName);
                if (!category) {
                    return interaction.editReply({ embeds: [errorEmbed('That category does not exist.')] });
                }

                const items = await getItems(guildId, category.id);
                if (items.length >= MAX_ROLES_PER_CATEGORY) {
                    return interaction.editReply({ embeds: [errorEmbed(`That category already has the max of **${MAX_ROLES_PER_CATEGORY}** role options.`)] });
                }

                const roleError = await validateRole(interaction, role);
                if (roleError) {
                    return interaction.editReply({ embeds: [errorEmbed(roleError)] });
                }

                let parsedEmoji;
                try {
                    parsedEmoji = await parseEmojiInput(emojiInput, interaction.guild);
                } catch (error) {
                    return interaction.editReply({ embeds: [errorEmbed('That emoji could not be used. Try a normal emoji like 🎮 or a full custom emoji like `<:Xbox:123456789>`.')] });
                }

                const { emojiKey, emojiDisplay } = parsedEmoji;

                const [existingEmoji] = await pool.query(
                    `SELECT id FROM reaction_role_items WHERE guild_id = ? AND category_id = ? AND emoji_key = ? LIMIT 1`,
                    [guildId, category.id, emojiKey]
                );

                if (existingEmoji.length) {
                    return interaction.editReply({ embeds: [errorEmbed('That emoji is already being used in this category.')] });
                }

                const [existingRole] = await pool.query(
                    `SELECT id FROM reaction_role_items WHERE guild_id = ? AND category_id = ? AND role_id = ? LIMIT 1`,
                    [guildId, category.id, role.id]
                );

                if (existingRole.length) {
                    return interaction.editReply({ embeds: [errorEmbed('That role is already in this category.')] });
                }

                await pool.query(
                    `
                    INSERT INTO reaction_role_items
                    (guild_id, category_id, role_id, emoji_key, emoji_display, label)
                    VALUES (?, ?, ?, ?, ?, ?)
                    `,
                    [guildId, category.id, role.id, emojiKey, emojiDisplay, label]
                );

                const panelResult = await refreshPanelsIfAny(interaction, category);

                return interaction.editReply({
                    embeds: [successEmbed([
                        `Added ${emojiDisplay} → ${role} to **${category.name}**.`,
                        `**Label:** ${label}`,
                        panelResult ? `Refreshed **${panelResult.updatedCount}** existing panel(s).` : null
                    ].filter(Boolean).join('\n'))]
                });
            }

            if (sub === 'removerole') {
                const categoryName = cleanText(interaction.options.getString('category', true));
                const role = interaction.options.getRole('role', true);

                const category = await getCategoryByName(guildId, categoryName);
                if (!category) {
                    return interaction.editReply({ embeds: [errorEmbed('That category does not exist.')] });
                }

                const [result] = await pool.query(
                    `DELETE FROM reaction_role_items WHERE guild_id = ? AND category_id = ? AND role_id = ?`,
                    [guildId, category.id, role.id]
                );

                if (!result.affectedRows) {
                    return interaction.editReply({ embeds: [errorEmbed('That role is not in this category.')] });
                }

                const panelResult = await refreshPanelsIfAny(interaction, category);

                return interaction.editReply({
                    embeds: [successEmbed([
                        `Removed ${role} from **${category.name}**.`,
                        panelResult ? `Refreshed **${panelResult.updatedCount}** existing panel(s).` : null
                    ].filter(Boolean).join('\n'))]
                });
            }

            if (sub === 'send') {
                const categoryName = cleanText(interaction.options.getString('category', true));
                const channel = interaction.options.getChannel('channel', true);

                const category = await getCategoryByName(guildId, categoryName);
                if (!category) {
                    return interaction.editReply({ embeds: [errorEmbed('That category does not exist.')] });
                }

                const items = await getItems(guildId, category.id);
                if (!items.length) {
                    return interaction.editReply({ embeds: [errorEmbed('That category has no roles yet. Add roles first.')] });
                }

                const permissions = channel.permissionsFor(interaction.guild.members.me);
                if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions?.has(PermissionFlagsBits.SendMessages) || !permissions?.has(PermissionFlagsBits.AddReactions) || !permissions?.has(PermissionFlagsBits.ReadMessageHistory)) {
                    return interaction.editReply({
                        embeds: [errorEmbed(`I need **View Channel**, **Send Messages**, **Add Reactions**, and **Read Message History** in ${channel}.`)]
                    });
                }

                const panelMessage = await channel.send({
                    embeds: [buildReactionRoleEmbed(category, items, interaction.guild.name)]
                });

                await syncPanelReactions(panelMessage, items);

                await pool.query(
                    `INSERT INTO reaction_role_messages (guild_id, category_id, channel_id, message_id) VALUES (?, ?, ?, ?)`,
                    [guildId, category.id, channel.id, panelMessage.id]
                );

                return interaction.editReply({
                    embeds: [successEmbed(`Reaction role panel sent in ${channel}.\n[Jump to panel](${panelMessage.url})`)]
                });
            }

            if (sub === 'update') {
                const categoryName = cleanText(interaction.options.getString('category', true));

                const category = await getCategoryByName(guildId, categoryName);
                if (!category) {
                    return interaction.editReply({ embeds: [errorEmbed('That category does not exist.')] });
                }

                const items = await getItems(guildId, category.id);
                if (!items.length) {
                    return interaction.editReply({ embeds: [errorEmbed('That category has no roles yet. Add roles first.')] });
                }

                const panels = await getPanels(guildId, category.id);
                if (!panels.length) {
                    return interaction.editReply({ embeds: [errorEmbed('No sent panels exist for that category yet.')] });
                }

                const result = await updateCategoryPanels(interaction, category, items);

                return interaction.editReply({
                    embeds: [successEmbed([
                        `Updated **${result.updatedCount}** panel(s) for **${category.name}**.`,
                        result.removedCount ? `Removed **${result.removedCount}** stale panel record(s).` : null,
                        result.failedCount ? `Failed to update **${result.failedCount}** panel(s). Check console logs.` : null
                    ].filter(Boolean).join('\n'))]
                });
            }

            if (sub === 'preview') {
                const categoryName = cleanText(interaction.options.getString('category', true));

                const category = await getCategoryByName(guildId, categoryName);
                if (!category) {
                    return interaction.editReply({ embeds: [errorEmbed('That category does not exist.')] });
                }

                const items = await getItems(guildId, category.id);
                if (!items.length) {
                    return interaction.editReply({ embeds: [errorEmbed('That category has no roles yet. Add roles first.')] });
                }

                return interaction.editReply({
                    content: 'Here is a private preview of the reaction role panel:',
                    embeds: [buildReactionRoleEmbed(category, items, interaction.guild.name)]
                });
            }

            if (sub === 'info') {
                const categoryName = cleanText(interaction.options.getString('category', true));

                const category = await getCategoryByName(guildId, categoryName);
                if (!category) {
                    return interaction.editReply({ embeds: [errorEmbed('That category does not exist.')] });
                }

                const items = await getItems(guildId, category.id);
                const panels = await getPanels(guildId, category.id);

                return interaction.editReply({
                    embeds: [buildCategorySummaryEmbed(interaction.guild, category, items, panels)]
                });
            }

            if (sub === 'list') {
                const [categories] = await pool.query(
                    `SELECT * FROM reaction_role_categories WHERE guild_id = ? ORDER BY name ASC`,
                    [guildId]
                );

                if (!categories.length) {
                    return interaction.editReply({ embeds: [errorEmbed('No reaction role categories exist yet. Use `/reactionrole createcategory` to make one.')] });
                }

                const categoriesWithItems = [];

                for (const category of categories) {
                    const items = await getItems(guildId, category.id);
                    const panels = await getPanels(guildId, category.id);
                    categoriesWithItems.push({ category, items, panelCount: panels.length });
                }

                return interaction.editReply({
                    embeds: [buildAllCategoriesEmbed(categoriesWithItems)]
                });
            }

            if (sub === 'clear') {
                const categoryName = cleanText(interaction.options.getString('category', true));

                const category = await getCategoryByName(guildId, categoryName);
                if (!category) {
                    return interaction.editReply({ embeds: [errorEmbed('That category does not exist.')] });
                }

                const [result] = await pool.query(
                    `DELETE FROM reaction_role_items WHERE guild_id = ? AND category_id = ?`,
                    [guildId, category.id]
                );

                const panels = await getPanels(guildId, category.id);
                for (const panel of panels) {
                    try {
                        const channel = await interaction.guild.channels.fetch(panel.channel_id).catch(() => null);
                        const message = channel?.isTextBased() ? await channel.messages.fetch(panel.message_id).catch(() => null) : null;
                        if (message) {
                            await message.edit({ embeds: [infoEmbed(`🎭 ${category.name}`, 'This reaction role category has no role options configured yet.')] });
                            await message.reactions.removeAll().catch(() => null);
                        }
                    } catch (error) {
                        console.error(`Failed to clear reaction role panel ${panel.message_id}:`, error);
                    }
                }

                return interaction.editReply({
                    embeds: [successEmbed(`Cleared **${result.affectedRows}** role option(s) from **${category.name}**.`)]
                });
            }

            if (sub === 'deletecategory') {
                const categoryName = cleanText(interaction.options.getString('category', true));

                const category = await getCategoryByName(guildId, categoryName);
                if (!category) {
                    return interaction.editReply({ embeds: [errorEmbed('That category does not exist.')] });
                }

                await pool.query(`DELETE FROM reaction_role_messages WHERE guild_id = ? AND category_id = ?`, [guildId, category.id]);
                await pool.query(`DELETE FROM reaction_role_items WHERE guild_id = ? AND category_id = ?`, [guildId, category.id]);
                await pool.query(`DELETE FROM reaction_role_categories WHERE guild_id = ? AND id = ?`, [guildId, category.id]);

                return interaction.editReply({
                    embeds: [successEmbed(`Deleted category **${category.name}** and all of its reaction roles.`)]
                });
            }

            return interaction.editReply({ embeds: [errorEmbed('Unknown subcommand.')] });
        } catch (error) {
            console.error('Reaction role command error:', error);

            const message = interaction.deferred || interaction.replied
                ? interaction.editReply
                : interaction.reply;

            return message.call(interaction, {
                embeds: [errorEmbed('Something went wrong while running that command.')],
                flags: MessageFlags.Ephemeral
            }).catch(() => null);
        }
    }
};
