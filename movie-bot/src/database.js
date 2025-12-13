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
