// ============================================
// bot.js - Main Entry Point
// ============================================
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Database = require('./database');
const Analytics = require('./analytics');
const AdminPanel = require('./admin');
const PremiumManager = require('./premium');
const Monitoring = require('./monitoring');
const TMDB = require('./tmdb');
const middleware = require('./middleware');

// ============================================
// KONFIGURATSIYA
// ============================================
const config = {
    botToken: process.env.BOT_TOKEN,
    adminIds: process.env.ADMIN_IDS?.split(',').map(id => parseInt(id)) || [],
    tmdbApiKey: process.env.TMDB_API_KEY || '', // Optional
    port: process.env.PORT || 3000
};

// ============================================
// BOTNI ISHGA TUSHIRISH
// ============================================
const bot = new TelegramBot(config.botToken, { polling: true });

// Modullarni initsializatsiya qilish
const db = new Database();
const analytics = new Analytics(db);
const adminPanel = new AdminPanel(bot, db, analytics);
const premiumManager = new PremiumManager(db);
const monitoring = new Monitoring(bot, config.adminIds);
const tmdb = config.tmdbApiKey ? new TMDB(config.tmdbApiKey) : null;

// Admin states (foydalanuvchi dialoglarini kuzatish)
const adminStates = new Map();

// ============================================
// MIDDLEWARE
// ============================================
bot.on('message', async (msg) => {
    monitoring.incrementRequests();
    
    // Foydalanuvchini ro'yxatga olish
    if (msg.from && !db.users[msg.from.id]) {
        await db.addUser(msg.from.id, {
            username: msg.from.username,
            firstName: msg.from.first_name,
            lastName: msg.from.last_name
        });
    }
});

// ============================================
// OBUNA TEKSHIRISH
// ============================================
async function checkSubscription(userId) {
    if (db.channels.length === 0) {
        return { subscribed: true, notSubscribed: [] };
    }
    
    const notSubscribed = [];
    
    for (const channel of db.channels) {
        if (channel.type === 'telegram') {
            try {
                const member = await bot.getChatMember(channel.channelId, userId);
                if (member.status === 'left' || member.status === 'kicked') {
                    notSubscribed.push(channel);
                }
            } catch (error) {
                console.error('Subscription check error:', error.message);
            }
        }
    }
    
    return {
        subscribed: notSubscribed.length === 0,
        notSubscribed
    };
}

async function showSubscriptionRequired(chatId, notSubscribed, messageId = null) {
    const buttons = notSubscribed.map(channel => {
        const icon = {
            'telegram': '📱',
            'instagram': '📷',
            'youtube': '📺',
            'twitter': '🐦',
            'tiktok': '🎵'
        }[channel.type] || '🔗';
        
        return [{
            text: `${icon} ${channel.name}`,
            url: channel.url
        }];
    });
    
    buttons.push([{
        text: '✅ Obunani tekshirish',
        callback_data: 'check_subscription'
    }]);
    
    const text = `⚠️ <b>DIQQAT!</b>

Kinolarni ko'rish uchun quyidagi kanallarga OBUNA bo'lishingiz SHART! 👇

Obuna bo'lgach "✅ Obunani tekshirish" tugmasini bosing.`;
    
    const options = {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    };
    
    if (messageId) {
        await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            ...options
        });
    } else {
        await bot.sendMessage(chatId, text, options);
    }
}

// ============================================
// KOMANDALAR
// ============================================

