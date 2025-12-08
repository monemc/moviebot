const { User } = require('./database');
const { Markup } = require('telegraf');

// Obuna tekshirish middleware
async function subscriptionRequired(ctx, next) {
  const userId = ctx.from.id;
  const channelId = process.env.CHANNEL_ID;
  
  try {
    const member = await ctx.telegram.getChatMember(channelId, userId);
    const isSubscribed = ['creator', 'administrator', 'member'].includes(member.status);
    
    if (isSubscribed) {
      // Foydalanuvchini yangilash
      await User.findOneAndUpdate(
        { telegramId: userId },
        { isSubscribed: true, lastActivity: new Date() },
        { upsert: true }
      );
      return next();
    }
    
    // Obuna bo'lmagan
    await ctx.reply(
      '⚠️ <b>Botdan foydalanish uchun kanalimizga obuna bo\'lishingiz kerak!</b>',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.url('📢 Kanalga Obuna Bo\'lish', `https://t.me/${channelId.replace('@', '')}`)],
          [Markup.button.callback('✅ Obunani Tekshirish', 'check_subscription')]
        ])
      }
    );
  } catch (error) {
    console.error('❌ Obuna tekshirish xatosi:', error);
    return next(); // Xatolikda davom ettirish
  }
}

// Obuna tekshirish (callback uchun)
async function checkSubscription(ctx) {
  const userId = ctx.from.id;
  const channelId = process.env.CHANNEL_ID;
  
  try {
    const member = await ctx.telegram.getChatMember(channelId, userId);
    return ['creator', 'administrator', 'member'].includes(member.status);
  } catch (error) {
    console.error('❌ Obuna tekshirish xatosi:', error);
    return false;
  }
}

// Yuklab olish limiti
async function downloadCheck(ctx, movieId, movieTitle) {
  const user = await User.findOne({ telegramId: ctx.from.id });
  
  // Premium foydalanuvchilar uchun limit yo'q
  if (user?.isPremium) {
    return true;
  }
  
  // Kunlik limit tekshirish (masalan, 5 ta)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const { DownloadLog } = require('./database');
  const todayDownloads = await DownloadLog.countDocuments({
    userId: ctx.from.id,
    timestamp: { $gte: today }
  });
  
  const DAILY_LIMIT = 5;
  
  if (todayDownloads >= DAILY_LIMIT) {
    await ctx.reply(
      `⚠️ <b>Kunlik limit tugadi!</b>\n\nSiz bugun ${DAILY_LIMIT} ta film yuklab oldingiz.\n\n💎 Premium obuna oling va cheklovsiz yuklab oling!`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Ertaga Qayta Urinish', `download_retry_${movieId}`)]
        ])
      }
    );
    return false;
  }
  
  return true;
}

module.exports = { subscriptionRequired, checkSubscription, downloadCheck };
