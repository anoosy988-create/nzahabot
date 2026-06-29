const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType, PermissionsBitField, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages] });

// ملف إعدادات السيرفرات
const configFile = path.join(__dirname, 'servers_config.json');

// قراءة أو إنشاء ملف الإعدادات
let serverConfigs = {};
if (fs.existsSync(configFile)) {
    serverConfigs = JSON.parse(fs.readFileSync(configFile, 'utf8'));
}

function saveConfig() {
    fs.writeFileSync(configFile, JSON.stringify(serverConfigs, null, 2));
}

// دالة التحقق من صلاحية Administrator
function isAdmin(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

// تخزين بيانات التكتات
const tickets = new Map();

// عداد التكتات لكل سيرفر
const ticketCounters = {};

// الخيارات الافتراضية للتكتات
const defaultTicketOptions = [
    { label: 'استفسار', value: 'inquiry' },
    { label: 'شكوى', value: 'complaint' },
    { label: 'طلب رتبة', value: 'rank_request' },
    { label: 'شراء', value: 'purchase' },
];

// دالة لجلب خيارات التكتات للسيرفر
function getTicketOptions(guildId) {
    if (serverConfigs[guildId] && serverConfigs[guildId].ticketOptions) {
        return serverConfigs[guildId].ticketOptions;
    }
    return defaultTicketOptions;
}

client.on('ready', async () => {
    console.log(`✅ البوت ${client.user.tag} متصل وجاهز!`);

    // تسجيل slash commands
    const commands = [
        new SlashCommandBuilder()
            .setName('setup-ticket')
            .setDescription('إعداد نظام التكتات للسيرفر')
            .addChannelOption(option =>
                option
                    .setName('logs_channel')
                    .setDescription('القناة التي ستحط اللوقات فيها')
                    .setRequired(true)
            )
            .addRoleOption(option =>
                option
                    .setName('staff_role')
                    .setDescription('الرتبة المسؤولة عن التكتات')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('create-ticket-panel')
            .setDescription('إنشاء لوحة فتح التكتات'),

        // ✅ الأمر الجديد
        new SlashCommandBuilder()
            .setName('add-ticket-option')
            .setDescription('إضافة خيار جديد لقائمة التكتات')
            .addStringOption(option =>
                option
                    .setName('label')
                    .setDescription('اسم الخيار اللي يشوفه العضو (مثال: دعم فني)')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName('value')
                    .setDescription('القيمة الداخلية للخيار بالإنجليزي بدون مسافات (مثال: support)')
                    .setRequired(true)
            ),

        // أمر لعرض الخيارات الحالية
        new SlashCommandBuilder()
            .setName('list-ticket-options')
            .setDescription('عرض جميع خيارات التكتات الحالية'),

        // أمر لحذف خيار
        new SlashCommandBuilder()
            .setName('remove-ticket-option')
            .setDescription('حذف خيار من قائمة التكتات')
            .addStringOption(option =>
                option
                    .setName('value')
                    .setDescription('القيمة الداخلية للخيار المراد حذفه (مثال: support)')
                    .setRequired(true)
            ),
    ];

    try {
        await client.application.commands.set(commands);
        console.log('✅ تم تسجيل Slash Commands');
    } catch (error) {
        console.error('❌ خطأ في تسجيل الأوامر:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    // Setup Command
    if (interaction.isCommand() && interaction.commandName === 'setup-ticket') {
        if (!isAdmin(interaction.member)) return await interaction.reply({ content: '❌ هذا الأمر يحتاج صلاحية Administrator', ephemeral: true });
        const guildId = interaction.guildId;
        const logsChannel = interaction.options.getChannel('logs_channel');
        const staffRole = interaction.options.getRole('staff_role');

        // حفظ الإعدادات مع الإبقاء على الخيارات الموجودة
        serverConfigs[guildId] = {
            ...serverConfigs[guildId],
            logsChannelId: logsChannel.id,
            staffRoleId: staffRole.id,
            setupBy: interaction.user.id,
            setupAt: new Date().toLocaleString('ar-SA')
        };
        saveConfig();

        const embed = new EmbedBuilder()
            .setTitle('✅ تم إعداد نظام التكتات')
            .addFields(
                { name: '📋 قناة اللوقات', value: `${logsChannel}`, inline: true },
                { name: '👥 رتبة المشرفين', value: `${staffRole.name} (ID: ${staffRole.id})`, inline: true },
                { name: '⏰ الوقت', value: serverConfigs[guildId].setupAt, inline: false }
            )
            .setColor(0x00FF00);

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ✅ أمر إضافة خيار جديد
    if (interaction.isCommand() && interaction.commandName === 'add-ticket-option') {
        // تحقق من الصلاحيات
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return await interaction.reply({ content: '❌ فقط الأدمن يقدر يضيف خيارات', ephemeral: true });
        }

        const guildId = interaction.guildId;
        const label = interaction.options.getString('label');
        const value = interaction.options.getString('value').toLowerCase().replace(/\s+/g, '_');

        // تهيئة الخيارات إن لم تكن موجودة
        if (!serverConfigs[guildId]) serverConfigs[guildId] = {};
        if (!serverConfigs[guildId].ticketOptions) {
            serverConfigs[guildId].ticketOptions = [...defaultTicketOptions];
        }

        const currentOptions = serverConfigs[guildId].ticketOptions;

        // تحقق من الحد الأقصى (25 خيار هو حد ديسكورد)
        if (currentOptions.length >= 25) {
            return await interaction.reply({ content: '❌ وصلت الحد الأقصى (25 خيار)', ephemeral: true });
        }

        // تحقق إذا القيمة موجودة مسبقاً
        if (currentOptions.find(opt => opt.value === value)) {
            return await interaction.reply({ content: `❌ الخيار \`${value}\` موجود مسبقاً`, ephemeral: true });
        }

        // إضافة الخيار الجديد
        currentOptions.push({ label, value });
        saveConfig();

        const embed = new EmbedBuilder()
            .setTitle('✅ تم إضافة الخيار')
            .addFields(
                { name: '📝 الاسم', value: label, inline: true },
                { name: '🔑 القيمة', value: value, inline: true },
                { name: '📊 عدد الخيارات الكلي', value: `${currentOptions.length}`, inline: true }
            )
            .setColor(0x00FF00);

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ✅ أمر عرض الخيارات
    if (interaction.isCommand() && interaction.commandName === 'list-ticket-options') {
        if (!isAdmin(interaction.member)) return await interaction.reply({ content: '❌ هذا الأمر يحتاج صلاحية Administrator', ephemeral: true });
        const guildId = interaction.guildId;
        const options = getTicketOptions(guildId);

        const optionsList = options.map((opt, i) => `${i + 1}. **${opt.label}** \`${opt.value}\``).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('📋 خيارات التكتات الحالية')
            .setDescription(optionsList)
            .setFooter({ text: `${options.length}/25 خيار` })
            .setColor(0x0099FF);

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ✅ أمر حذف خيار
    if (interaction.isCommand() && interaction.commandName === 'remove-ticket-option') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return await interaction.reply({ content: '❌ فقط الأدمن يقدر يحذف خيارات', ephemeral: true });
        }

        const guildId = interaction.guildId;
        const value = interaction.options.getString('value');

        if (!serverConfigs[guildId] || !serverConfigs[guildId].ticketOptions) {
            return await interaction.reply({ content: '❌ ما في خيارات مخصصة لهذا السيرفر', ephemeral: true });
        }

        const before = serverConfigs[guildId].ticketOptions.length;
        serverConfigs[guildId].ticketOptions = serverConfigs[guildId].ticketOptions.filter(opt => opt.value !== value);

        if (serverConfigs[guildId].ticketOptions.length === before) {
            return await interaction.reply({ content: `❌ ما وجدت خيار بقيمة \`${value}\``, ephemeral: true });
        }

        saveConfig();

        await interaction.reply({ content: `✅ تم حذف الخيار \`${value}\``, ephemeral: true });
    }

    // Create Ticket Panel Command
    if (interaction.isCommand() && interaction.commandName === 'create-ticket-panel') {
        if (!isAdmin(interaction.member)) return await interaction.reply({ content: '❌ هذا الأمر يحتاج صلاحية Administrator', ephemeral: true });
        const guildId = interaction.guildId;
        const config = serverConfigs[guildId];

        if (!config) {
            return await interaction.reply({ content: '❌ لم يتم إعداد نظام التكتات بعد\nاستخدم `/setup-ticket` أولاً', ephemeral: true });
        }

        const options = getTicketOptions(guildId);

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket_select')
                .setPlaceholder('اختر نوع التكت...')
                .addOptions(options)
        );

        const embed = new EmbedBuilder()
            .setTitle('🎫 نظام التكتات')
            .setDescription('اختر من القائمة أدناه لفتح تكت.')
            .setColor(0x00FF00);

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ تم إنشاء لوحة التكتات', ephemeral: true });
    }

    // فتح تكت جديد
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
        const guildId = interaction.guildId;
        const config = serverConfigs[guildId];

        if (!config) {
            return await interaction.reply({ content: '❌ لم يتم إعداد نظام التكتات', ephemeral: true });
        }

        const category = interaction.values[0];

        // جلب الاسم من الخيارات المحفوظة
        const options = getTicketOptions(guildId);
        const selectedOption = options.find(opt => opt.value === category);
        const categoryArabic = selectedOption ? selectedOption.label : category;

        const userId = interaction.user.id;
        const createdAt = new Date().toLocaleString('ar-SA');

        if (!ticketCounters[guildId]) {
            ticketCounters[guildId] = 1;
        } else {
            ticketCounters[guildId]++;
        }

        const ticketNumber = ticketCounters[guildId];

        const channel = await interaction.guild.channels.create({
            name: `ticket-${ticketNumber}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: config.staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels] }
            ]
        });

        const staffRole = await interaction.guild.roles.fetch(config.staffRoleId);
        const roleDisplay = staffRole ? `${staffRole}` : `Role ID: ${config.staffRoleId}`;

        tickets.set(channel.id, {
            guildId: guildId,
            ticketNumber: ticketNumber,
            owner: userId,
            claimed_by: null,
            category: category,
            categoryArabic: categoryArabic,
            created_at: createdAt,
            closed: false,
            users: [userId]
        });

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('استلام التكت').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التكت').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('add_user').setLabel('إضافة شخص').setStyle(ButtonStyle.Secondary)
        );

        const embed = new EmbedBuilder()
            .setTitle('🎫 تكت جديد')
            .setDescription(`مرحباً ${interaction.user}، سيقوم أحد المشرفين بخدمتك قريباً.`)
            .addFields(
                { name: '📝 نوع التكت', value: categoryArabic, inline: true },
                { name: '👤 صاحب التكت', value: `${interaction.user.tag}`, inline: true },
                { name: '👥 فريق الدعم', value: roleDisplay, inline: false },
                { name: '⏰ الوقت', value: createdAt, inline: false }
            )
            .setColor(0x00FF00)
            .setFooter({ text: `التكت رقم #${ticketNumber}` });

        await channel.send(`<@&${config.staffRoleId}>`);
        await channel.send({ embeds: [embed], components: [buttons] });

        const logsChannel = interaction.guild.channels.cache.get(config.logsChannelId);
        if (logsChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('🟢 تكت جديد')
                .addFields(
                    { name: 'رقم التكت', value: `#${ticketNumber}`, inline: true },
                    { name: 'صاحب التكت', value: `${interaction.user.tag}`, inline: true },
                    { name: 'القناة', value: `${channel}`, inline: true },
                    { name: 'النوع', value: categoryArabic, inline: true },
                    { name: 'فريق الدعم', value: roleDisplay, inline: true },
                    { name: 'الوقت', value: createdAt, inline: false }
                )
                .setColor(0x00FF00);
            await logsChannel.send({ embeds: [logEmbed] });
        }

        await interaction.reply({ content: `✅ تم فتح التكت: ${channel}`, ephemeral: true });
    }

    // أزرار التكت
    if (interaction.isButton()) {
        const ticketData = tickets.get(interaction.channel.id);

        if (!ticketData) {
            return await interaction.reply({ content: '❌ هذه ليست قناة تكت', ephemeral: true });
        }

        const config = serverConfigs[ticketData.guildId];

        if (interaction.customId === 'claim_ticket') {
            if (!isAdmin(interaction.member)) {
                return await interaction.reply({ content: '❌ فقط الأدمن يمكنهم استلام التكتات', ephemeral: true });
            }

            if (ticketData.claimed_by) {
                return await interaction.reply({ content: `⚠️ التكت مستلم بالفعل من <@${ticketData.claimed_by}>`, ephemeral: true });
            }

            ticketData.claimed_by = interaction.user.id;

            const embed = new EmbedBuilder()
                .setTitle('✅ تم استلام التكت')
                .setDescription(`تم استلام التكت بواسطة ${interaction.user}`)
                .setColor(0x0099FF);

            await interaction.reply({ embeds: [embed] });

            const owner = await client.users.fetch(ticketData.owner);
            const dmEmbed = new EmbedBuilder()
                .setTitle('📨 تم استلام تكتك')
                .setDescription(`تم استلام تكتك بواسطة ${interaction.user.tag}`)
                .setColor(0x0099FF);
            await owner.send({ embeds: [dmEmbed] }).catch(console.error);
        }

        else if (interaction.customId === 'close_ticket') {
            if (interaction.user.id !== ticketData.owner && !isAdmin(interaction.member)) {
                return await interaction.reply({ content: '❌ فقط صاحب التكت أو الأدمن يمكنهم إغلاق التكت', ephemeral: true });
            }

            if (interaction.user.id === ticketData.owner && ticketData.claimed_by) {
                return await interaction.reply({ content: '❌ لا يمكنك إغلاق التكت إلا إذا لم يكن مستلماً', ephemeral: true });
            }

            const closedAt = new Date().toLocaleString('ar-SA');
            ticketData.closed = true;

            const embed = new EmbedBuilder()
                .setTitle('🔴 تم إغلاق التكت')
                .setDescription(`تم إغلاق التكت بواسطة ${interaction.user.tag}`)
                .addFields({ name: 'وقت الإغلاق', value: closedAt, inline: false })
                .setColor(0xFF0000);

            await interaction.reply({ embeds: [embed] });

            const owner = await client.users.fetch(ticketData.owner);
            const dmEmbed = new EmbedBuilder()
                .setTitle('🔴 تم إغلاق تكتك')
                .setDescription(`تم إغلاق تكتك بنجاح ✅\n\nشكراً لاستخدامك نظام التكتات`)
                .setColor(0xFF0000);
            await owner.send({ embeds: [dmEmbed] }).catch(console.error);

            const logsChannel = interaction.guild.channels.cache.get(config.logsChannelId);
            if (logsChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🔴 تكت تم إغلاقه')
                    .addFields(
                        { name: 'رقم التكت', value: `#${ticketData.ticketNumber}`, inline: true },
                        { name: 'صاحب التكت', value: `<@${ticketData.owner}>`, inline: true },
                        { name: 'النوع', value: ticketData.categoryArabic, inline: true },
                        { name: 'المستلم', value: ticketData.claimed_by ? `<@${ticketData.claimed_by}>` : 'لم يتم استلامه', inline: true },
                        { name: 'وقت الإنشاء', value: ticketData.created_at, inline: false },
                        { name: 'وقت الإغلاق', value: closedAt, inline: false }
                    )
                    .setColor(0xFF0000);
                await logsChannel.send({ embeds: [logEmbed] });
            }

            setTimeout(() => {
                interaction.channel.delete().catch(console.error);
                tickets.delete(interaction.channel.id);
            }, 5000);
        }

        else if (interaction.customId === 'add_user') {
            if (!isAdmin(interaction.member)) {
                return await interaction.reply({ content: '❌ فقط الأدمن يمكنهم إضافة أشخاص', ephemeral: true });
            }

            if (!ticketData.claimed_by) {
                return await interaction.reply({ content: '❌ يجب استلام التكت أولاً قبل إضافة أشخاص', ephemeral: true });
            }

            if (interaction.user.id !== ticketData.claimed_by && !isAdmin(interaction.member)) {
                return await interaction.reply({ content: '❌ فقط المستلم أو الأدمن يمكنه إضافة أشخاص', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('add_user_modal')
                .setTitle('إضافة شخص للتكت');

            const userInput = new TextInputBuilder()
                .setCustomId('user_id')
                .setLabel('أدخل معرف المستخدم أو الاسم')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('@username أو ID');

            modal.addComponents(new ActionRowBuilder().addComponents(userInput));
            await interaction.showModal(modal);
        }
    }

    // معالجة Modal
    if (interaction.isModalSubmit() && interaction.customId === 'add_user_modal') {
        const ticketData = tickets.get(interaction.channel.id);
        const userInput = interaction.fields.getTextInputValue('user_id');
        const config = serverConfigs[ticketData.guildId];

        let userId;

        try {
            if (userInput.startsWith('<@') && userInput.endsWith('>')) {
                userId = userInput.replace(/[<@!>]/g, '');
            } else if (!isNaN(userInput)) {
                userId = userInput;
            } else {
                const members = await interaction.guild.members.search({ query: userInput, limit: 1 });
                if (members.size === 0) {
                    return await interaction.reply({ content: '❌ لم يتم العثور على المستخدم', ephemeral: true });
                }
                userId = members.first()?.id;
            }

            const user = await client.users.fetch(userId);

            if (ticketData.users.includes(userId)) {
                return await interaction.reply({ content: '⚠️ هذا المستخدم مضاف بالفعل', ephemeral: true });
            }

            await interaction.channel.permissionOverwrites.create(userId, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });

            ticketData.users.push(userId);

            const embed = new EmbedBuilder()
                .setTitle('✅ تم إضافة شخص')
                .setDescription(`تم إضافة ${user.tag} للتكت`)
                .setColor(0x00FF00);

            await interaction.reply({ embeds: [embed] });

            const dmEmbed = new EmbedBuilder()
                .setTitle('📨 تمت إضافتك لتكت')
                .setDescription(`تمت إضافتك لتكت جديد\n\n**القناة:** ${interaction.channel.name}\n**المضيف:** ${interaction.user.tag}`)
                .setColor(0x00FF00);

            await user.send({ embeds: [dmEmbed] }).catch(console.error);

            const channelEmbed = new EmbedBuilder()
                .setTitle('👤 تم إضافة عضو جديد')
                .setDescription(`تمت إضافة ${user.tag} للتكت بواسطة ${interaction.user.tag}`)
                .setColor(0x00FF00);

            await interaction.channel.send({ embeds: [channelEmbed] });

        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '❌ حدث خطأ أثناء إضافة المستخدم', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
