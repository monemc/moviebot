// ============================================
// FILE: database.js
// ============================================
const fs = require('fs').promises;
const path = require('path');

class Database {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        this.moviesFile = path.join(this.dataDir, 'movies.json');
        this.channelsFile = path.join(this.dataDir, 'channels.json');
        this.usersFile = path.join(this.dataDir, 'users.json');
        this.premiumFile = path.join(this.dataDir, 'premium.json');
        this.analyticsFile = path.join(this.dataDir, 'analytics.json');
        
        this.movies = {};
        this.channels = [];
        this.users = {};
        this.premium = {};
        this.analytics = {
            daily: {},
            total: {
                views: 0,
                searches: 0,
                subscriptions: 0
            }
        };
        
        this.init();
    }
    
    async init() {
        try {
            // Data papkasini yaratish
            await fs.mkdir(this.dataDir, { recursive: true });
            
            // Ma'lumotlarni yuklash
            await this.load();
        } catch (error) {
            console.error('Database init error:', error);
        }
    }
    
    async load() {
        try {
            this.movies = await this.loadFile(this.moviesFile, {});
            this.channels = await this.loadFile(this.channelsFile, []);
            this.users = await this.loadFile(this.usersFile, {});
            this.premium = await this.loadFile(this.premiumFile, {});
            this.analytics = await this.loadFile(this.analyticsFile, {
                daily: {},
                total: { views: 0, searches: 0, subscriptions: 0 }
            });
        } catch (error) {
            console.error('Load error:', error);
        }
    }
    
    async loadFile(filePath, defaultValue) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return defaultValue;
        }
    }
    
    async save() {
        try {
            await Promise.all([
                this.saveFile(this.moviesFile, this.movies),
                this.saveFile(this.channelsFile, this.channels),
                this.saveFile(this.usersFile, this.users),
                this.saveFile(this.premiumFile, this.premium),
                this.saveFile(this.analyticsFile, this.analytics)
            ]);
        } catch (error) {
            console.error('Save error:', error);
        }
    }
    
    async saveFile(filePath, data) {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    }
    
    // Movie methods
    async addMovie(code, movieData) {
        this.movies[code] = {
            ...movieData,
            views: 0,
            addedDate: new Date().toISOString()
        };
        await this.save();
    }
    
    async getMovie(code) {
        return this.movies[code];
    }
    
    async deleteMovie(code) {
        delete this.movies[code];
        await this.save();
    }
    
    async incrementViews(code) {
        if (this.movies[code]) {
            this.movies[code].views = (this.movies[code].views || 0) + 1;
            await this.save();
        }
    }
    
    // User methods
    async addUser(userId, userData) {
        if (!this.users[userId]) {
            this.users[userId] = {
                ...userData,
                joinedDate: new Date().toISOString(),
                watchCount: 0,
                searchCount: 0,
                lastActive: new Date().toISOString()
            };
            await this.save();
        }
    }
    
    async updateUser(userId, updates) {
        if (this.users[userId]) {
            this.users[userId] = { ...this.users[userId], ...updates };
            this.users[userId].lastActive = new Date().toISOString();
            await this.save();
        }
    }
    
    async getUserStats(userId) {
        return this.users[userId] || null;
    }
    
    // Channel methods
    async addChannel(channelData) {
        this.channels.push({
            ...channelData,
            addedDate: new Date().toISOString()
        });
        await this.save();
    }
    
    async removeChannel(index) {
        this.channels.splice(index, 1);
        await this.save();
    }
    
    // Analytics methods
    async recordView(userId, movieCode) {
        const today = new Date().toISOString().split('T')[0];
        
        if (!this.analytics.daily[today]) {
            this.analytics.daily[today] = {
                views: 0,
                searches: 0,
                newUsers: 0,
                activeUsers: new Set()
            };
        }
        
        this.analytics.daily[today].views++;
        this.analytics.total.views++;
        
        if (this.analytics.daily[today].activeUsers) {
            this.analytics.daily[today].activeUsers.add(userId);
        }
        
        await this.save();
    }
    
    async recordSearch(userId) {
        const today = new Date().toISOString().split('T')[0];
        
        if (!this.analytics.daily[today]) {
            this.analytics.daily[today] = {
                views: 0,
                searches: 0,
                newUsers: 0
            };
        }
        
        this.analytics.daily[today].searches++;
        this.analytics.total.searches++;
        
        await this.save();
    }
    
    // Premium methods
    async setPremium(userId, duration) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + duration);
        
        this.premium[userId] = {
            active: true,
            startDate: new Date().toISOString(),
            expiresAt: expiresAt.toISOString()
        };
        
        await this.save();
    }
    
    async checkPremium(userId) {
        const premium = this.premium[userId];
        
        if (!premium) return false;
        
        const now = new Date();
        const expires = new Date(premium.expiresAt);
        
        if (now > expires) {
            premium.active = false;
            await this.save();
            return false;
        }
        
        return true;
    }
}

