// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  🤖 MTX BOT v6.0 - Admin + Tickets System                             ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const { 
    Client, GatewayIntentBits, Partials, PermissionsBitField, 
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
    SlashCommandBuilder, ChannelType
} = require('discord.js');
const http = require('http');
const fs = require('fs');
const { WarningDB, ProtectionDB } = require('./database');

// ═══════════════════════════════════════════════════════════════════════
// ⚙️ CONFIG
// ═══════════════════════════════════════════════════════════════════════

const CONFIG = {
    CMDS: {
        BAN: 'باند', BAN2: 'تف', UNBAN: 'فك', KICK: 'بنعالي', MUTE: 'اسكت', UNMUTE: 'تكلم',
        WARN: 'تحذير', WARNINGS: 'تحذيرات', CLEARWARN: 'مسح_تحذير',
        LOCK: 'ق', UNLOCK: 'ف', PURGE: 'م', SLOWMODE: 'بطي',
        PROTECTION: 'حماية', GAMES: 'العاب'
    },
    PROTECTION: {
        SPAM_THRESHOLD: 5, SPAM_WINDOW: 3000, SPAM_MUTE_HOURS: 6,
        LINK_MUTE_MINUTES: 30, WARN_LIMIT: 5, WARN_MUTE_DAYS: 2
    },
    COLORS: {
        SUCCESS: 0x2ecc71, ERROR: 0xe74c3c, WARN: 0xf39c12,
        INFO: 0x3498db, PROTECTION: 0x9b59b6
    }
};

// ═══════════════════════════════════════════════════════════════════════
// 🎨 EMBEDS
// ═══════════════════════════════════════════════════════════════════════

class Embeds {
    static success(title, description) {
        return new EmbedBuilder().setTitle(`✅ ┃ ${title}`).setDescription(description)
            .setColor(CONFIG.COLORS.SUCCESS).setTimestamp().setFooter({ text: 'MTX Bot' });
    }
    static error(title, description) {
        return new EmbedBuilder().setTitle(`❌ ┃ ${title}`).setDescription(description)
            .setColor(CONFIG.COLORS.ERROR).setTimestamp().setFooter({ text: 'MTX Bot' });
    }
    static warn(title, description) {
        return new EmbedBuilder().setTitle(`⚠️ ┃ ${title}`).setDescription(description)
            .setColor(CONFIG.COLORS.WARN).setTimestamp().setFooter({ text: 'MTX Bot' });
    }
    static info(title, description) {
        return new EmbedBuilder().setTitle(`ℹ️ ┃ ${title}`).setDescription(description)
            .setColor(CONFIG.COLORS.INFO).setTimestamp().setFooter({ text: 'MTX Bot' });
    }
    static protection(title, description) {
        return new EmbedBuilder().setTitle(`🛡️ ┃ ${title}`).setDescription(description)
            .setColor(CONFIG.COLORS.PROTECTION).setTimestamp().setFooter({ text: 'MTX Bot' });
    }
    static logAction(action, moderator, target, reason = 'غير محدد', extra = {}) {
        const embed = new EmbedBuilder().setTitle(`📝 سجل إداري ┃ ${action}`)
            .setColor(CONFIG.COLORS.INFO).setTimestamp()
            .addFields(
                { name: '👤 المستخدم', value: `${target} (\`${target.id}\`)`, inline: true },
                { name: '🔧 المسؤول', value: `${moderator} (\`${moderator.id}\`)`, inline: true },
                { name: '📌 السبب', value: reason, inline: false }
            ).setFooter({ text: 'MTX Bot' });
        for (const [key, value] of Object.entries(extra)) {
            embed.addFields({ name: key, value: String(value), inline: true });
        }
        return embed;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 🎫 TICKET SYSTEM
// ═══════════════════════════════════════════════════════════════════════

class TicketSystem {
    constructor(client) {
        this.client = client;
        this.configFile = 'servers_config.json';
        this.ticketsFile = 'tickets_data.json';
        this.cfg = fs.existsSync(this.configFile) ? JSON.parse(fs.readFileSync(this.configFile, 'utf8')) : {};
        this.ticketsData = fs.existsSync(this.ticketsFile) ? JSON.parse(fs.readFileSync(this.ticketsFile, 'utf8')) : {};
        this.tickets = new Map();
        this.counters = {};
    }

    save() { fs.writeFileSync(this.configFile, JSON.stringify(this.cfg, null, 2)); }
    saveTickets() { fs.writeFileSync(this.ticketsFile, JSON.stringify(this.ticketsData, null, 2)); }

    load() {
        Object.entries(this.ticketsData).forEach(([channelId, ticketData]) => {
            this.tickets.set(channelId, ticketData);
        });
        Object.values(this.ticketsData).forEach(t => {
            if (t.g && t.num) {
                if (!this.counters[t.g]) this.counters[t.g] = 0;
                if (t.num > this.counters[t.g]) this.counters[t.g] = t.num;
            }
        });
    }

    getOptions(guildId) {
        return this.cfg[guildId]?.ticketOptions || [];
    }

    generateValue(label) {
        return label.trim().replace(/\s+/g, '_');
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 🤖 MAIN BOT
// ═══════════════════════════════════════════════════════════════════════

class MTXBot extends Client {
    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildModeration,
                GatewayIntentBits.GuildPresences
            ],
            partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
        });

        this.ticketSystem = new TicketSystem(this);
        this.startTime = new Date();
        this.setupEvents();
    }

