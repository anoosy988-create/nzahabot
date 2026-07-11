// MTX Bot - Ticket System Only
// Clean, minimal, human-like code

const {
    Client, GatewayIntentBits, Partials, PermissionsBitField,
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    SlashCommandBuilder, ChannelType
} = require('discord.js');
const http = require('http');

const { ConfigDB, TicketDB } = require('./database.js');

const COLORS = {
    SUCCESS: 0x2ecc71,
    ERROR: 0xe74c3c,
    INFO: 0x3498db,
    WARN: 0xf39c12
};

// ─────────────────────────────────────────────────────────────
// Embed Helpers
// ─────────────────────────────────────────────────────────────

function successEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setColor(COLORS.SUCCESS)
        .setTimestamp()
        .setFooter({ text: 'MTX Bot' });
}

function errorEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setColor(COLORS.ERROR)
        .setTimestamp()
        .setFooter({ text: 'MTX Bot' });
}

function infoEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`ℹ️ ${title}`)
        .setDescription(description)
        .setColor(COLORS.INFO)
        .setTimestamp()
        .setFooter({ text: 'MTX Bot' });
}

// ─────────────────────────────────────────────────────────────
// Ticket System
// ─────────────────────────────────────────────────────────────

class TicketSystem {
    constructor() {
        this.tickets = new Map();
        this.configs = new Map();
        this.counters = {};
    }

    async load() {
        this.tickets = await TicketDB.getAll();
        this.counters = await TicketDB.getCounters();
        console.log(`[MTX] Loaded ${this.tickets.size} tickets`);
    }

    async getConfig(guildId) {
        if (!this.configs.has(guildId)) {
            this.configs.set(guildId, await ConfigDB.getTicketConfig(guildId));
        }
        return this.configs.get(guildId);
    }

    refreshConfig(guildId, config) {
        this.configs.set(guildId, config);
    }

    getOptions(guildId) {
        return this.configs.get(guildId)?.ticketOptions || [];
    }

    generateValue(label) {
        return label.trim().replace(/\s+/g, '_');
    }
}

// ─────────────────────────────────────────────────────────────
// Main Bot
// ─────────────────────────────────────────────────────────────