module.exports = Database;


// ============================================
// FILE: middleware.js
// ============================================
const middleware = {
    // Admin tekshirish
    isAdmin: (adminIds) => {
        return async (ctx, next) => {
            if (adminIds.includes(ctx.from.id)) {
                return next();
            }
            await ctx.reply('❌ Sizda admin huquqi yo\'q!');
        };
    },
    
    // Premium tekshirish
    isPremium: (db) => {
        return async (ctx, next) => {
            const isPremium = await db.checkPremium(ctx.from.id);
            ctx.isPremium = isPremium;
            return next();
        };
    },
    
    // Rate limiting
    rateLimit: (maxRequests = 10, windowMs = 60000) => {
        const requests = new Map();
        
        return async (ctx, next) => {
            const userId = ctx.from.id;
            const now = Date.now();
            
            if (!requests.has(userId)) {
                requests.set(userId, []);
            }
            
            const userRequests = requests.get(userId);
            const recentRequests = userRequests.filter(time => now - time < windowMs);
            
            if (recentRequests.length >= maxRequests) {
                return ctx.reply('⏰ Iltimos, biroz kuting...');
            }
            
            recentRequests.push(now);
            requests.set(userId, recentRequests);
            
            return next();
        };
    },
    
    // Logging
    logger: () => {
        return async (ctx, next) => {
            const start = Date.now();
            const user = ctx.from;
            
            console.log(`[${new Date().toISOString()}] ${user.id} (@${user.username}): ${ctx.message?.text || 'callback'}`);
            
            await next();
            
            const duration = Date.now() - start;
            console.log(`  ↳ Completed in ${duration}ms`);
        };
    },
    
    // Error handler
    errorHandler: () => {
        return async (ctx, next) => {
            try {
                await next();
            } catch (error) {
                console.error('Error:', error);
                await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
            }
        };
    }
};

module.exports = middleware;


// ============================================
// FILE: analytics.js
// ============================================
class Analytics {
    constructor(db) {
        this.db = db;
    }
    
    async getStats() {
        const totalUsers = Object.keys(this.db.users).length;
        const totalMovies = Object.keys(this.db.movies).length;
        const totalViews = this.db.analytics.total.views;
        const totalSearches = this.db.analytics.total.searches;
        
        // Bugungi statistika
        const today = new Date().toISOString().split('T')[0];
        const todayStats = this.db.analytics.daily[today] || {
            views: 0,
            searches: 0,
            newUsers: 0
        };
        
        // Eng ko'p ko'rilgan kinolar
        const topMovies = Object.entries(this.db.movies)
            .sort(([, a], [, b]) => (b.views || 0) - (a.views || 0))
            .slice(0, 5)
            .map(([code, movie]) => ({ code, title: movie.title, views: movie.views || 0 }));
        
        // Aktiv foydalanuvchilar (oxirgi 7 kun)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const activeUsers = Object.values(this.db.users).filter(user => {
            const lastActive = new Date(user.lastActive);
            return lastActive > weekAgo;
        }).length;
        
        return {
            total: {
                users: totalUsers,
                movies: totalMovies,
                views: totalViews,
                searches: totalSearches,
                channels: this.db.channels.length
            },
            today: todayStats,
            topMovies,
            activeUsers
        };
    }
    
    async getDailyStats(days = 7) {
        const stats = [];
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const dayStats = this.db.analytics.daily[dateStr] || {
                views: 0,
                searches: 0,
                newUsers: 0
            };
            
            stats.push({
                date: dateStr,
                ...dayStats
            });
        }
        
        return stats;
    }
    
    async getUserAnalytics(userId) {
        const user = this.db.users[userId];
        
        if (!user) return null;
        
        return {
            watchCount: user.watchCount || 0,
            searchCount: user.searchCount || 0,
            joinedDate: user.joinedDate,
            lastActive: user.lastActive,
            isPremium: await this.db.checkPremium(userId)
        };
    }
}

module.exports = Analytics;


// ============================================
// FILE: admin.js
// ============================================
class AdminPanel {
    constructor(bot, db, analytics) {
        this.bot = bot;
        this.db = db;
        this.analytics = analytics;
    }
    
