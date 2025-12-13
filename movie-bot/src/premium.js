class PremiumManager {
    constructor(db) {
        this.db = db;
        this.plans = {
            '1month': { duration: 30, price: 10000, name: '1 oylik' },
            '3months': { duration: 90, price: 25000, name: '3 oylik' },
            '1year': { duration: 365, price: 80000, name: '1 yillik' }
        };
    }
    
    async showPlans(chatId, bot) {
        const buttons = Object.entries(this.plans).map(([key, plan]) => {
            return [{
                text: `${plan.name} - ${plan.price.toLocaleString('uz-UZ')} so'm`,
                callback_data: `premium_buy_${key}`
            }];
        });
        
        buttons.push([{ text: '🔙 Orqaga', callback_data: 'back_to_main' }]);
        
        const text = `💎 <b>PREMIUM OBUNA</b>

🎯 Premium afzalliklari:
✅ Reklamasiz tomosha
✅ Yuqori sifatli kinolar
✅ Yangi kinolarga birinchi bo'lib kirish
✅ Offline yuklab olish
✅ Maxsus yordam

📦 Tariflarni tanlang:`;
        
        await bot.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons }
        });
    }
    
    async processPurchase(userId, planKey, bot) {
        const plan = this.plans[planKey];
        
        if (!plan) return false;
        
        // Bu yerda to'lov tizimini ulash kerak (Click, Payme, etc.)
        // Hozircha test rejimda
        
        await this.db.setPremium(userId, plan.duration);
        
        return true;
    }
    
    async checkStatus(userId) {
        const premium = this.db.premium[userId];
        
        if (!premium || !premium.active) {
            return {
                active: false,
                message: '❌ Sizda premium obuna yo\'q'
            };
        }
        
        const expires = new Date(premium.expiresAt);
        const daysLeft = Math.ceil((expires - new Date()) / (1000 * 60 * 60 * 24));
        
        return {
            active: true,
            daysLeft,
            expiresAt: expires.toLocaleDateString('uz-UZ'),
            message: `💎 Premium faol\n\n📅 Tugash sanasi: ${expires.toLocaleDateString('uz-UZ')}\n⏰ Qolgan kunlar: ${daysLeft}`
        };
    }
}

module.exports = PremiumManager;