class MTXBot extends Client {
    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.MessageContent
            ],
            partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
        });

        this.ticketSystem = new TicketSystem();
        this.setupEvents();
    }

    setupEvents() {
        this.once('ready', () => this.onReady());
        this.on('interactionCreate', i => this.onInteraction(i));
    }

    async onReady() {
        console.log(`
    ╔═══════════════════════════════════════════════════╗
    ║                                                   ║
    ║        🤖 MTX BOT - Ticket System Only            ║
    ║        MongoDB Atlas Persistent Storage           ║
    ║        Servers: ${this.guilds.cache.size.toString().padEnd(36)}║
    ║                                                   ║
    ╚═══════════════════════════════════════════════════╝
        `);

        await this.user.setPresence({
            activities: [{ name: '🎫 Ticket System', type: 3 }],
            status: 'online'
        });

        await this.ticketSystem.load();
        await this.registerSlashCommands();
    }

    async registerSlashCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('setup-ticket')
                .setDescription('إعداد نظام التكتات')
                .addChannelOption(o => o
                    .setName('logs')
                    .setDescription('قناة اللوقات')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText))
                .addChannelOption(o => o
                    .setName('category')
                    .setDescription('كاتقوري التكتات')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildCategory))
                .addRoleOption(o => o
                    .setName('role')
                    .setDescription('رتبة المشرفين')
                    .setRequired(true)),

            new SlashCommandBuilder()
                .setName('ticket-panel')
                .setDescription('إنشاء لوحة التكتات'),

            new SlashCommandBuilder()
                .setName('add-option')
                .setDescription('إضافة خيار للتكتات')
                .addStringOption(o => o
                    .setName('label')
                    .setDescription('اسم الخيار')
                    .setRequired(true)),

            new SlashCommandBuilder()
                .setName('remove-option')
                .setDescription('حذف خيار')
                .addStringOption(o => o
                    .setName('label')
                    .setDescription('اسم الخيار')
                    .setRequired(true)),

            new SlashCommandBuilder()
                .setName('list-options')
                .setDescription('عرض الخيارات الحالية'),

            new SlashCommandBuilder()
                .setName('status')
                .setDescription('حالة البوت')
        ];

        try {
            await this.application.commands.set(commands);
            console.log('[MTX] Slash commands registered');
        } catch (err) {
            console.error('[MTX] Failed to register slash commands:', err);
        }
    }

    // ─────────────────────────────────────────────────────────
    // Interaction Handler
    // ─────────────────────────────────────────────────────────

    async onInteraction(interaction) {
        const guildId = interaction.guildId;
        const ts = this.ticketSystem;

        // Slash Commands
        if (interaction.isCommand()) {
            const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
            if (!isAdmin) {
                return interaction.reply({ content: '❌ تحتاج صلاحية Administrator', ephemeral: true });
            }

            switch (interaction.commandName) {
                case 'setup-ticket':
                    await this.handleSetupTicket(interaction, guildId, ts);
                    break;
                case 'ticket-panel':
                    await this.handleTicketPanel(interaction, guildId, ts);
                    break;
                case 'add-option':
                    await this.handleAddOption(interaction, guildId, ts);
                    break;
                case 'remove-option':
                    await this.handleRemoveOption(interaction, guildId, ts);
                    break;
                case 'list-options':
                    await this.handleListOptions(interaction, guildId, ts);
                    break;
                case 'status':
                    await this.handleStatus(interaction);
                    break;
            }
            return;
        }

        // Ticket Select Menu
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
            await this.handleTicketSelect(interaction, guildId, ts);
            return;
        }

        // Ticket Buttons
        if (interaction.isButton()) {
            await this.handleTicketButton(interaction, ts);
            return;
        }

        // Add User Modal
        if (interaction.isModalSubmit() && interaction.customId === 'adduser_modal') {
            await this.handleAddUserModal(interaction, ts);
        }
    }

    // ─────────────────────────────────────────────────────────
    // Slash Command Handlers
    // ─────────────────────────────────────────────────────────

    async handleSetupTicket(interaction, guildId, ts) {
        const logs = interaction.options.getChannel('logs');
        const category = interaction.options.getChannel('category');
        const role = interaction.options.getRole('role');

        await ConfigDB.setTicketConfig(guildId, {
            logsId: logs.id,
            categoryId: category.id,
            roleId: role.id
        });

        ts.refreshConfig(guildId, {
            logsId: logs.id,
            categoryId: category.id,
            roleId: role.id,
            ticketOptions: ts.getOptions(guildId)
        });

        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ تم إعداد نظام التكتات')
                .addFields(
                    { name: '📋 لوقات', value: `${logs}`, inline: true },
                    { name: '📁 كاتقوري', value: `${category}`, inline: true },
                    { name: '👮 رتبة', value: role.name, inline: true }
                )
                .setColor(0x00FF00)],
            ephemeral: true
        });
    }

    async handleTicketPanel(interaction, guildId, ts) {
        const config = await ts.getConfig(guildId);
        if (!config?.roleId) {
            return interaction.reply({ content: '❌ شغل /setup-ticket أول', ephemeral: true });
        }

        const options = ts.getOptions(guildId);
        if (options.length === 0) {
            return interaction.reply({ content: '❌ ما فيه خيارات! ضيف خيارات بـ /add-option', ephemeral: true });
        }

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket_select')
                .setPlaceholder('اختر نوع التكت...')
                .addOptions(options)
        );

        await interaction.channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('🎫 نظام التكتات')
                .setDescription('اختر من القائمة لفتح تكت')
                .setColor(0x00FF00)],
            components: [row]
        });

        return interaction.reply({ content: '✅ تم إنشاء اللوحة', ephemeral: true });
    }

    async handleAddOption(interaction, guildId, ts) {
        const label = interaction.options.getString('label');
        const value = ts.generateValue(label);

        const config = await ConfigDB.get(guildId);
        const currentOptions = config?.ticketOptions || [];

        if (currentOptions.length >= 25) {
            return interaction.reply({ content: '❌ الحد الأقصى 25 خيار', ephemeral: true });
        }
        if (currentOptions.find(o => o.value === value)) {
            return interaction.reply({ content: '❌ الخيار موجود مسبقاً', ephemeral: true });
        }

        await ConfigDB.addTicketOption(guildId, label, value);

        if (!ts.configs.has(guildId)) ts.configs.set(guildId, {});
        const cached = ts.configs.get(guildId);
        if (!cached.ticketOptions) cached.ticketOptions = [];
        cached.ticketOptions.push({ label, value });

        return interaction.reply({ content: `✅ تم إضافة **${label}**`, ephemeral: true });
    }

    async handleRemoveOption(interaction, guildId, ts) {
        const label = interaction.options.getString('label');
        const value = ts.generateValue(label);

        const config = await ConfigDB.get(guildId);
        if (!config?.ticketOptions?.length) {
            return interaction.reply({ content: '❌ ما فيه خيارات', ephemeral: true });
        }

        const optionToRemove = config.ticketOptions.find(
            o => o.label === label || o.value === value || o.value === label
        );

        if (!optionToRemove) {
            return interaction.reply({ content: `❌ الخيار "${label}" غير موجود`, ephemeral: true });
        }

        await ConfigDB.removeTicketOption(guildId, optionToRemove.value);

        const cached = ts.configs.get(guildId);
        if (cached?.ticketOptions) {
            cached.ticketOptions = cached.ticketOptions.filter(o => o.value !== optionToRemove.value);
        }

        return interaction.reply({ content: `✅ تم حذف **${optionToRemove.label}**`, ephemeral: true });
    }

    async handleListOptions(interaction, guildId, ts) {
        const config = await ConfigDB.get(guildId);
        const opts = config?.ticketOptions || [];

        if (opts.length === 0) {
            return interaction.reply({ content: '❌ ما فيه خيارات', ephemeral: true });
        }

        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📋 الخيارات الحالية')
                .setDescription(opts.map((o, i) => `${i + 1}. **${o.label}**`).join('\n'))
                .setFooter({ text: `${opts.length}/25` })
                .setColor(0x0099FF)],
            ephemeral: true
        });
    }

    async handleStatus(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🤖 حالة MTX Bot')
            .setDescription('**الحالة:** 🟢 Online')
            .setColor(COLORS.SUCCESS)
            .addFields({ name: '📊 السيرفرات', value: String(this.guilds.cache.size), inline: true })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    // ─────────────────────────────────────────────────────────
    // Ticket Select Menu
    // ─────────────────────────────────────────────────────────

    async handleTicketSelect(interaction, guildId, ts) {
        const config = await ts.getConfig(guildId);
        if (!config?.roleId) {
            return interaction.reply({ content: '❌ شغل /setup-ticket أول', ephemeral: true });
        }

        // Check if user already has an open ticket
        const userTickets = [...ts.tickets.values()].filter(
            tk => tk.g === guildId && tk.owner === interaction.user.id
        );

        const openTickets = userTickets.filter(tk => {
            const chId = [...ts.tickets.entries()].find(([_, v]) => v === tk)?.[0];
            return interaction.guild.channels.cache.has(chId);
        });

        if (openTickets.length > 0) {
            const ticketChannels = openTickets.map(tk => {
                const chId = [...ts.tickets.entries()].find(([_, v]) => v === tk)?.[0];
                return `**#${tk.num}** (<#${chId}>)`;
            }).join('\n');

            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('❌ عندك تكت مفتوح بالفعل')
                    .setDescription(`يجب إغلاق التكت الأول قبل فتح واحد جديد:\n${ticketChannels}`)
                    .setColor(0xFF0000)],
                ephemeral: true
            });
        }

        const category = interaction.values[0];
        const label = ts.getOptions(guildId).find(o => o.value === category)?.label || category;
        const userId = interaction.user.id;

        const num = await ConfigDB.incrementTicketCounter(guildId);

        const channel = await interaction.guild.channels.create({
            name: `ticket-${num}`,
            type: ChannelType.GuildText,
            parent: config.categoryId || null,
            permissionOverwrites: [
                { id: guildId, deny: [PermissionsBitField.Flags.ViewChannel] },
                {
                    id: userId,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                },
                {
                    id: config.roleId,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                }
            ]
        });

        const ticketObj = { g: guildId, num, owner: userId, claimed: null, label, users: [userId] };
        ts.tickets.set(channel.id, ticketObj);
        await TicketDB.create(channel.id, guildId, num, userId, label);

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('claim').setLabel('✋ استلام').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('close').setLabel('🔴 إغلاق').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('adduser').setLabel('➕ إضافة شخص').setStyle(ButtonStyle.Secondary)
        );

        await channel.send(`<@&${config.roleId}>`);
        await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('🎫 تكت جديد')
                .setDescription(`مرحباً ${interaction.user}`)
                .addFields(
                    { name: 'النوع', value: label, inline: true },
                    { name: 'صاحب التكت', value: interaction.user.tag, inline: true }
                )
                .setColor(0x00FF00)
                .setFooter({ text: `التكت #${num} | اضغط على الأزرار أدناه` })],
            components: [buttons]
        });

        const logsChannel = interaction.guild.channels.cache.get(config.logsId);
        if (logsChannel) {
            await logsChannel.send({
                embeds: [new EmbedBuilder()
                    .setTitle('🟢 تكت جديد')
                    .addFields(
                        { name: 'رقم', value: `#${num}`, inline: true },
                        { name: 'صاحب', value: interaction.user.tag, inline: true },
                        { name: 'القناة', value: `${channel}`, inline: true }
                    )
                    .setColor(0x00FF00)]
            });
        }

        return interaction.reply({ content: `✅ تم فتح التكت: ${channel}`, ephemeral: true });
    }

    // ─────────────────────────────────────────────────────────
    // Ticket Buttons
    // ─────────────────────────────────────────────────────────

    async handleTicketButton(interaction, ts) {
        const ticket = ts.tickets.get(interaction.channel.id);
        if (!ticket) return interaction.reply({ content: '❌ ليست قناة تكت', ephemeral: true });

        const config = await ts.getConfig(ticket.g);

        if (interaction.customId === 'claim') {
            await this.handleClaimTicket(interaction, ticket, ts);
        } else if (interaction.customId === 'close') {
            await this.handleCloseTicket(interaction, ticket, ts);
        } else if (interaction.customId === 'adduser') {
            await this.handleAddUserButton(interaction, ticket);
        }
    }

    async handleClaimTicket(interaction, ticket, ts) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ أدمن فقط', ephemeral: true });
        }
        if (ticket.claimed) {
            return interaction.reply({ content: `⚠️ مستلم من <@${ticket.claimed}>`, ephemeral: true });
        }

        ticket.claimed = interaction.user.id;
        await TicketDB.update(interaction.channel.id, { claimed: interaction.user.id });

        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ تم الاستلام')
                .setDescription(`استلم التكت: ${interaction.user}`)
                .setColor(0x0099FF)]
        });
    }

    async handleCloseTicket(interaction, ticket, ts) {
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const isClaimer = ticket.claimed && ticket.claimed === interaction.user.id;

        if (!isAdmin && !isClaimer) {
            return interaction.reply({
                content: '❌ بس الأدمن أو اللي استلم التكت يقدر يغلقه!',
                ephemeral: true
            });
        }

        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('🔴 تم الإغلاق')
                .setDescription(`أغلقه ${interaction.user.tag}`)
                .setColor(0xFF0000)]
        });

        // DM owner
        try {
            const owner = await this.users.fetch(ticket.owner);
            await owner.send({
                embeds: [new EmbedBuilder()
                    .setTitle('🔴 تم إغلاق تكتك')
                    .setColor(0xFF0000)]
            });
        } catch { }

        setTimeout(async () => {
            await interaction.channel.delete().catch(() => { });
            ts.tickets.delete(interaction.channel.id);
            await TicketDB.delete(interaction.channel.id);
        }, 5000);
    }

    async handleAddUserButton(interaction, ticket) {
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const isClaimer = ticket.claimed && ticket.claimed === interaction.user.id;

        if (!isAdmin && !isClaimer) {
            return interaction.reply({
                content: '❌ بس الأدمن أو اللي استلم التكت يقدر يضيف أشخاص!',
                ephemeral: true
            });
        }

        const modal = new ModalBuilder()
            .setCustomId('adduser_modal')
            .setTitle('إضافة شخص للتكت');

        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('uid')
                .setLabel('اكتب ID أو اسم المستخدم')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('مثال: @username أو 123456789')
        ));

        await interaction.showModal(modal);
    }

    // ─────────────────────────────────────────────────────────
    // Add User Modal
    // ─────────────────────────────────────────────────────────

    async handleAddUserModal(interaction, ts) {
        const ticket = ts.tickets.get(interaction.channel.id);
        if (!ticket) return interaction.reply({ content: '❌ حدث خطأ', ephemeral: true });

        const input = interaction.fields.getTextInputValue('uid');
        let userId;

        try {
            if (input.startsWith('<@')) {
                userId = input.replace(/[<@!>]/g, '');
            } else if (!isNaN(input)) {
                userId = input;
            } else {
                const members = await interaction.guild.members.search({ query: input, limit: 1 });
                if (!members.size) {
                    return interaction.reply({ content: '❌ ما وجدت المستخدم', ephemeral: true });
                }
                userId = members.first()?.id;
            }

            if (ticket.users.includes(userId)) {
                return interaction.reply({ content: '⚠️ مضاف مسبقاً', ephemeral: true });
            }

            const user = await this.users.fetch(userId);

            await interaction.channel.permissionOverwrites.create(userId, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true
            });

            ticket.users.push(userId);
            await TicketDB.addUser(interaction.channel.id, userId);

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('✅ تمت الإضافة')
                    .setDescription(`تمت إضافة ${user.tag} للتكت`)
                    .setColor(0x00FF00)]
            });

        } catch (err) {
            console.error('[MTX] Error adding user:', err);
            await interaction.reply({ content: '❌ حدث خطأ', ephemeral: true });
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Keep-Alive Server
// ─────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html dir="rtl">
<head><title>MTX Bot - Ticket System</title><style>
    body { background: #0a0a0a; color: #2ecc71; font-family: 'Segoe UI', sans-serif; 
           display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
    .container { text-align: center; }
    h1 { font-size: 3em; margin-bottom: 10px; }
    .status { background: #1a1a1a; padding: 20px 40px; border-radius: 15px; border: 2px solid #2ecc71; }
    .online { color: #2ecc71; font-size: 1.5em; }
</style></head>
<body>
    <div class="container">
        <h1>🎫 MTX Ticket System</h1>
        <div class="status">
            <p class="online">🟢 Online</p>
            <p>نظام التكتات شغال!</p>
        </div>
    </div>
</body></html>`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[MTX] Keep-alive server running on port ${PORT}`);
});

// ─────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────

const bot = new MTXBot();
bot.login(process.env.TOKEN).catch(err => {
    console.error('[MTX] Fatal error:', err);
    process.exit(1);
});
