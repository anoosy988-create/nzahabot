const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages] });

const configFile = 'servers_config.json';
const ticketsFile = 'tickets_data.json';
let cfg = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
let ticketsData = fs.existsSync(ticketsFile) ? JSON.parse(fs.readFileSync(ticketsFile, 'utf8')) : {};

const save = () => fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
const saveTickets = () => fs.writeFileSync(ticketsFile, JSON.stringify(ticketsData, null, 2));
const isAdmin = m => m.permissions.has(PermissionsBitField.Flags.Administrator);

const tickets = new Map();
const counters = {};

const defaultOptions = [
    { label: 'استفسار', value: 'استفسار' },
    { label: 'شكوى', value: 'شكوى' },
    { label: 'طلب رتبة', value: 'طلب_رتبة' },
    { label: 'شراء', value: 'شراء' },
];

const PREFIX = '+';

const getOptions = id => cfg[id]?.ticketOptions || defaultOptions;

function generateValue(label) {
    return label.trim().replace(/\s+/g, '_');
}

client.on('ready', async () => {
    console.log(`✅ ${client.user.tag} جاهز!`);

    Object.entries(ticketsData).forEach(([channelId, ticketData]) => {
        tickets.set(channelId, ticketData);
    });

    // ✅ تسجيل السلاش كوماندات
    await client.application.commands.set([
        new SlashCommandBuilder().setName('setup-ticket').setDescription('إعداد نظام التكتات')
            .addChannelOption(o => o.setName('logs').setDescription('قناة اللوقات').setRequired(true))
            .addRoleOption(o => o.setName('role').setDescription('رتبة المشرفين').setRequired(true)),
        new SlashCommandBuilder().setName('ticket-panel').setDescription('إنشاء لوحة التكتات'),
        new SlashCommandBuilder().setName('add-option').setDescription('إضافة خيار للتكتات')
            .addStringOption(o => o.setName('label').setDescription('اسم الخيار').setRequired(true)),
        new SlashCommandBuilder().setName('remove-option').setDescription('حذف خيار')
            .addStringOption(o => o.setName('label').setDescription('اسم الخيار').setRequired(true)),
        new SlashCommandBuilder().setName('list-options').setDescription('عرض الخيارات الحالية'),
    ]);
    console.log('✅ تم تسجيل السلاش كوماندات');
});

client.on('messageCreate', async msg => {
    if (msg.author.bot) return;
    if (!msg.content.startsWith(PREFIX)) return;

    const args = msg.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args[0];

    // ✅ أمر +تعال - يدخل الشخص ويشوف الروم ويتكلم فيها
    if (command === 'تعال' || command === 'come') {
        const t = tickets.get(msg.channel.id);
        if (!t) return msg.reply('❌ هذه مو قناة تكت');

        if (msg.author.id !== t.owner && !isAdmin(msg.member)) {
            return msg.reply('صاحب التكت أو أدمن بس');
        }

        const nameQuery = args.slice(1).join(' ');
        let user = msg.mentions.users.first();

        if (!user && nameQuery) {
            if (!isNaN(nameQuery)) {
                user = await client.users.fetch(nameQuery).catch(() => null);
            } else {
                const found = await msg.guild.members.search({ query: nameQuery, limit: 1 }).catch(() => null);
                if (found && found.size) user = found.first().user;
            }
        }

        if (!user) return msg.reply('❌ اكتب اسم الشخص: `+تعال @اليوزر` أو اسم أو ID');
        if (user.bot) return msg.reply('❌ لا يمكن إضافة بوت');

        try {
            if (t.users.includes(user.id)) {
                return msg.reply(`⚠️ <@${user.id}> موجود مسبقاً في التكت`);
            }

            // ✅ صلاحيات بسيطة: يشوف + يتكلم + يقرأ السابق + يرسل صور
            await msg.channel.permissionOverwrites.create(user.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true
            });

            t.users.push(user.id);
            saveTickets();

            await msg.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('✅ تمت الإضافة')
                    .setDescription(`تمت إضافة ${user.tag} للتكت`)
                    .setColor(0x00FF00)]
            });

        } catch (e) {
            console.error(e);
            msg.reply('❌ حدث خطأ');
        }
    }
});