// /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    
    const isPremium = await db.checkPremium(user.id);
    const premiumBadge = isPremium ? '💎 ' : '';
    
    const welcomeText = `${premiumBadge}👋 Assalomu alaykum, <b>${user.first_name}</b>!

🎬 <b>Kino Bot</b>ga xush kelibsiz!

🔢 Kino kodini yuboring va kinoni tomosha qiling!
Misol: <code>55</code>

📊 <b>Statistika:</b>
├ 👥 Foydalanuvchilar: ${Object.keys(db.users).length}
├ 🎬 Kinolar: ${Object.keys(db.movies).length}
└ 📢 Kanallar: ${db.channels.length}`;
    
    const buttons = [
        [{ text: '🔍 Qidirish', switch_inline_query_current_chat: '' }],
        [
            { text: '🎬 Kategoriyalar', callback_data: 'categories' },
            { text: '⭐ Top kinolar', callback_data: 'top_movies' }
        ]
    ];
    
    if (!isPremium) {
        buttons.push([{ text: '💎 Premium', callback_data: 'premium' }]);
    } else {
        buttons.push([{ text: '💎 Premium Status', callback_data: 'premium_status' }]);
    }
    
    if (config.adminIds.includes(user.id)) {
        buttons.push([{ text: '⚙️ Admin Panel', callback_data: 'admin_panel' }]);
    }
    
    await bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
});

// /stats - Shaxsiy statistika
bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const userStats = await analytics.getUserAnalytics(userId);
    
    if (!userStats) {
        return bot.sendMessage(chatId, '❌ Statistika topilmadi');
    }
    
    const text = `📊 <b>SIZNING STATISTIKANGIZ</b>

👁 Ko'rilgan kinolar: ${userStats.watchCount}
🔍 Qidiruvlar: ${userStats.searchCount}
📅 Qo'shilgan: ${new Date(userStats.joinedDate).toLocaleDateString('uz-UZ')}
⏰ Oxirgi faollik: ${new Date(userStats.lastActive).toLocaleDateString('uz-UZ')}
${userStats.isPremium ? '💎 Premium: Faol' : ''}`;
    
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
});

// /help
bot.onText(/\/help/, async (msg) => {
    const text = `❓ <b>YORDAM</b>

<b>Qanday foydalanish:</b>
1️⃣ Kino kodini yuboring (masalan: 55)
2️⃣ Kanallarga obuna bo'ling
3️⃣ Kinoni tomosha qiling!

<b>Komandalar:</b>
/start - Botni ishga tushirish
/stats - Shaxsiy statistika
/premium - Premium obuna
/help - Yordam

<b>Muammo bo'lsa:</b>
Admin bilan bog'laning: @admin_username`;
    
    await bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
});

// ============================================
// KINO QIDIRISH (Kod orqali)
// ============================================
bot.on('message', async (msg) => {
    if (!msg.text) return;
    if (msg.text.startsWith('/')) return;
    if (adminStates.has(msg.from.id)) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const code = msg.text.trim();
    
    // Faqat raqamlarni qabul qilish
    if (!/^\d+$/.test(code)) return;
    
    // Kinoni topish
    const movie = await db.getMovie(code);
    
    if (!movie) {
        return bot.sendMessage(chatId,
            `❌ <code>${code}</code> kodli kino topilmadi.\n\n` +
            `Iltimos, to'g'ri kodni kiriting.`,
            { parse_mode: 'HTML' }
        );
    }
    
    // Premium check
    const isPremium = await db.checkPremium(userId);
    
    // Premium bo'lmasa obuna majburiy
    if (!isPremium) {
        const { subscribed, notSubscribed } = await checkSubscription(userId);
        
        if (!subscribed) {
            return showSubscriptionRequired(chatId, notSubscribed);
        }
    }
    
    // Kinoni yuborish
    try {
        // Reklama (premium bo'lmasa)
        if (!isPremium && Math.random() < 0.3) { // 30% ehtimol
            await bot.sendMessage(chatId,
                '📢 <b>Reklama</b>\n\n' +
                '💎 Premium obuna bilan reklamasiz tomosha qiling!\n' +
                '/premium - Batafsil',
                { parse_mode: 'HTML' }
            );
        }
        
        const caption = `🎬 <b>${movie.title}</b>

📅 Yil: ${movie.year || 'N/A'}
📁 Janr: ${movie.genre || 'N/A'}
🌐 Til: ${movie.language || 'N/A'}
⭐️ Reyting: ${movie.rating || 'N/A'}
🔢 Kod: <code>${code}</code>

📝 ${movie.description || ''}

👁 Ko'rishlar: ${movie.views || 0}${isPremium ? ' | 💎 Premium' : ''}`;
        
        await bot.sendVideo(chatId, movie.fileId, {
            caption,
            parse_mode: 'HTML',
            supports_streaming: true
        });
        
        // Statistikani yangilash
        await db.incrementViews(code);
        await db.updateUser(userId, {
            watchCount: (db.users[userId].watchCount || 0) + 1
        });
        await db.recordView(userId, code);
        
    } catch (error) {
        monitoring.logError(error, `Sending movie ${code} to user ${userId}`);
        await bot.sendMessage(chatId,
            '❌ Kinoni yuborishda xatolik yuz berdi.\n' +
            'Iltimos, qaytadan urinib ko\'ring.'
        );
    }
});

