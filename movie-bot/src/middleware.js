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
