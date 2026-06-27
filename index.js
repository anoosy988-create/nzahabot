const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType, PermissionsBitField, ChannelType } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const STAFF_ROLE_ID = '1470410935587049555';
const LOGS_CHANNEL_ID = '1520262915272216718';

client.on('messageCreate', async (message) => {
    if (message.content === '!setup-tickets') {
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket_select')
                .setPlaceholder('اختر نوع التكت...')
                .addOptions([
                    { label: 'استفسار', value: 'inquiry' },
                    { label: 'شكوى', value: 'complaint' },
                    { label: 'طلب رتبة', value: 'rank_request' },
                ])
        );
        const embed = new EmbedBuilder().setTitle('نظام التكتات').setDescription('اختر من القائمة أدناه لفتح تكت.');
        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
        const category = interaction.values[0];
        const channel = await interaction.guild.channels.create({
            name: `${category}-${interaction.user.username}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('استلام التكت').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التكت').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('add_user').setLabel('إضافة شخص').setStyle(ButtonStyle.Secondary)
        );

        await channel.send({ content: `مرحباً ${interaction.user}، سيقوم أحد المشرفين بخدمتك قريباً.`, components: [buttons] });
        
        const logsChannel = interaction.guild.channels.cache.get(LOGS_CHANNEL_ID);
        if (logsChannel) {
            await logsChannel.send({ embeds: [new EmbedBuilder().setTitle('تكت جديد').addFields({ name: 'صاحب التكت', value: `${interaction.user.tag}` }, { name: 'القناة', value: `${channel}` }).setColor(0x00FF00)] });
        }
        await interaction.reply({ content: `تم فتح التكت: ${channel}`, ephemeral: true });
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'claim_ticket') {
            await interaction.reply(`تم استلام التكت بواسطة ${interaction.user}`);
        } else if (interaction.customId === 'close_ticket') {
            await interaction.reply('سيتم إغلاق التكت...');
            setTimeout(() => interaction.channel.delete(), 3000);
        } else if (interaction.customId === 'add_user') {
            await interaction.reply({ content: 'قم بمنشنة الشخص الذي تريد إضافته (ميزة قيد التطوير).', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