// ============================================
// CALLBACK QUERY HANDLERS
// ============================================
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const userId = query.from.id;
    const data = query.data;
    
    try {
        // Obunani tekshirish
        if (data === 'check_subscription') {
            const { subscribed, notSubscribed } = await checkSubscription(userId);
            
            if (subscribed) {
                await bot.editMessageText(
                    '✅ <b>Obuna tasdiqlandi!</b>\n\n' +
                    'Endi kino kodini yuboring. Misol: <code>55</code>',
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML'
                    }
                );
            } else {
                await bot.answerCallbackQuery(query.id, {
                    text: '❌ Siz hali barcha kanallarga obuna bo\'lmagansiz!',
                    show_alert: true
                });
                await showSubscriptionRequired(chatId, notSubscribed, messageId);
            }
            return;
        }
        
        // Premium
        if (data === 'premium') {
            await premiumManager.showPlans(chatId, bot);
            return;
        }
        
        if (data === 'premium_status') {
            const status = await premiumManager.checkStatus(userId);
            await bot.sendMessage(chatId, status.message, { parse_mode: 'HTML' });
            return;
        }
        
        if (data.startsWith('premium_buy_')) {
            const plan = data.replace('premium_buy_', '');
            // Bu yerda to'lov tizimini ulash kerak
            await bot.answerCallbackQuery(query.id, {
                text: 'To\'lov tizimi hozirda ishlab chiqilmoqda...',
                show_alert: true
            });
            return;
        }
        
        // Admin panel
        if (data === 'admin_panel') {
            if (!config.adminIds.includes(userId)) {
                return bot.answerCallbackQuery(query.id, {
                    text: '❌ Sizda admin huquqi yo\'q!',
                    show_alert: true
                });
            }
            await adminPanel.showMainPanel(chatId, messageId);
            return;
        }
        
        if (data === 'admin_stats') {
            await adminPanel.showStats(chatId, messageId);
            return;
        }
        
        if (data === 'admin_analytics') {
            await adminPanel.showAnalytics(chatId, messageId);
            return;
        }
        
        if (data === 'admin_users' || data.startsWith('admin_users_')) {
            const page = data === 'admin_users' ? 0 : parseInt(data.split('_')[2]);
            await adminPanel.showUsersList(chatId, messageId, page);
            return;
        }
        
        // Admin - Kino qo'shish
        if (data === 'admin_add_movie') {
            adminStates.set(userId, { action: 'add_movie', step: 'code' });
            await bot.editMessageText(
                '🔢 <b>Kino kodini kiriting:</b>\n\n' +
                'Misol: 55\n\n' +
                '❌ Bekor qilish: /cancel',
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML'
                }
            );
            return;
        }
        
        // Admin - Kanal qo'shish
        if (data === 'admin_add_channel') {
            const buttons = [
                [{ text: '📱 Telegram', callback_data: 'channel_telegram' }],
                [{ text: '📷 Instagram', callback_data: 'channel_instagram' }],
                [{ text: '📺 YouTube', callback_data: 'channel_youtube' }],
                [{ text: '🐦 Twitter/X', callback_data: 'channel_twitter' }],
                [{ text: '🎵 TikTok', callback_data: 'channel_tiktok' }],
                [{ text: '🔙 Orqaga', callback_data: 'admin_panel' }]
            ];
            
            await bot.editMessageText('📢 Kanal turini tanlang:', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: buttons }
            });
            return;
        }
        
        if (data.startsWith('channel_')) {
            const channelType = data.replace('channel_', '');
            adminStates.set(userId, { action: 'add_channel', type: channelType });
            
            let instructions = '';
            if (channelType === 'telegram') {
                instructions = `📱 <b>Telegram kanal qo'shish</b>\n\n` +
                    `Ma'lumotlarni quyidagi formatda yuboring:\n\n` +
                    `<code>Kanal nomi\nhttps://t.me/kanal\n@kanal\n-1001234567890</code>`;
            } else {
                const icons = { instagram: '📷', youtube: '📺', twitter: '🐦', tiktok: '🎵' };
                instructions = `${icons[channelType]} <b>${channelType} qo'shish</b>\n\n` +
                    `<code>Sahifa nomi\nhttps://url.com</code>`;
            }
            
            await bot.editMessageText(instructions + '\n\n❌ Bekor qilish: /cancel', {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML'
            });
            return;
        }
        
        // Broadcast
        if (data === 'admin_broadcast') {
            adminStates.set(userId, { action: 'broadcast' });
            await bot.editMessageText(
                '📣 <b>Xabar yuborish</b>\n\n' +
                'Barcha foydalanuvchilarga yubormoqchi bo\'lgan xabaringizni yozing:\n\n' +
                '❌ Bekor qilish: /cancel',
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML'
                }
            );
            return;
        }
        
        await bot.answerCallbackQuery(query.id);
        
    } catch (error) {
        monitoring.logError(error, `Callback query: ${data}`);
        await bot.answerCallbackQuery(query.id, {
            text: '❌ Xatolik yuz berdi',
            show_alert: true
        });
    }
});