client.on('interactionCreate', async interaction => {
    const g = interaction.guildId;

    if (interaction.isCommand()) {
        if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ تحتاج صلاحية Administrator', ephemeral: true });

        if (interaction.commandName === 'setup-ticket') {
            const logs = interaction.options.getChannel('logs');
            const role = interaction.options.getRole('role');
            cfg[g] = { ...cfg[g], logsId: logs.id, roleId: role.id };
            save();
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ تم الإعداد').addFields({ name: 'لوقات', value: `${logs}`, inline: true }, { name: 'رتبة', value: role.name, inline: true }).setColor(0x00FF00)], ephemeral: true });
        }

        if (interaction.commandName === 'ticket-panel') {
            if (!cfg[g]) return interaction.reply({ content: '❌ شغل /setup-ticket أول', ephemeral: true });
            const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ticket_select').setPlaceholder('اختر نوع التكت...').addOptions(getOptions(g)));
            await interaction.channel.send({ embeds: [new EmbedBuilder().setTitle('🎫 نظام التكتات').setDescription('اختر من القائمة لفتح تكت').setColor(0x00FF00)], components: [row] });
            return interaction.reply({ content: '✅ تم إنشاء اللوحة', ephemeral: true });
        }

        // ✅ add-option يطلب label بس، والـ value يتولد تلقائياً
        if (interaction.commandName === 'add-option') {
            const label = interaction.options.getString('label');
            const value = generateValue(label);
            if (!cfg[g]) cfg[g] = {};
            if (!cfg[g].ticketOptions) cfg[g].ticketOptions = [...defaultOptions];
            if (cfg[g].ticketOptions.length >= 25) return interaction.reply({ content: '❌ الحد الأقصى 25 خيار', ephemeral: true });
            if (cfg[g].ticketOptions.find(o => o.value === value)) return interaction.reply({ content: '❌ الخيار موجود مسبقاً', ephemeral: true });
            cfg[g].ticketOptions.push({ label, value });
            save();
            return interaction.reply({ content: `✅ تم إضافة **${label}**`, ephemeral: true });
        }

        // ✅ remove-option يحذف بالـ label بدون ما يطلب value
        if (interaction.commandName === 'remove-option') {
            const label = interaction.options.getString('label');
            if (!cfg[g]?.ticketOptions) return interaction.reply({ content: '❌ ما في خيارات مخصصة', ephemeral: true });
            const before = cfg[g].ticketOptions.length;
            cfg[g].ticketOptions = cfg[g].ticketOptions.filter(o => o.label !== label && o.value !== label);
            if (cfg[g].ticketOptions.length === before) return interaction.reply({ content: '❌ الخيار غير موجود', ephemeral: true });
            save();
            return interaction.reply({ content: `✅ تم حذف **${label}**`, ephemeral: true });
        }

        if (interaction.commandName === 'list-options') {
            const opts = getOptions(g);
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📋 الخيارات الحالية').setDescription(opts.map((o, i) => `${i+1}. **${o.label}**`).join('\n')).setFooter({ text: `${opts.length}/25` }).setColor(0x0099FF)], ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
        const config = cfg[g];
        if (!config?.roleId) return interaction.reply({ content: '❌ شغل /setup-ticket أول', ephemeral: true });

        const userTickets = [...tickets.values()].filter(tk => tk.g === g && tk.owner === interaction.user.id);
        if (userTickets.length > 0) {
            const openTickets = userTickets.filter(tk => {
                const ch = interaction.guild.channels.cache.get([...tickets.entries()].find(([_, v]) => v === tk)?.[0]);
                return ch !== undefined;
            });

            if (openTickets.length > 0) {
                const ticketChannels = openTickets.map((tk) => {
                    const chId = [...tickets.entries()].find(([_, v]) => v === tk)?.[0];
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
        }

        const category = interaction.values[0];
        const label = getOptions(g).find(o => o.value === category)?.label || category;
        const userId = interaction.user.id;
        if (!counters[g]) counters[g] = 0;
        counters[g]++;
        const num = counters[g];

        const channel = await interaction.guild.channels.create({
            name: `ticket-${num}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: g, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: config.roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
            ]
        });

        const ticketObj = { g, num, owner: userId, claimed: null, label, users: [userId] };
        tickets.set(channel.id, ticketObj);
        ticketsData[channel.id] = ticketObj;
        saveTickets();

        // ✅ أزرار: استلام + إغلاق + إضافة شخص
        const btns = new ActionRowBuilder().addComponents(
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
            components: [btns]
        });

        const logsChannel = interaction.guild.channels.cache.get(config.logsId);
        if (logsChannel) await logsChannel.send({
            embeds: [new EmbedBuilder()
                .setTitle('🟢 تكت جديد')
                .addFields(
                    { name: 'رقم', value: `#${num}`, inline: true },
                    { name: 'صاحب', value: interaction.user.tag, inline: true },
                    { name: 'القناة', value: `${channel}`, inline: true }
                )
                .setColor(0x00FF00)]
        });

        return interaction.reply({ content: `✅ تم فتح التكت: ${channel}`, ephemeral: true });
    }

    if (interaction.isButton()) {
        const t = tickets.get(interaction.channel.id);
        if (!t) return interaction.reply({ content: '❌ ليست قناة تكت\n\n**الحل:** استخدم أمر `/ticket-panel` لإنشاء التكتات', ephemeral: true });
        const config = cfg[t.g];

        if (interaction.customId === 'claim') {
            if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ أدمن فقط', ephemeral: true });
            if (t.claimed) return interaction.reply({ content: `⚠️ مستلم من <@${t.claimed}>`, ephemeral: true });
            t.claimed = interaction.user.id;
            saveTickets();
            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('✅ تم الاستلام')
                    .setDescription(`استلم التكت: ${interaction.user}`)
                    .setColor(0x0099FF)]
            });
            // ❌ لا رسالة خاص للاستلام
        }

        else if (interaction.customId === 'close') {
            if (interaction.user.id !== t.owner && !isAdmin(interaction.member)) return interaction.reply({ content: '❌ أدمن أو صاحب التكت فقط', ephemeral: true });
            const closedAt = new Date().toLocaleString('ar-SA');
            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('🔴 تم الإغلاق')
                    .setDescription(`أغلقه ${interaction.user.tag}`)
                    .setColor(0xFF0000)]
            });

            // ✅ رسالة خاص للإغلاق فقط
            await client.users.fetch(t.owner).then(u => u.send({
                embeds: [new EmbedBuilder()
                    .setTitle('🔴 تم إغلاق تكتك')
                    .setColor(0xFF0000)]
            })).catch(() => {});

            const logsChannel = interaction.guild.channels.cache.get(config.logsId);
            if (logsChannel) await logsChannel.send({
                embeds: [new EmbedBuilder()
                    .setTitle('🔴 تكت مغلق')
                    .addFields(
                        { name: 'رقم', value: `#${t.num}`, inline: true },
                        { name: 'صاحب', value: `<@${t.owner}>`, inline: true },
                        { name: 'وقت', value: closedAt }
                    )
                    .setColor(0xFF0000)]
            });

            setTimeout(() => {
                interaction.channel.delete().catch(() => {});
                tickets.delete(interaction.channel.id);
                delete ticketsData[interaction.channel.id];
                saveTickets();
            }, 5000);
        }

        else if (interaction.customId === 'adduser') {
            if (!isAdmin(interaction.member) && interaction.user.id !== t.owner) {
                return interaction.reply({ content: '❌ صاحب التكت أو أدمن فقط', ephemeral: true });
            }
            const modal = new ModalBuilder().setCustomId('adduser_modal').setTitle('إضافة شخص للتكت');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('uid')
                    .setLabel('اكتب ID أو اسم المستخدم')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('مثال: @username أو 123456789')
            ));
            await interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'adduser_modal') {
        const t = tickets.get(interaction.channel.id);
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
            const user = await client.users.fetch(userId);
            // ✅ صلاحيات بسيطة: يشوف + يتكلم + يقرأ السابق + يرسل صور
            await interaction.channel.permissionOverwrites.create(userId, { 
                ViewChannel: true, 
                SendMessages: true, 
                ReadMessageHistory: true,
                AttachFiles: true
            });
            t.users.push(userId);
            saveTickets();
            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('✅ تمت الإضافة')
                    .setDescription(`تمت إضافة ${user.tag} للتكت`)
                    .setColor(0x00FF00)]
            });
            // ❌ لا رسالة خاص للإضافة
        } catch (e) {
            console.error(e);
            await interaction.reply({ content: '❌ حدث خطأ', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
