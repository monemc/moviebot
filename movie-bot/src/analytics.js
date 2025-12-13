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