// ============================================
// ADMIN STATE HANDLERS
// ============================================
bot.on('message', async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    
    if (!adminStates.has(userId)) return;
    
    const state = adminStates.get(userId);
    
    // Bekor qilish
    if (msg.text === '/cancel') {
        adminStates.delete(userId);
        await bot.sendMessage(chatId, '❌ Amal bekor qilindi.');
        await adminPanel.showMainPanel(chatId);
        return;
    }
    
    try {
        // Kino qo'shish
        if (state.action === 'add_movie') {
            if (state.step === 'code') {
                const code = msg.text.trim();
                if (!/^\d+$/.test(code)) {
                    return bot.sendMessage(chatId, '❌ Faqat raqam kiriting!');
                }
                if (await db.getMovie(code)) {
                    return bot.sendMessage(chatId, `❌ ${code} kodli kino mavjud!`);
                }
                state.code = code;
                state.step = 'file';
                adminStates.set(userId, state);
                await bot.sendMessage(chatId, `✅ Kod: ${code}\n\n📹 Video faylni yuboring:`);
            } else if (state.step === 'file') {
                if (!msg.video) {
                    return bot.sendMessage(chatId, '❌ Video fayl yuboring!');
                }
                state.fileId = msg.video.file_id;
                state.step = 'info';
                adminStates.set(userId, state);
                await bot.sendMessage(chatId,
                    '✅ Video qabul qilindi!\n\n' +
                    'Kino haqida ma\'lumot yuboring:\n\n' +
                    'Nomi: Spiderman\n' +
                    'Yil: 2024\n' +
                    'Janr: Action\n' +
                    'Til: O\'zbek\n' +
                    'Reyting: 8.5\n' +
                    'Tavsif: ...'
                );
            } else if (state.step === 'info') {
                const info = parseMovieInfo(msg.text);
                if (!info.title) {
                    return bot.sendMessage(chatId, '❌ Kino nomi yo\'q!');
                }
                
                await db.addMovie(state.code, {
                    fileId: state.fileId,
                    ...info
                });
                
                await bot.sendMessage(chatId,
                    `✅ Kino qo'shildi!\n\n` +
                    `🔢 Kod: <code>${state.code}</code>\n` +
                    `🎬 Nomi: ${info.title}`,
                    { parse_mode: 'HTML' }
                );
                
                adminStates.delete(userId);
                await adminPanel.showMainPanel(chatId);
            }
            return;
        }
        
        // Kanal qo'shish
        if (state.action === 'add_channel') {
            const lines = msg.text.trim().split('\n');
            
            if (state.type === 'telegram' && lines.length >= 4) {
                await db.addChannel({
                    type: 'telegram',
                    name: lines[0],
                    url: lines[1],
                    username: lines[2],
                    channelId: lines[3]
                });
            } else if (lines.length >= 2) {
                await db.addChannel({
                    type: state.type,
                    name: lines[0],
                    url: lines[1]
                });
            } else {
                return bot.sendMessage(chatId, '❌ Ma\'lumot to\'liq emas!');
            }
            
            await bot.sendMessage(chatId, '✅ Kanal qo\'shildi!');
            adminStates.delete(userId);
            await adminPanel.showMainPanel(chatId);
            return;
        }
        
        // Broadcast
        if (state.action === 'broadcast') {
            await bot.sendMessage(chatId, '📤 Xabar yuborilmoqda...');
            
            let success = 0, failed = 0;
            
            for (const uid of Object.keys(db.users)) {
                try {
                    await bot.copyMessage(uid, chatId, msg.message_id);
                    success++;
                    await new Promise(r => setTimeout(r, 50));
                } catch {
                    failed++;
                }
            }
            
            await bot.sendMessage(chatId,
                `✅ Yuborish tugadi!\n\n` +
                `├ ✅ Yuborildi: ${success}\n` +
                `└ ❌ Xatolik: ${failed}`
            );
            
            adminStates.delete(userId);
            await adminPanel.showMainPanel(chatId);
            return;
        }
        
    } catch (error) {
        monitoring.logError(error, `Admin state: ${state.action}`);
        await bot.sendMessage(chatId, '❌ Xatolik yuz berdi!');
    }
});