    async showMainPanel(chatId, messageId = null) {
        const buttons = [
            [
                { text: '➕ Kino qo\'shish', callback_data: 'admin_add_movie' },
                { text: '🗑 Kino o\'chirish', callback_data: 'admin_delete_movie' }
            ],
            [
                { text: '📢 Kanal qo\'shish', callback_data: 'admin_add_channel' },
                { text: '📋 Kanallar', callback_data: 'admin_list_channels' }
            ],
            [
                { text: '📊 Statistika', callback_data: 'admin_stats' },
                { text: '🎬 Kinolar', callback_data: 'admin_list_movies' }
            ],
            [
                { text: '📣 Xabar yuborish', callback_data: 'admin_broadcast' },
                { text: '💎 Premium berish', callback_data: 'admin_give_premium' }
            ],
            [
                { text: '📈 Analytics', callback_data: 'admin_analytics' },
                { text: '👥 Foydalanuvchilar', callback_data: 'admin_users' }
            ]
        ];
        
        const text = '⚙️ <b>ADMIN PANEL</b>\n\nKerakli bo\'limni tanlang:';
        const options = {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons }
        };
        
        if (messageId) {
            await this.bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                ...options
            });
        } else {
            await this.bot.sendMessage(chatId, text, options);
        }
    }
    
    async showStats(chatId, messageId) {
        const stats = await this.analytics.getStats();
        
        const text = `📊 <b>BOT STATISTIKASI</b>

📈 <b>Umumiy:</b>
├ 👥 Foydalanuvchilar: ${stats.total.users}
├ 🎬 Kinolar: ${stats.total.movies}
├ 👁 Jami ko'rishlar: ${stats.total.views}
├ 🔍 Jami qidiruvlar: ${stats.total.searches}
└ 📢 Kanallar: ${stats.total.channels}

📅 <b>Bugun:</b>
├ 👁 Ko'rishlar: ${stats.today.views}
├ 🔍 Qidiruvlar: ${stats.today.searches}
└ 👤 Yangi foydalanuvchilar: ${stats.today.newUsers}

🔥 <b>Eng mashhur kinolar:</b>
${stats.topMovies.map((m, i) => `${i + 1}. ${m.title} - ${m.views} ko'rish`).join('\n')}

👤 Faol foydalanuvchilar (7 kun): ${stats.activeUsers}`;
        
        await this.bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Orqaga', callback_data: 'admin_panel' }]]
            }
        });
    }
    
    async showAnalytics(chatId, messageId) {
        const dailyStats = await this.analytics.getDailyStats(7);
        
        let text = '📈 <b>7 KUNLIK STATISTIKA</b>\n\n';
        
        dailyStats.forEach(day => {
            const date = new Date(day.date).toLocaleDateString('uz-UZ', { 
                day: 'numeric', 
                month: 'short' 
            });
            text += `📅 <b>${date}</b>\n`;
            text += `├ 👁 Ko'rishlar: ${day.views}\n`;
            text += `├ 🔍 Qidiruvlar: ${day.searches}\n`;
            text += `└ 👤 Yangi: ${day.newUsers}\n\n`;
        });
        
        await this.bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Orqaga', callback_data: 'admin_panel' }]]
            }
        });
    }
    
    async showUsersList(chatId, messageId, page = 0) {
        const users = Object.entries(this.db.users);
        const perPage = 10;
        const start = page * perPage;
        const end = start + perPage;
        const pageUsers = users.slice(start, end);
        
        let text = `👥 <b>FOYDALANUVCHILAR</b> (${users.length} ta)\n\n`;
        
        for (const [userId, user] of pageUsers) {
            const isPremium = await this.db.checkPremium(userId);
            const premiumBadge = isPremium ? '💎' : '';
            
            text += `${premiumBadge} <b>${user.firstName}</b> (@${user.username || 'N/A'})\n`;
            text += `├ ID: <code>${userId}</code>\n`;
            text += `├ Ko'rishlar: ${user.watchCount || 0}\n`;
            text += `└ Qo'shildi: ${new Date(user.joinedDate).toLocaleDateString('uz-UZ')}\n\n`;
        }
        
        const buttons = [];
        const navButtons = [];
        
        if (page > 0) {
            navButtons.push({ text: '⬅️ Orqaga', callback_data: `admin_users_${page - 1}` });
        }
        if (end < users.length) {
            navButtons.push({ text: 'Keyingi ➡️', callback_data: `admin_users_${page + 1}` });
        }
        
        if (navButtons.length > 0) buttons.push(navButtons);
        buttons.push([{ text: '🔙 Bosh menu', callback_data: 'admin_panel' }]);
        
        await this.bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons }
        });
    }
}

module.exports = AdminPanel;