    setupEvents() {
        this.once('ready', () => this.onReady());
        this.on('messageCreate', (m) => this.onMessage(m));
        this.on('interactionCreate', (i) => this.onInteraction(i));
    }

    async onReady() {
        console.log(`
    ╔═══════════════════════════════════════════════════╗
    ║                                                   ║
    ║        🤖 MTX BOT v6.0 - ONLINE                   ║
    ║        Admin + Tickets System                    ║
    ║        السيرفرات: ${this.guilds.cache.size.toString().padEnd(27)}║
    ║                                                   ║
    ╚═══════════════════════════════════════════════════╝
        `);
        await this.user.setPresence({
            activities: [{ name: '🎫 التكتات | .العاب', type: 3 }],
            status: 'online'
        });
        this.ticketSystem.load();
        await this.registerSlashCommands();
    }

    async registerSlashCommands() {
        const cmds = [
            new SlashCommandBuilder().setName('setup-ticket').setDescription('إعداد نظام التكتات')
                .addChannelOption(o => o.setName('logs').setDescription('قناة اللوقات').setRequired(true).addChannelTypes(ChannelType.GuildText))
                .addChannelOption(o => o.setName('category').setDescription('كاتقوري التكتات').setRequired(true).addChannelTypes(ChannelType.GuildCategory))
                .addRoleOption(o => o.setName('role').setDescription('رتبة المشرفين').setRequired(true)),
            new SlashCommandBuilder().setName('ticket-panel').setDescription('إنشاء لوحة التكتات'),
            new SlashCommandBuilder().setName('add-option').setDescription('إضافة خيار للتكتات')
                .addStringOption(o => o.setName('label').setDescription('اسم الخيار').setRequired(true)),
            new SlashCommandBuilder().setName('remove-option').setDescription('حذف خيار')
                .addStringOption(o => o.setName('label').setDescription('اسم الخيار').setRequired(true)),
            new SlashCommandBuilder().setName('list-options').setDescription('عرض الخيارات الحالية'),
            new SlashCommandBuilder().setName('log').setDescription('تحديد روم اللوق')
                .addChannelOption(o => o.setName('channel').setDescription('روم اللوق').setRequired(true).addChannelTypes(ChannelType.GuildText)),
            new SlashCommandBuilder().setName('status').setDescription('حالة البوت')
        ];

        try {
            await this.application.commands.set(cmds);
            console.log('✅ [MTX] تم تسجيل السلاش كوماندات');
        } catch(e) {
            console.error('❌ [MTX] خطأ في السلاش كوماندات:', e);
        }
    }

    async onMessage(message) {
        if (message.author.bot || !message.guild) return;
        await this.handleCommand(message);
    }