// ============================================
// HELPER FUNCTIONS
// ============================================
function parseMovieInfo(text) {
    const info = {};
    const lines = text.split('\n');
    
    for (const line of lines) {
        if (!line.includes(':')) continue;
        
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        const keyLower = key.trim().toLowerCase();
        
        if (['nomi', 'nom', 'title'].includes(keyLower)) info.title = value;
        else if (['yil', 'year'].includes(keyLower)) info.year = value;
        else if (['janr', 'genre'].includes(keyLower)) info.genre = value;
        else if (['til', 'language'].includes(keyLower)) info.language = value;
        else if (['reyting', 'rating'].includes(keyLower)) info.rating = value;
        else if (['tavsif', 'description'].includes(keyLower)) info.description = value;
    }
    
    return info;
}

// ============================================
// ERROR HANDLING
// ============================================
bot.on('polling_error', (error) => {
    monitoring.logError(error, 'Polling error');
});

process.on('unhandledRejection', (error) => {
    monitoring.logError(error, 'Unhandled rejection');
});

// ============================================
// STARTUP
// ============================================
console.log('🚀 Bot ishga tushdi...');
console.log('👤 Admin IDs:', config.adminIds);
console.log('📊 Kinolar:', Object.keys(db.movies).length);
console.log('📢 Kanallar:', db.channels.length);
console.log('👥 Foydalanuvchilar:', Object.keys(db.users).length);

// Health check endpoint (Render.com uchun)
const http = require('http');
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
}).listen(config.port, () => {
    console.log(`🌐 Health check server: http://localhost:${config.port}`);
});
