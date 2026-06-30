const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages] });

const configFile = 'servers_config.json';
let cfg = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
const save = () => fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
const isAdmin = m => m.permissions.has(PermissionsBitField.Flags.Administrator);
const tickets = new Map();
const counters = {};

const defaultOptions = [
    { label: 'استفسار', value: 'as' },
    { label: 'شكوى', value: 'sh' },
    { label: 'طلب رتبة', value: 'kl' },
    { label: 'شراء', value: 'sr' },
];

const getOptions = id => cfg[id]?.ticketOptions || defaultOptions;

client.on('ready', async () => {
    console.log(`✅ ${client.user.tag} جاهز!`);
    await client.application.commands.set([
        new SlashCommandBuilder().setName('setup-ticket').setDescription('إعداد نظام التكتات')
            .addChannelOption(o => o.setName('logs').setDescription('قناة اللوقات').setRequired(true))
            .addRoleOption(o => o.setName('role').setDescription('رتبة المشرفين').setRequired(true)),
        new SlashCommandBuilder().setName('ticket-panel').setDescription('إنشاء لوحة التكتات'),
        new SlashCommandBuilder().setName('add-option').setDescription('إضافة خيار للتكتات')
            .addStringOption(o => o.setName('label').setDescription('اسم الخيار').setRequired(true))
            .addStringOption(o => o.setName('value').setDescription('القيمة بالإنجليزي').setRequired(true)),
        new SlashCommandBuilder().setName('remove-option').setDescription('حذف خيار')
            .addStringOption(o => o.setName('value').setDescription('قيمة الخيار').setRequired(true)),
        new SlashCommandBuilder().setName('list-options').setDescription('عرض الخيارات الحالية'),
    ]);
    console.log('✅ تم تسجيل الأوامر');
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

        if (interaction.commandName === 'add-option') {
            const label = interaction.options.getString('label');
            const value = interaction.options.getString('value').toLowerCase().replace(/\s+/g, '_');
            if (!cfg[g]) cfg[g] = {};
            if (!cfg[g].ticketOptions) cfg[g].ticketOptions = [...defaultOptions];
            if (cfg[g].ticketOptions.length >= 25) return interaction.reply({ content: '❌ الحد الأقصى 25 خيار', ephemeral: true });
            if (cfg[g].ticketOptions.find(o => o.value === value)) return interaction.reply({ content: '❌ الخيار موجود مسبقاً', ephemeral: true });
            cfg[g].ticketOptions.push({ label, value });
            save();
            return interaction.reply({ content: `✅ تم إضافة **${label}**`, ephemeral: true });
        }

        if (interaction.commandName === 'remove-option') {
            const value = interaction.options.getString('value');
            if (!cfg[g]?.ticketOptions) return interaction.reply({ content: '❌ ما في خيارات مخصصة', ephemeral: true });
            const before = cfg[g].ticketOptions.length;
            cfg[g].ticketOptions = cfg[g].ticketOptions.filter(o => o.value !== value);
            if (cfg[g].ticketOptions.length === before) return interaction.reply({ content: '❌ الخيار غير موجود', ephemeral: true });
            save();
            return interaction.reply({ content: `✅ تم حذف \`${value}\``, ephemeral: true });
        }

        if (interaction.commandName === 'list-options') {
            const opts = getOptions(g);
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📋 الخيارات الحالية').setDescription(opts.map((o, i) => `${i+1}. **${o.label}** \`${o.value}\``).join('\n')).setFooter({ text: `${opts.length}/25` }).setColor(0x0099FF)], ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
        const config = cfg[g];
        if (!config?.roleId) return interaction.reply({ content: '❌ شغل /setup-ticket أول', ephemeral: true });
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

        tickets.set(channel.id, { g, num, owner: userId, claimed: null, label, users: [userId] });

        const btns = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('claim').setLabel('استلام').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('close').setLabel('إغلاق').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('adduser').setLabel('إضافة شخص').setStyle(ButtonStyle.Secondary)
        );

        await channel.send(`<@&${config.roleId}>`);
        await channel.send({ embeds: [new EmbedBuilder().setTitle('🎫 تكت جديد').setDescription(`مرحباً ${interaction.user}`).addFields({ name: 'النوع', value: label, inline: true }, { name: 'صاحب التكت', value: interaction.user.tag, inline: true }).setColor(0x00FF00).setFooter({ text: `#${num}` })], components: [btns] });

        const logsChannel = interaction.guild.channels.cache.get(config.logsId);
        if (logsChannel) await logsChannel.send({ embeds: [new EmbedBuilder().setTitle('🟢 تكت جديد').addFields({ name: 'رقم', value: `#${num}`, inline: true }, { name: 'صاحب', value: interaction.user.tag, inline: true }, { name: 'القناة', value: `${channel}`, inline: true }).setColor(0x00FF00)] });

        return interaction.reply({ content: `✅ تم فتح التكت: ${channel}`, ephemeral: true });
    }

    if (interaction.isButton()) {
        const t = tickets.get(interaction.channel.id);
        if (!t) return interaction.reply({ content: '❌ ليست قناة تكت', ephemeral: true });
        const config = cfg[t.g];

        if (interaction.customId === 'claim') {
            if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ أدمن فقط', ephemeral: true });
            if (t.claimed) return interaction.reply({ content: `⚠️ مستلم من <@${t.claimed}>`, ephemeral: true });
            t.claimed = interaction.user.id;
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ تم الاستلام').setDescription(`استلم ${interaction.user}`).setColor(0x0099FF)] });
            await client.users.fetch(t.owner).then(u => u.send({ embeds: [new EmbedBuilder().setTitle('📨 تم استلام تكتك').setDescription(`استلمه ${interaction.user.tag}`).setColor(0x0099FF)] })).catch(() => {});
        }

        else if (interaction.customId === 'close') {
            if (interaction.user.id !== t.owner && !isAdmin(interaction.member)) return interaction.reply({ content: '❌ أدمن أو صاحب التكت فقط', ephemeral: true });
            const closedAt = new Date().toLocaleString('ar-SA');
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔴 تم الإغلاق').setDescription(`أغلقه ${interaction.user.tag}`).setColor(0xFF0000)] });
            await client.users.fetch(t.owner).then(u => u.send({ embeds: [new EmbedBuilder().setTitle('🔴 تم إغلاق تكتك').setColor(0xFF0000)] })).catch(() => {});
            const logsChannel = interaction.guild.channels.cache.get(config.logsId);
            if (logsChannel) await logsChannel.send({ embeds: [new EmbedBuilder().setTitle('🔴 تكت مغلق').addFields({ name: 'رقم', value: `#${t.num}`, inline: true }, { name: 'صاحب', value: `<@${t.owner}>`, inline: true }, { name: 'وقت', value: closedAt }).setColor(0xFF0000)] });
            setTimeout(() => { interaction.channel.delete().catch(() => {}); tickets.delete(interaction.channel.id); }, 5000);
        }

        else if (interaction.customId === 'adduser') {
            if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ أدمن فقط', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('adduser_modal').setTitle('إضافة شخص');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('uid').setLabel('ID أو اسم المستخدم').setStyle(TextInputStyle.Short)));
            await interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'adduser_modal') {
        const t = tickets.get(interaction.channel.id);
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
            await interaction.channel.permissionOverwrites.create(userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
            t.users.push(userId);
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ تمت الإضافة').setDescription(`تمت إضافة ${user.tag}`).setColor(0x00FF00)] });
            await user.send({ embeds: [new EmbedBuilder().setTitle('📨 تمت إضافتك لتكت').setDescription(`القناة: ${interaction.channel.name}`).setColor(0x00FF00)] }).catch(() => {});
        } catch (e) {
            console.error(e);
            await interaction.reply({ content: '❌ حدث خطأ', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