    async handleCommand(message) {
        const content = message.content.trim();
        const parts = content.split(/\s+/);
        const cmd = parts[0];
        const args = parts.slice(1);

        const adminCmds = [CONFIG.CMDS.BAN, CONFIG.CMDS.BAN2, CONFIG.CMDS.UNBAN, CONFIG.CMDS.KICK, CONFIG.CMDS.MUTE, CONFIG.CMDS.UNMUTE,
            CONFIG.CMDS.WARN, CONFIG.CMDS.CLEARWARN, CONFIG.CMDS.LOCK, CONFIG.CMDS.UNLOCK,
            CONFIG.CMDS.PURGE, CONFIG.CMDS.SLOWMODE, CONFIG.CMDS.PROTECTION];
        const allCmds = [...adminCmds, CONFIG.CMDS.WARNINGS, CONFIG.CMDS.GAMES];
        if (!allCmds.includes(cmd)) return;

        const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || 
                         message.author.id === message.guild.ownerId;
        if (adminCmds.includes(cmd) && !isAdmin) {
            return message.reply({ embeds: [Embeds.error('صلاحيات', '⛔ بس الأدمن يقدر يستخدم هذا الأمر!')] });
        }

        switch(cmd) {
            case CONFIG.CMDS.BAN: await this.cmdBan(message, args); break;
            case CONFIG.CMDS.BAN2: await this.cmdBan(message, args); break;
            case CONFIG.CMDS.UNBAN: await this.cmdUnban(message, args); break;
            case CONFIG.CMDS.KICK: await this.cmdKick(message, args); break;
            case CONFIG.CMDS.MUTE: await this.cmdMute(message, args); break;
            case CONFIG.CMDS.UNMUTE: await this.cmdUnmute(message, args); break;
            case CONFIG.CMDS.WARN: await this.cmdWarn(message, args); break;
            case CONFIG.CMDS.WARNINGS: await this.cmdWarnings(message, args); break;
            case CONFIG.CMDS.CLEARWARN: await this.cmdClearWarn(message, args); break;
            case CONFIG.CMDS.LOCK: await this.cmdLock(message, args); break;
            case CONFIG.CMDS.UNLOCK: await this.cmdUnlock(message, args); break;
            case CONFIG.CMDS.PURGE: await this.cmdPurge(message, args); break;
            case CONFIG.CMDS.SLOWMODE: await this.cmdSlowmode(message, args); break;
            case CONFIG.CMDS.PROTECTION: await this.cmdProtection(message, args); break;
            case CONFIG.CMDS.GAMES: await this.cmdGames(message); break;
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // 🎫 TICKET INTERACTIONS
    // ═════════════════════════════════════════════════════════════════

    async onInteraction(interaction) {
        const g = interaction.guildId;
        const ts = this.ticketSystem;

        // Slash Commands
        if (interaction.isCommand()) {
            const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
            if (!isAdmin) return interaction.reply({ content: '❌ تحتاج صلاحية Administrator', ephemeral: true });

            if (interaction.commandName === 'setup-ticket') {
                const logs = interaction.options.getChannel('logs');
                const category = interaction.options.getChannel('category');
                const role = interaction.options.getRole('role');
                ts.cfg[g] = { ...ts.cfg[g], logsId: logs.id, categoryId: category.id, roleId: role.id };
                ts.save();
                return interaction.reply({ 
                    embeds: [new EmbedBuilder().setTitle('✅ تم إعداد نظام التكتات')
                        .addFields(
                            { name: '📋 لوقات', value: `${logs}`, inline: true },
                            { name: '📁 كاتقوري', value: `${category}`, inline: true },
                            { name: '👮 رتبة', value: role.name, inline: true }
                        ).setColor(0x00FF00)], 
                    ephemeral: true 
                });
            }

            if (interaction.commandName === 'ticket-panel') {
                if (!ts.cfg[g]?.roleId) return interaction.reply({ content: '❌ شغل /setup-ticket أول', ephemeral: true });
                const options = ts.getOptions(g);
                if (options.length === 0) return interaction.reply({ content: '❌ ما فيه خيارات! ضيف خيارات بـ /add-option', ephemeral: true });
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('ticket_select')
                        .setPlaceholder('اختر نوع التكت...')
                        .addOptions(options)
                );
                await interaction.channel.send({ 
                    embeds: [new EmbedBuilder().setTitle('🎫 نظام التكتات').setDescription('اختر من القائمة لفتح تكت').setColor(0x00FF00)], 
                    components: [row] 
                });
                return interaction.reply({ content: '✅ تم إنشاء اللوحة', ephemeral: true });
            }

            if (interaction.commandName === 'add-option') {
                const label = interaction.options.getString('label');
                const value = ts.generateValue(label);
                if (!ts.cfg[g]) ts.cfg[g] = {};
                if (!ts.cfg[g].ticketOptions) ts.cfg[g].ticketOptions = [];
                if (ts.cfg[g].ticketOptions.length >= 25) return interaction.reply({ content: '❌ الحد الأقصى 25 خيار', ephemeral: true });
                if (ts.cfg[g].ticketOptions.find(o => o.value === value)) return interaction.reply({ content: '❌ الخيار موجود مسبقاً', ephemeral: true });
                ts.cfg[g].ticketOptions.push({ label, value });
                ts.save();
                return interaction.reply({ content: `✅ تم إضافة **${label}**`, ephemeral: true });
            }

            if (interaction.commandName === 'remove-option') {
                const label = interaction.options.getString('label');
                const value = ts.generateValue(label);
                if (!ts.cfg[g]?.ticketOptions) return interaction.reply({ content: '❌ ما فيه خيارات', ephemeral: true });
                const optionToRemove = ts.cfg[g].ticketOptions.find(o => o.label === label || o.value === value || o.value === label);
                if (!optionToRemove) return interaction.reply({ content: `❌ الخيار "${label}" غير موجود`, ephemeral: true });
                ts.cfg[g].ticketOptions = ts.cfg[g].ticketOptions.filter(o => o.value !== optionToRemove.value);
                if (ts.cfg[g].ticketOptions.length === 0) delete ts.cfg[g].ticketOptions;
                ts.save();
                return interaction.reply({ content: `✅ تم حذف **${optionToRemove.label}**`, ephemeral: true });
            }

            if (interaction.commandName === 'list-options') {
                const opts = ts.getOptions(g);
                if (opts.length === 0) return interaction.reply({ content: '❌ ما فيه خيارات', ephemeral: true });
                return interaction.reply({ 
                    embeds: [new EmbedBuilder().setTitle('📋 الخيارات الحالية')
                        .setDescription(opts.map((o, i) => `${i+1}. **${o.label}**`).join('\n'))
                        .setFooter({ text: `${opts.length}/25` }).setColor(0x0099FF)], 
                    ephemeral: true 
                });
            }

            if (interaction.commandName === 'log') {
                const ch = interaction.options.getChannel('channel');
                ProtectionDB.setLogChannel(interaction.guildId, ch.id);
                await interaction.reply({ embeds: [Embeds.success('إعدادات اللوق', `📋 **${ch}** تم تحديده كروم للوق!`)] });
            }

            if (interaction.commandName === 'status') {
                const uptime = new Date() - this.startTime;
                const h = Math.floor(uptime / 3600000), m = Math.floor((uptime % 3600000) / 60000);
                const embed = new EmbedBuilder().setTitle('🤖 حالة MTX Bot')
                    .setDescription(`**الحالة:** 🟢 Online\n**الوقت:** ${h}س ${m}د`).setColor(CONFIG.COLORS.SUCCESS)
                    .addFields(
                        { name: '📊 السيرفرات', value: String(this.guilds.cache.size), inline: true },
                        { name: '📋 روم اللوق', value: ProtectionDB.getLogChannel(interaction.guildId) ? `<#${ProtectionDB.getLogChannel(interaction.guildId)}>` : 'غير محدد', inline: true }
                    ).setTimestamp();
                await interaction.reply({ embeds: [embed] });
            }
        }

        // Ticket Select Menu
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
            const config = ts.cfg[g];
            if (!config?.roleId) return interaction.reply({ content: '❌ شغل /setup-ticket أول', ephemeral: true });

            const userTickets = [...ts.tickets.values()].filter(tk => tk.g === g && tk.owner === interaction.user.id);
            const openTickets = userTickets.filter(tk => {
                const chId = [...ts.tickets.entries()].find(([_, v]) => v === tk)?.[0];
                return interaction.guild.channels.cache.has(chId);
            });

            if (openTickets.length > 0) {
                const ticketChannels = openTickets.map((tk) => {
                    const chId = [...ts.tickets.entries()].find(([_, v]) => v === tk)?.[0];
                    return `**#${tk.num}** (<#${chId}>)`;
                }).join('\n');
                return interaction.reply({
                    embeds: [new EmbedBuilder().setTitle('❌ عندك تكت مفتوح بالفعل')
                        .setDescription(`يجب إغلاق التكت الأول قبل فتح واحد جديد:\n${ticketChannels}`)
                        .setColor(0xFF0000)], ephemeral: true
                });
            }

            const category = interaction.values[0];
            const label = ts.getOptions(g).find(o => o.value === category)?.label || category;
            const userId = interaction.user.id;
            if (!ts.counters[g]) ts.counters[g] = 0;
            ts.counters[g]++;
            const num = ts.counters[g];

            const channel = await interaction.guild.channels.create({
                name: `ticket-${num}`,
                type: ChannelType.GuildText,
                parent: config.categoryId || null,
                permissionOverwrites: [
                    { id: g, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                    { id: config.roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
                ]
            });

            const ticketObj = { g, num, owner: userId, claimed: null, label, users: [userId] };
            ts.tickets.set(channel.id, ticketObj);
            ts.ticketsData[channel.id] = ticketObj;
            ts.saveTickets();

            const btns = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('claim').setLabel('✋ استلام').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('close').setLabel('🔴 إغلاق').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('adduser').setLabel('➕ إضافة شخص').setStyle(ButtonStyle.Secondary)
            );

            await channel.send(`<@&${config.roleId}>`);
            await channel.send({
                embeds: [new EmbedBuilder().setTitle('🎫 تكت جديد').setDescription(`مرحباً ${interaction.user}`)
                    .addFields(
                        { name: 'النوع', value: label, inline: true },
                        { name: 'صاحب التكت', value: interaction.user.tag, inline: true }
                    ).setColor(0x00FF00).setFooter({ text: `التكت #${num} | اضغط على الأزرار أدناه` })],
                components: [btns]
            });

            const logsChannel = interaction.guild.channels.cache.get(config.logsId);
            if (logsChannel) await logsChannel.send({
                embeds: [new EmbedBuilder().setTitle('🟢 تكت جديد')
                    .addFields(
                        { name: 'رقم', value: `#${num}`, inline: true },
                        { name: 'صاحب', value: interaction.user.tag, inline: true },
                        { name: 'القناة', value: `${channel}`, inline: true }
                    ).setColor(0x00FF00)]
            });

            return interaction.reply({ content: `✅ تم فتح التكت: ${channel}`, ephemeral: true });
        }

        // Buttons
        if (interaction.isButton()) {
            const t = ts.tickets.get(interaction.channel.id);
            if (!t) return interaction.reply({ content: '❌ ليست قناة تكت', ephemeral: true });
            const config = ts.cfg[t.g];

            if (interaction.customId === 'claim') {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) 
                    return interaction.reply({ content: '❌ أدمن فقط', ephemeral: true });
                if (t.claimed) return interaction.reply({ content: `⚠️ مستلم من <@${t.claimed}>`, ephemeral: true });
                t.claimed = interaction.user.id;
                ts.ticketsData[interaction.channel.id] = t;
                ts.saveTickets();
                await interaction.reply({
                    embeds: [new EmbedBuilder().setTitle('✅ تم الاستلام')
                        .setDescription(`استلم التكت: ${interaction.user}`).setColor(0x0099FF)]
                });
            }

            else if (interaction.customId === 'close') {
                if (interaction.user.id !== t.owner && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) 
                    return interaction.reply({ content: '❌ أدمن أو صاحب التكت فقط', ephemeral: true });
                const closedAt = new Date().toLocaleString('ar-SA');
                await interaction.reply({
                    embeds: [new EmbedBuilder().setTitle('🔴 تم الإغلاق')
                        .setDescription(`أغلقه ${interaction.user.tag}`).setColor(0xFF0000)]
                });

                await this.users.fetch(t.owner).then(u => u.send({
                    embeds: [new EmbedBuilder().setTitle('🔴 تم إغلاق تكتك').setColor(0xFF0000)]
                })).catch(() => {});

                const logsChannel = interaction.guild.channels.cache.get(config.logsId);
                if (logsChannel) await logsChannel.send({
                    embeds: [new EmbedBuilder().setTitle('🔴 تكت مغلق')
                        .addFields(
                            { name: 'رقم', value: `#${t.num}`, inline: true },
                            { name: 'صاحب', value: `<@${t.owner}>`, inline: true },
                            { name: 'وقت', value: closedAt }
                        ).setColor(0xFF0000)]
                });

                setTimeout(() => {
                    interaction.channel.delete().catch(() => {});
                    ts.tickets.delete(interaction.channel.id);
                    delete ts.ticketsData[interaction.channel.id];
                    ts.saveTickets();
                }, 5000);
            }

            else if (interaction.customId === 'adduser') {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && interaction.user.id !== t.owner) 
                    return interaction.reply({ content: '❌ صاحب التكت أو أدمن فقط', ephemeral: true });
                const modal = new ModalBuilder().setCustomId('adduser_modal').setTitle('إضافة شخص للتكت');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('uid').setLabel('اكتب ID أو اسم المستخدم')
                        .setStyle(TextInputStyle.Short).setPlaceholder('مثال: @username أو 123456789')
                ));
                await interaction.showModal(modal);
            }
        }

        // Modal
        if (interaction.isModalSubmit() && interaction.customId === 'adduser_modal') {
            const t = ts.tickets.get(interaction.channel.id);
            if (!t) return interaction.reply({ content: '❌ حدث خطأ', ephemeral: true });

            const input = interaction.fields.getTextInputValue('uid');
            let userId;
            try {
                if (input.startsWith('<@')) userId = input.replace(/[<@!>]/g, '');
                else if (!isNaN(input)) userId = input;
                else {
                    const m = await interaction.guild.members.search({ query: input, limit: 1 });
                    if (!m.size) return interaction.reply({ content: '❌ ما وجدت المستخدم', ephemeral: true });
                    userId = m.first()?.id;
                }
                if (t.users.includes(userId)) return interaction.reply({ content: '⚠️ مضاف مسبقاً', ephemeral: true });
                const user = await this.users.fetch(userId);
                await interaction.channel.permissionOverwrites.create(userId, { 
                    ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true
                });
                t.users.push(userId);
                ts.ticketsData[interaction.channel.id] = t;
                ts.saveTickets();
                await interaction.reply({
                    embeds: [new EmbedBuilder().setTitle('✅ تمت الإضافة')
                        .setDescription(`تمت إضافة ${user.tag} للتكت`).setColor(0x00FF00)]
                });
            } catch (e) {
                console.error(e);
                await interaction.reply({ content: '❌ حدث خطأ', ephemeral: true });
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // ⚙️ ADMIN COMMANDS
    // ═════════════════════════════════════════════════════════════════

    async cmdBan(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });
        if (member.id === m.guild.ownerId) return m.reply({ embeds: [Embeds.error('خطأ', 'ما تقدر تبند الأونر!')] });
        if (member.roles.highest.position >= m.member.roles.highest.position && m.author.id !== m.guild.ownerId) {
            return m.reply({ embeds: [Embeds.error('خطأ', 'رتبته أعلى منك!')] });
        }
        const timeArg = args.find(a => /^\d+[dhms]$/.test(a));
        const reason = args.filter(a => a !== timeArg && !a.includes(member.id)).join(' ') || 'غير محدد';
        try {
            await member.ban({ reason: `بواسطة ${m.author.tag}: ${reason}`, deleteMessageDays: 0 });
            const embed = Embeds.success('تم التبنيد',
                `**العضو:** ${member}\n🆔 **الايدي:** \`${member.id}\`\n📌 **السبب:** ${reason}\n⏰ **الوقت:** ${timeArg || 'دائم'}\n🔧 **بواسطة:** ${m.author}`
            );
            await m.reply({ embeds: [embed] });
            await this.sendLog(m.guild, Embeds.logAction('تبنيد', m.author, member.user, reason, { 'الوقت': timeArg || 'دائم' }));
            if (timeArg) {
                const ms = this.parseTime(timeArg);
                if (ms) setTimeout(() => m.guild.members.unban(member.id, 'انتهاء الوقت').catch(() => {}), ms);
            }
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdUnban(m, args) {
        const uid = args[0];
        if (!uid || !/^\d+$/.test(uid)) return m.reply({ embeds: [Embeds.error('خطأ', 'حط ايدي صحيح!')] });
        try {
            const user = await this.users.fetch(uid);
            await m.guild.members.unban(user, `بواسطة ${m.author.tag}`);
            m.reply({ embeds: [Embeds.success('تم فك الباند', `**${user.tag}** تم فك الباند عنه!`)] });
            await this.sendLog(m.guild, Embeds.logAction('فك باند', m.author, user, 'فك الباند'));
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdKick(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });
        if (member.id === m.guild.ownerId) return m.reply({ embeds: [Embeds.error('خطأ', 'ما تقدر تطرد الأونر!')] });
        const reason = args.filter(a => !a.includes(member.id)).join(' ') || 'غير محدد';
        try {
            await member.kick(`بواسطة ${m.author.tag}: ${reason}`);
            m.reply({ embeds: [Embeds.success('تم الطرد', `**${member}** تم طرده!\n📌 **السبب:** ${reason}`)] });
            await this.sendLog(m.guild, Embeds.logAction('طرد', m.author, member.user, reason));
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdMute(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });
        const timeArg = args.find(a => /^\d+[dhms]$/.test(a)) || '1h';
        const reason = args.filter(a => a !== timeArg && !a.includes(member.id)).join(' ') || 'غير محدد';
        const ms = this.parseTime(timeArg);
        if (!ms) return m.reply({ embeds: [Embeds.error('خطأ', 'صيغة غير صحيحة! استخدم: 1h, 30m, 1d')] });
        try {
            await member.timeout(ms, `بواسطة ${m.author.tag}: ${reason}`);
            m.reply({ embeds: [Embeds.success('تم الكتم', `**${member}** تم كتمه!\n⏰ **المدة:** ${timeArg}\n📌 **السبب:** ${reason}`)] });
            await this.sendLog(m.guild, Embeds.logAction('كتم', m.author, member.user, reason, { 'المدة': timeArg }));
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdUnmute(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });
        try {
            await member.timeout(null, `بواسطة ${m.author.tag}`);
            m.reply({ embeds: [Embeds.success('تم فك الكتم', `**${member}** يقدر يتكلم الحين! 🎉`)] });
            await this.sendLog(m.guild, Embeds.logAction('فك كتم', m.author, member.user, 'فك الكتم'));
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdWarn(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });
        const reason = args.filter(a => !a.includes(member.id)).join(' ') || 'غير محدد';
        const result = WarningDB.addWarning(member.id, m.guild.id, reason, m.author);
        if (result.total >= CONFIG.PROTECTION.WARN_LIMIT) {
            const muteMs = CONFIG.PROTECTION.WARN_MUTE_DAYS * 24 * 60 * 60 * 1000;
            try {
                await member.timeout(muteMs, `🛡️ MTX: وصل ${CONFIG.PROTECTION.WARN_LIMIT} تحذيرات`);
                const autoEmbed = Embeds.warn('🚫 ميوت تلقائي!',
                    `**${member}** وصل **${CONFIG.PROTECTION.WARN_LIMIT}** تحذيرات!\n\n` +
                    `⏰ **العقوبة:** ميوت **${CONFIG.PROTECTION.WARN_MUTE_DAYS} يومين**\n` +
                    `📌 **السبب:** تجاوز الحد المسموح\n` +
                    `🗑️ **التحذيرات:** تم مسحها`
                );
                await m.reply({ embeds: [autoEmbed] });
                await this.sendLog(m.guild, Embeds.logAction('ميوت تلقائي', m.author, member.user, '5 تحذيرات', { 'المدة': `${CONFIG.PROTECTION.WARN_MUTE_DAYS} يومين` }));
                WarningDB.clearWarnings(member.id, m.guild.id);
            } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
            return;
        }
        const embed = Embeds.warn('تم التحذير',
            `**${member}**\n📌 **السبب:** ${reason}\n⚠️ **التحذيرات:** ${result.total}/${CONFIG.PROTECTION.WARN_LIMIT}\n🔧 **بواسطة:** ${m.author}`
        );
        await m.reply({ embeds: [embed] });
        await this.sendLog(m.guild, Embeds.logAction('تحذير', m.author, member.user, reason, { 'العدد': `${result.total}/${CONFIG.PROTECTION.WARN_LIMIT}` }));
    }

    async cmdWarnings(m, args) {
        const member = m.mentions.members.first() || m.member;
        const warnings = WarningDB.getWarnings(member.id, m.guild.id);
        if (warnings.length === 0) return m.reply({ embeds: [Embeds.info('نظيف ✅', `**${member}** ما عنده ولا تحذير!`)] });
        const warnList = warnings.map((w, i) => 
            `\`${i + 1}.\` **${w.reason}**\n├ 👤 <@${w.moderatorId}>\n└ 🕐 ${new Date(w.timestamp).toLocaleString('ar-SA')}`
        ).join('\n\n');
        const embed = new EmbedBuilder().setTitle(`⚠️ تحذيرات ${member.user.tag}`).setDescription(warnList)
            .setColor(CONFIG.COLORS.WARN).setThumbnail(member.user.displayAvatarURL())
            .setFooter({ text: `${warnings.length}/${CONFIG.PROTECTION.WARN_LIMIT} | بعد ${CONFIG.PROTECTION.WARN_LIMIT} = ميوت ${CONFIG.PROTECTION.WARN_MUTE_DAYS} يوم` }).setTimestamp();
        await m.reply({ embeds: [embed] });
    }

    async cmdClearWarn(m, args) {
        const member = m.mentions.members.first();
        if (!member) return m.reply({ embeds: [Embeds.error('خطأ', 'منشن العضو!')] });
        const index = parseInt(args.find(a => /^\d+$/.test(a)));
        const warnings = WarningDB.getWarnings(member.id, m.guild.id);
        if (warnings.length === 0) return m.reply({ embeds: [Embeds.error('خطأ', 'ما عنده تحذيرات!')] });
        if (index && index > 0) {
            if (index > warnings.length) return m.reply({ embeds: [Embeds.error('خطأ', `رقم غير موجود! عنده بس ${warnings.length}`)] });
            WarningDB.removeWarning(member.id, m.guild.id, index - 1);
            m.reply({ embeds: [Embeds.success('تم المسح', `🗑️ تم مسح التحذير رقم **${index}**!`)] });
        } else {
            WarningDB.clearWarnings(member.id, m.guild.id);
            m.reply({ embeds: [Embeds.success('تم المسح', `🗑️ تم مسح جميع تحذيرات **${member}**!`)] });
        }
        await this.sendLog(m.guild, Embeds.logAction('مسح تحذيرات', m.author, member.user, 'مسح'));
    }

    async cmdLock(m, args) {
        let ch = m.mentions.channels.first();
        if (!ch && args[0]) { const idMatch = args[0].match(/\d+/); if (idMatch) ch = m.guild.channels.cache.get(idMatch[0]); }
        ch = ch || m.channel;
        const botMember = m.guild.members.me;
        const botPerms = ch.permissionsFor(botMember);
        if (!botPerms.has(PermissionsBitField.Flags.ManageChannels)) return m.reply({ embeds: [Embeds.error('صلاحيات', 'البوت ما عنده Manage Channels!')] });
        try {
            await ch.permissionOverwrites.edit(m.guild.roles.everyone, { SendMessages: false });
            m.reply({ embeds: [Embeds.success('تم القفل', `🔒 **${ch}** تم قفله!`)] });
            await this.sendLog(m.guild, Embeds.logAction('قفل روم', m.author, m.author, 'قفل', { 'الروم': ch.toString() }));
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdUnlock(m, args) {
        let ch = m.mentions.channels.first();
        if (!ch && args[0]) { const idMatch = args[0].match(/\d+/); if (idMatch) ch = m.guild.channels.cache.get(idMatch[0]); }
        ch = ch || m.channel;
        const botMember = m.guild.members.me;
        const botPerms = ch.permissionsFor(botMember);
        if (!botPerms.has(PermissionsBitField.Flags.ManageChannels)) return m.reply({ embeds: [Embeds.error('صلاحيات', 'البوت ما عنده Manage Channels!')] });
        try {
            await ch.permissionOverwrites.edit(m.guild.roles.everyone, { SendMessages: true });
            m.reply({ embeds: [Embeds.success('تم الفتح', `🔓 **${ch}** تم فتحه!`)] });
            await this.sendLog(m.guild, Embeds.logAction('فتح روم', m.author, m.author, 'فتح', { 'الروم': ch.toString() }));
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdPurge(m, args) {
        const amount = parseInt(args[0]) || 10;
        if (amount > 100) return m.reply({ embeds: [Embeds.error('خطأ', 'الحد الأقصى 100!')] });
        if (amount < 1) return m.reply({ embeds: [Embeds.error('خطأ', 'الحد الأدنى 1!')] });
        try {
            const deleted = await m.channel.bulkDelete(amount + 1, true);
            const msg = await m.reply({ embeds: [Embeds.success('تم المسح', `🗑️ تم مسح **${deleted.size - 1}** رسالة!`)] });
            setTimeout(() => msg.delete().catch(() => {}), 3000);
            await this.sendLog(m.guild, Embeds.logAction('مسح رسائل', m.author, m.author, 'مسح', { 'العدد': deleted.size - 1 }));
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdSlowmode(m, args) {
        const sec = parseInt(args[0]) || 0;
        if (sec < 0) return m.reply({ embeds: [Embeds.error('خطأ', 'لازم 0 أو أكثر!')] });
        try {
            await m.channel.setRateLimitPerUser(sec);
            const embed = sec === 0 
                ? Embeds.success('تم إيقاف التبطيء', `**${m.channel}** التبطيء متوقف! ✅`)
                : Embeds.success('تم التبطيء', `**${m.channel}** تم تبطيئه لـ **${sec}** ثانية! 🐢`);
            m.reply({ embeds: [embed] });
        } catch(e) { m.reply({ embeds: [Embeds.error('خطأ', e.message)] }); }
    }

    async cmdGames(m) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('game_roulette').setLabel('🎲 روليت').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('game_mafia').setLabel('🕵️ مافيا').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('game_castle').setLabel('🏰 كاستل').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('game_tictactoe').setLabel('⚔️ تكت تو').setStyle(ButtonStyle.Secondary)
        );
        const embed = new EmbedBuilder().setTitle('🎮 قائمة الألعاب الجماعية').setDescription('اختر لعبة من القائمة!')
            .setColor(CONFIG.COLORS.SUCCESS).setFooter({ text: `طلبت بواسطة ${m.author.tag}`, iconURL: m.author.displayAvatarURL() }).setTimestamp();
        await m.reply({ embeds: [embed], components: [row] });
    }

    parseTime(str) {
        if (!str) return null;
        const match = str.match(/^(\d+)([dhms])$/);
        if (!match) return null;
        const value = parseInt(match[1]);
        switch(match[2]) {
            case 'd': return value * 86400000;
            case 'h': return value * 3600000;
            case 'm': return value * 60000;
            case 's': return value * 1000;
            default: return null;
        }
    }

    async sendLog(guild, embed) {
        const chId = ProtectionDB.getLogChannel(guild.id);
        if (!chId) return;
        const ch = guild.channels.cache.get(chId);
        if (ch) try { await ch.send({ embeds: [embed] }); } catch(e) {}
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 🌐 Keep-Alive Server
// ═══════════════════════════════════════════════════════════════════════

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head><title>MTX Bot</title>
        <style>
            body { background: #0a0a0a; color: #2ecc71; font-family: 'Segoe UI', sans-serif; 
                   display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .container { text-align: center; }
            h1 { font-size: 3em; margin-bottom: 10px; }
            .status { background: #1a1a1a; padding: 20px 40px; border-radius: 15px; border: 2px solid #2ecc71; }
            .online { color: #2ecc71; font-size: 1.5em; }
        </style></head>
        <body>
            <div class="container">
                <h1>🤖 MTX Bot</h1>
                <div class="status">
                    <p class="online">🟢 Online</p>
                    <p>البوت شغال بنجاح!</p>
                </div>
            </div>
        </body></html>
    `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 [MTX] Keep-Alive Server شغال على البورت ${PORT}`);
});

// ═══════════════════════════════════════════════════════════════════════
// 🏃 START
// ═══════════════════════════════════════════════════════════════════════

const bot = new MTXBot();

async function start() {
    await bot.login(process.env.TOKEN);
}

start().catch(err => {
    console.error('❌ [MTX] خطأ فادح:', err);
    process.exit(1);
});
