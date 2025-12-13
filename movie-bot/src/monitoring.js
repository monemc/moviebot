class Monitoring {
    constructor(bot, adminIds) {
        this.bot = bot;
        this.adminIds = adminIds;
        this.startTime = Date.now();
        this.errors = [];
        this.requests = 0;
    }
    
    logError(error, context = '') {
        const errorLog = {
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack,
            context
        };
        
        this.errors.push(errorLog);
        console.error('Error logged:', errorLog);
        
        // Admin'larga xabar yuborish
        this.notifyAdmins(`❌ <b>Xatolik:</b>\n\n${error.message}\n\nContext: ${context}`);
        
        // Faqat oxirgi 100 ta xatolikni saqlash
        if (this.errors.length > 100) {
            this.errors.shift();
        }
    }
    
    async notifyAdmins(message) {
        for (const adminId of this.adminIds) {
            try {
                await this.bot.sendMessage(adminId, message, { parse_mode: 'HTML' });
            } catch (error) {
                console.error('Failed to notify admin:', error);
            }
        }
    }
    
    getUptime() {
        const uptime = Date.now() - this.startTime;
        const hours = Math.floor(uptime / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        
        return `${hours}h ${minutes}m`;
    }
    
    async getStatus() {
        const memoryUsage = process.memoryUsage();
        
        return {
            uptime: this.getUptime(),
            requests: this.requests,
            errors: this.errors.length,
            memory: {
                used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
                total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB'
            },
            lastErrors: this.errors.slice(-5)
        };
    }
    
    incrementRequests() {
        this.requests++;
    }
}

module.exports = Monitoring;
