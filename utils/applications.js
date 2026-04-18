const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { pool } = require('../database');

async function getApplicationSettings(guildId) {
    const [rows] = await pool.query(
        `SELECT panel_channel_id, review_channel_id, accepted_role_id
         FROM application_settings
         WHERE guild_id = ?
         LIMIT 1`,
        [guildId]
    );

    return rows[0] || null;
}

function buildApplicationButtons(applicationId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`application_accept_${applicationId}`)
            .setLabel('Accept')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`application_deny_${applicationId}`)
            .setLabel('Deny')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    );
}

async function handleCreateApplication(interaction) {
    const settings = await getApplicationSettings(interaction.guild.id);

    if (!settings?.review_channel_id) {
        return interaction.reply({
            content: '❌ The applications system is not configured yet.',
            ephemeral: true
        });
    }

    const [pendingRows] = await pool.query(
        `SELECT id
         FROM applications
         WHERE guild_id = ? AND user_id = ? AND status = 'pending'
         LIMIT 1`,
        [interaction.guild.id, interaction.user.id]
    );

    if (pendingRows.length) {
        return interaction.reply({
            content: '❌ You already have a pending application.',
            ephemeral: true
        });
    }

    const modal = new ModalBuilder()
        .setCustomId('application_modal')
        .setTitle('Submit Application');

    const q1 = new TextInputBuilder()
        .setCustomId('age')
        .setLabel('How old are you?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);

    const q2 = new TextInputBuilder()
        .setCustomId('experience')
        .setLabel('What experience do you have?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

    const q3 = new TextInputBuilder()
        .setCustomId('why')
        .setLabel('Why do you want this position?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

    const q4 = new TextInputBuilder()
        .setCustomId('activity')
        .setLabel('How active can you be?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

    const q5 = new TextInputBuilder()
        .setCustomId('extra')
        .setLabel('Anything else staff should know?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(1000);

    modal.addComponents(
        new ActionRowBuilder().addComponents(q1),
        new ActionRowBuilder().addComponents(q2),
        new ActionRowBuilder().addComponents(q3),
        new ActionRowBuilder().addComponents(q4),
        new ActionRowBuilder().addComponents(q5)
    );

    return interaction.showModal(modal);
}

async function handleApplicationModal(interaction) {
    const settings = await getApplicationSettings(interaction.guild.id);

    if (!settings?.review_channel_id) {
        return interaction.reply({
            content: '❌ The applications system is not configured yet.',
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    const [pendingRows] = await pool.query(
        `SELECT id
         FROM applications
         WHERE guild_id = ? AND user_id = ? AND status = 'pending'
         LIMIT 1`,
        [interaction.guild.id, interaction.user.id]
    );

    if (pendingRows.length) {
        return interaction.editReply({
            content: '❌ You already have a pending application.'
        });
    }

    const answers = {
        age: interaction.fields.getTextInputValue('age'),
        experience: interaction.fields.getTextInputValue('experience'),
        why: interaction.fields.getTextInputValue('why'),
        activity: interaction.fields.getTextInputValue('activity'),
        extra: interaction.fields.getTextInputValue('extra') || 'No extra information provided.'
    };

    const [insertResult] = await pool.query(
        `INSERT INTO applications
            (guild_id, user_id, status, answers_json, submitted_at)
         VALUES (?, ?, 'pending', ?, ?)`,
        [
            interaction.guild.id,
            interaction.user.id,
            JSON.stringify(answers),
            Date.now()
        ]
    );

    const applicationId = insertResult.insertId;

    const reviewChannel =
        interaction.guild.channels.cache.get(settings.review_channel_id) ||
        await interaction.guild.channels.fetch(settings.review_channel_id).catch(() => null);

    if (!reviewChannel) {
        return interaction.editReply({
            content: '❌ The configured review channel could not be found.'
        });
    }

    const embed = new EmbedBuilder()
        .setAuthor({
            name: '📝 New Application Submitted',
            iconURL: interaction.user.displayAvatarURL({ dynamic: true })
        })
        .setColor('#00bfff')
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            {
                name: '👤 Applicant',
                value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                inline: true
            },
            {
                name: '🆔 Application ID',
                value: `#${applicationId}`,
                inline: true
            },
            {
                name: '📅 Submitted',
                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                inline: true
            },
            {
                name: '1️⃣ Age',
                value: `> ${answers.age}`,
                inline: false
            },
            {
                name: '2️⃣ Experience',
                value: `> ${answers.experience}`,
                inline: false
            },
            {
                name: '3️⃣ Why do you want this position?',
                value: `> ${answers.why}`,
                inline: false
            },
            {
                name: '4️⃣ Activity',
                value: `> ${answers.activity}`,
                inline: false
            },
            {
                name: '5️⃣ Extra',
                value: `> ${answers.extra}`,
                inline: false
            }
        )
        .setFooter({ text: 'Infinity Applications' })
        .setTimestamp();

    await reviewChannel.send({
        embeds: [embed],
        components: [buildApplicationButtons(applicationId)]
    });

    return interaction.editReply({
        content: '✅ Your application has been submitted successfully.'
    });
}

async function handleAcceptApplication(interaction, applicationId) {
    if (
        !interaction.member.permissions.has('Administrator') &&
        !interaction.member.permissions.has('ManageGuild')
    ) {
        return interaction.reply({
            content: '❌ Only staff can review applications.',
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    const [rows] = await pool.query(
        `SELECT *
         FROM applications
         WHERE guild_id = ? AND id = ?
         LIMIT 1`,
        [interaction.guild.id, applicationId]
    );

    const application = rows[0];
    if (!application) {
        return interaction.editReply({
            content: '❌ Application not found.'
        });
    }

    if (application.status !== 'pending') {
        return interaction.editReply({
            content: `❌ This application has already been ${application.status}.`
        });
    }

    await pool.query(
        `UPDATE applications
         SET status = 'accepted',
             reviewed_at = ?,
             reviewed_by = ?
         WHERE id = ?`,
        [Date.now(), interaction.user.id, application.id]
    );

    const settings = await getApplicationSettings(interaction.guild.id);
    const member = await interaction.guild.members.fetch(application.user_id).catch(() => null);

    if (member && settings?.accepted_role_id) {
        const role = interaction.guild.roles.cache.get(settings.accepted_role_id);
        if (role) {
            await member.roles.add(role).catch(() => null);
        }
    }

    const applicantUser = await interaction.client.users.fetch(application.user_id).catch(() => null);

    if (applicantUser) {
        const dmEmbed = new EmbedBuilder()
            .setAuthor({
                name: '✅ Application Accepted',
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
            })
            .setColor('#00ff88')
            .setDescription(
                `Congratulations! Your application for **${interaction.guild.name}** has been accepted.`
            )
            .setFooter({ text: 'Infinity Applications' })
            .setTimestamp();

        await applicantUser.send({ embeds: [dmEmbed] }).catch(() => null);
    }

    const resultEmbed = new EmbedBuilder()
        .setAuthor({
            name: '✅ Application Accepted',
            iconURL: interaction.user.displayAvatarURL({ dynamic: true })
        })
        .setColor('#00ff88')
        .setDescription(`${interaction.user} accepted this application.`)
        .setFooter({ text: 'Infinity Applications' })
        .setTimestamp();

    await interaction.message.edit({
        embeds: [interaction.message.embeds[0], resultEmbed],
        components: []
    });

    return interaction.editReply({
        content: `✅ Application #${application.id} accepted.`
    });
}

async function handleDenyApplication(interaction, applicationId) {
    if (
        !interaction.member.permissions.has('Administrator') &&
        !interaction.member.permissions.has('ManageGuild')
    ) {
        return interaction.reply({
            content: '❌ Only staff can review applications.',
            ephemeral: true
        });
    }

    const modal = new ModalBuilder()
        .setCustomId(`application_deny_modal_${applicationId}`)
        .setTitle('Deny Application');

    const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Why are you denying this application?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

    modal.addComponents(
        new ActionRowBuilder().addComponents(reasonInput)
    );

    return interaction.showModal(modal);
}

async function handleDenyApplicationModal(interaction, applicationId) {
    await interaction.deferReply({ ephemeral: true });

    const [rows] = await pool.query(
        `SELECT *
         FROM applications
         WHERE guild_id = ? AND id = ?
         LIMIT 1`,
        [interaction.guild.id, applicationId]
    );

    const application = rows[0];
    if (!application) {
        return interaction.editReply({
            content: '❌ Application not found.'
        });
    }

    if (application.status !== 'pending') {
        return interaction.editReply({
            content: `❌ This application has already been ${application.status}.`
        });
    }

    const reason = interaction.fields.getTextInputValue('reason');

    await pool.query(
        `UPDATE applications
         SET status = 'denied',
             reviewed_at = ?,
             reviewed_by = ?,
             decision_reason = ?
         WHERE id = ?`,
        [Date.now(), interaction.user.id, reason, application.id]
    );

    const applicantUser = await interaction.client.users.fetch(application.user_id).catch(() => null);

    if (applicantUser) {
        const dmEmbed = new EmbedBuilder()
            .setAuthor({
                name: '❌ Application Denied',
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
            })
            .setColor('#ff4d4d')
            .addFields(
                {
                    name: '📄 Reason',
                    value: `> ${reason}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Applications' })
            .setTimestamp();

        await applicantUser.send({ embeds: [dmEmbed] }).catch(() => null);
    }

    const resultEmbed = new EmbedBuilder()
        .setAuthor({
            name: '❌ Application Denied',
            iconURL: interaction.user.displayAvatarURL({ dynamic: true })
        })
        .setColor('#ff4d4d')
        .addFields(
            {
                name: 'Denied By',
                value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                inline: true
            },
            {
                name: 'Reason',
                value: `> ${reason}`,
                inline: false
            }
        )
        .setFooter({ text: 'Infinity Applications' })
        .setTimestamp();

    await interaction.channel.messages.fetch(interaction.message.id).catch(() => null);
    await interaction.message.edit({
        embeds: [interaction.message.embeds[0], resultEmbed],
        components: []
    });

    return interaction.editReply({
        content: `✅ Application #${application.id} denied.`
    });
}

module.exports = {
    handleCreateApplication,
    handleApplicationModal,
    handleAcceptApplication,
    handleDenyApplication,
    handleDenyApplicationModal
};