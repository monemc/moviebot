require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { connectDB, User, DownloadLog } = require('./database');
const { searchMovies, getMovieDetails, getTrending, getTrailer, formatMovieInfo } = require('./tmdb');
const { subscriptionRequired, downloadCheck } = require('./middleware');
const { scheduleStatsUpdate } = require('./analytics');
const { getPersonalizedRecommendations, translate, getUserLanguage, setUserLanguage, addToWatchlist, removeFromWatchlist, generateShareMessage } = require('./premium');
const { setupErrorLogging, startHealthMonitoring } = require('./monitoring');

const bot = new Telegraf(process.env.BOT_TOKEN);

// MongoDB ulanish
connectDB();

// Error logging
setupErrorLogging();

// Health monitoring
startHealthMonitoring(bot);

// Statistika avtomatik yangilash
scheduleStatsUpdate();

// /start komandasi
bot.start(subscriptionRequired, async (ctx) => {
  const user = ctx.from;
  
  // Foydalanuvchini bazaga saqlash
  await User.findOneAndUpdate(
    { telegramId: user.id },
    {
      telegramId: user.id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      isSubscribed: true,
      lastActivity: new Date()
    },
    { upsert: true, new: true }
  );

  const lang = await getUserLanguage(user.id);
  const welcomeText = `
🎬 <b>${translate('welcome', lang)}</b>

Salom, ${user.first_name}! 👋

Bu bot orqali siz:
✅ Filmlarni qidira olasiz
✅ Shaxsiy tavsiyalar olasiz
✅ Trailerlarni ko'ra olasiz
✅ Sevimlilaringizga qo'sha olasiz
✅ Yuklab olish linklarini ola olasiz

📌 <b>Qanday Foydalanish?</b>
• Film nomini yuboring
• Yoki quyidagi tugmalardan foydalaning

🌐 Tilni o'zgartirish: /language

🎯 Qidirishni boshlang!
  `;

  await ctx.replyWithHTML(
    welcomeText,
    Markup.keyboard([
      ['🔥 Mashhur Filmlar', '🎯 Men Uchun'],
      ['🎭 Janrlar', '⭐ Sevimlilar'],
      ['📋 Watchlist', '🔍 Qidirish'],
      ['⚙️ Sozlamalar', 'ℹ️ Yordam']
    ]).resize()
  );
});

// Til o'zgartirish
bot.command('language', async (ctx) => {
  await ctx.reply(
    '🌐 <b>Tilni tanlang / Choose language:</b>',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🇺🇿 O\'zbekcha', 'lang_uz')],
        [Markup.button.callback('🇷🇺 Русский', 'lang_ru')],
        [Markup.button.callback('🇬🇧 English', 'lang_en')]
      ])
    }
  );
});

// Til callback
bot.action(/lang_(\w+)/, async (ctx) => {
  const lang = ctx.match[1];
  await setUserLanguage(ctx.from.id, lang);
  await ctx.answerCbQuery('✅ Til o\'zgartirildi!');
  await ctx.reply(`✅ ${translate('welcome', lang)}`);
});

// Shaxsiy tavsiyalar
bot.hears('🎯 Men Uchun', subscriptionRequired, async (ctx) => {
  await ctx.reply('⏳ Sizga mos filmlar qidirilmoqda...');
  
  const movies = await getPersonalizedRecommendations(ctx.from.id);
  
  if (movies.length === 0) {
    return ctx.reply('❌ Tavsiyalar topilmadi. Avval filmlarni sevimlilarga qo\'shing!');
  }

  await ctx.reply('🎯 <b>Sizga mos filmlar:</b>', { parse_mode: 'HTML' });
  
  for (const movie of movies.slice(0, 5)) {
    await sendMovieCard(ctx, movie);
  }
});

// Mashhur filmlar
bot.hears('🔥 Mashhur Filmlar', subscriptionRequired, async (ctx) => {
  await ctx.reply('⏳ Mashhur filmlar yuklanmoqda...');
  
  const movies = await getTrending();
  
  if (movies.length === 0) {
    return ctx.reply('❌ Filmlar topilmadi. Iltimos, keyinroq urinib ko\'ring.');
  }

  for (const movie of movies.slice(0, 5)) {
    await sendMovieCard(ctx, movie);
  }
});

// Janrlar
bot.hears('🎭 Janrlar', subscriptionRequired, async (ctx) => {
  await ctx.reply(
    '🎭 <b>Janrni tanlang:</b>',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('🎬 Action', 'genre_28'),
          Markup.button.callback('😂 Comedy', 'genre_35')
        ],
        [
          Markup.button.callback('😱 Horror', 'genre_27'),
          Markup.button.callback('💕 Romance', 'genre_10749')
        ],
        [
          Markup.button.callback('🔬 Sci-Fi', 'genre_878'),
          Markup.button.callback('🎭 Drama', 'genre_18')
        ],
        [
          Markup.button.callback('🎪 Animation', 'genre_16'),
          Markup.button.callback('🕵️ Thriller', 'genre_53')
        ],
        [
          Markup.button.callback('⚔️ Adventure', 'genre_12'),
          Markup.button.callback('🎵 Musical', 'genre_10402')
        ]
      ])
    }
  );
});

// Janr bo'yicha filmlar
bot.action(/genre_(\d+)/, subscriptionRequired, async (ctx) => {
  const genreId = ctx.match[1];
  await ctx.answerCbQuery('⏳ Filmlar yuklanmoqda...');
  
  const { getMoviesByGenre } = require('./tmdb');
  const movies = await getMoviesByGenre(genreId);
  
  for (const movie of movies.slice(0, 5)) {
    await sendMovieCard(ctx, movie);
  }
});

// Sevimlilar
bot.hears('⭐ Sevimlilar', subscriptionRequired, async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  
  if (!user || user.favorites.length === 0) {
    return ctx.reply('📝 Sizning sevimli filmlaringiz yo\'q.\n\nFilmlarni sevimlilaringizga qo\'shish uchun ⭐ tugmasini bosing.');
  }

  await ctx.reply(`⭐ Sizning sevimli filmlaringiz (${user.favorites.length} ta):`);
  
  for (const movieId of user.favorites.slice(0, 10)) {
    const movie = await getMovieDetails(movieId);
    if (movie) {
      await sendMovieCard(ctx, movie);
    }
  }
});

// Watchlist
bot.hears('📋 Watchlist', subscriptionRequired, async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  
  if (!user || !user.watchlist || user.watchlist.length === 0) {
    return ctx.reply('📝 Watchlist bo\'sh.\n\nFilmlarni keyinroq ko\'rish uchun 📋 tugmasini bosing.');
  }

  await ctx.reply(`📋 Watchlist (${user.watchlist.length} ta):`);
  
  for (const movieId of user.watchlist.slice(0, 10)) {
    const movie = await getMovieDetails(movieId);
    if (movie) {
      await sendMovieCard(ctx, movie);
    }
  }
});

// Sozlamalar
bot.hears('⚙️ Sozlamalar', subscriptionRequired, async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  const stats = `
⚙️ <b>Sozlamalar</b>

👤 <b>Profil:</b>
• ID: <code>${ctx.from.id}</code>
• Ism: ${ctx.from.first_name}
• Username: @${ctx.from.username || 'N/A'}

📊 <b>Statistika:</b>
• Sevimlilar: ${user.favorites.length}
• Watchlist: ${user.watchlist?.length || 0}
• Qidiruvlar: ${user.totalSearches}
• Ro'yxatdan o'tgan: ${new Date(user.createdAt).toLocaleDateString('uz-UZ')}

⚙️ <b>Sozlamalar:</b>
  `;

  await ctx.replyWithHTML(
    stats,
    Markup.inlineKeyboard([
      [Markup.button.callback('🌐 Tilni o\'zgartirish', 'change_language')],
      [Markup.button.callback('🔔 Bildirishnomalar', 'toggle_notifications')],
      [Markup.button.callback('📊 Mening statistikam', 'my_stats')],
      [Markup.button.callback('🗑️ Ma\'lumotlarni o\'chirish', 'delete_data')]
    ])
  );
});

// Sozlamalar callbacks
bot.action('change_language', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    '🌐 <b>Tilni tanlang:</b>',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🇺🇿 O\'zbekcha', 'lang_uz')],
        [Markup.button.callback('🇷🇺 Русский', 'lang_ru')],
        [Markup.button.callback('🇬🇧 English', 'lang_en')]
      ])
    }
  );
});

bot.action('toggle_notifications', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  const newStatus = !user.notifications;
  
  await User.findOneAndUpdate(
    { telegramId: ctx.from.id },
    { notifications: newStatus }
  );
  
  await ctx.answerCbQuery(`${newStatus ? '🔔 Bildirishnomalar yoqildi' : '🔕 Bildirishnomalar o\'chirildi'}`);
});

bot.action('my_stats', async (ctx) => {
  const { getUserActivityAnalysis } = require('./analytics');
  const stats = await getUserActivityAnalysis(ctx.from.id);
  
  if (stats) {
    const message = `
📊 <b>Sizning statistikangiz</b>

📥 Jami yuklab olishlar: ${stats.totalDownloads}
⭐ Sevimlilar: ${stats.favoriteCount}
🔍 Qidiruvlar: ${stats.totalSearches}
📅 A'zo bo'lganingizdan: ${Math.floor((Date.now() - stats.memberSince) / (1000 * 60 * 60 * 24))} kun

🎬 <b>Oxirgi yuklab olishlar:</b>
${stats.recentDownloads.slice(0, 5).map((d, i) => `${i + 1}. ${d.movieTitle}`).join('\n')}
    `;
    
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(message);
  }
});

bot.action('delete_data', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    '⚠️ <b>Ma\'lumotlaringizni o\'chirish</b>\n\nRostdan ham barcha ma\'lumotlaringizni o\'chirmoqchimisiz?',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Ha, o\'chirish', 'confirm_delete')],
        [Markup.button.callback('❌ Yo\'q, bekor qilish', 'cancel_delete')]
      ])
    }
  );
});

bot.action('confirm_delete', async (ctx) => {
  await User.findOneAndDelete({ telegramId: ctx.from.id });
  await DownloadLog.deleteMany({ userId: ctx.from.id });
  
  await ctx.answerCbQuery('✅ Ma\'lumotlar o\'chirildi');
  await ctx.reply('👋 Ma\'lumotlaringiz o\'chirildi. /start ni bosib qaytadan boshlashingiz mumkin.');
});

bot.action('cancel_delete', async (ctx) => {
  await ctx.answerCbQuery('❌ Bekor qilindi');
});

// Film qidirish
bot.on('text', subscriptionRequired, async (ctx) => {
  const query = ctx.message.text;
  
  // Keyboard tugmalarini ignore qilish
  const keyboards = ['🔥 Mashhur Filmlar', '🎯 Men Uchun', '🎭 Janrlar', '⭐ Sevimlilar', '📋 Watchlist', '🔍 Qidirish', '⚙️ Sozlamalar', 'ℹ️ Yordam'];
  if (keyboards.includes(query)) return;

  await ctx.reply('🔍 Qidirilmoqda...');
  
  const movies = await searchMovies(query);
  
  // Statistikani yangilash
  await User.findOneAndUpdate(
    { telegramId: ctx.from.id },
    { $inc: { totalSearches: 1 }, lastActivity: new Date() }
  );
  
  if (movies.length === 0) {
    return ctx.reply('❌ Filmlar topilmadi. Boshqa nom bilan qidirib ko\'ring.');
  }

  await ctx.reply(`✅ ${movies.length} ta film topildi:`);
  
  for (const movie of movies.slice(0, 5)) {
    await sendMovieCard(ctx, movie);
  }
});

// Film kartasini yuborish
async function sendMovieCard(ctx, movie) {
  const info = formatMovieInfo(movie);
  const user = await User.findOne({ telegramId: ctx.from.id });
  
  const isFavorite = user?.favorites?.includes(info.id);
  const isInWatchlist = user?.watchlist?.includes(info.id);
  
  const caption = `
🎬 <b>${info.title}</b> (${info.year})

⭐ Reyting: ${info.rating}/10
🎭 Janr: ${info.genres}

📝 ${info.overview.substring(0, 200)}${info.overview.length > 200 ? '...' : ''}
  `;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🎥 Trailer', `trailer_${info.id}`),
      Markup.button.callback(isFavorite ? '❤️ Sevimli' : '⭐ Sevimli', `favorite_${info.id}`)
    ],
    [
      Markup.button.callback(isInWatchlist ? '✅ Watchlist' : '📋 Watchlist', `watchlist_${info.id}`),
      Markup.button.callback('📤 Ulashish', `share_${info.id}`)
    ],
    [
      Markup.button.callback('📥 Yuklab Olish', `download_${info.id}`)
    ]
  ]);

  try {
    if (info.poster) {
      await ctx.replyWithPhoto(info.poster, {
        caption: caption,
        parse_mode: 'HTML',
        ...keyboard
      });
    } else {
      await ctx.replyWithHTML(caption, keyboard);
    }
  } catch (error) {
    console.error('Film kartasi yuborishda xato:', error.message);
  }
}

// Trailer
bot.action(/trailer_(\d+)/, async (ctx) => {
  const movieId = ctx.match[1];
  await ctx.answerCbQuery('⏳ Trailer qidirilmoqda...');
  
  const trailerUrl = await getTrailer(movieId);
  
  if (trailerUrl) {
    await ctx.reply(
      '🎥 <b>Trailer:</b>',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.url('▶️ Trailer Ko\'rish', trailerUrl)]
        ])
      }
    );
  } else {
    await ctx.reply('❌ Trailer topilmadi.');
  }
});

// Sevimlilar
bot.action(/favorite_(\d+)/, async (ctx) => {
  const movieId = parseInt(ctx.match[1]);
  const user = await User.findOne({ telegramId: ctx.from.id });
  
  if (user.favorites.includes(movieId)) {
    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { $pull: { favorites: movieId } }
    );
    await ctx.answerCbQuery('💔 Sevimlilardan o\'chirildi');
  } else {
    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { $addToSet: { favorites: movieId } }
    );
    await ctx.answerCbQuery('❤️ Sevimlilarga qo\'shildi!');
  }
});

// Watchlist
bot.action(/watchlist_(\d+)/, async (ctx) => {
  const movieId = parseInt(ctx.match[1]);
  const user = await User.findOne({ telegramId: ctx.from.id });
  
  if (user.watchlist && user.watchlist.includes(movieId)) {
    await removeFromWatchlist(ctx.from.id, movieId);
    await ctx.answerCbQuery('❌ Watchlist\'dan o\'chirildi');
  } else {
    await addToWatchlist(ctx.from.id, movieId);
    await ctx.answerCbQuery('✅ Watchlist\'ga qo\'shildi!');
  }
});

// Ulashish
bot.action(/share_(\d+)/, async (ctx) => {
  const movieId = parseInt(ctx.match[1]);
  const movie = await getMovieDetails(movieId);
  
  if (movie) {
    const shareText = generateShareMessage(movie);
    await ctx.answerCbQuery();
    await ctx.replyWithMarkdown(shareText);
  }
});

// Yuklab olish
bot.action(/download_(\d+)/, async (ctx) => {
  const movieId = parseInt(ctx.match[1]);
  const movie = await getMovieDetails(movieId);
  
  if (!movie) {
    return ctx.answerCbQuery('❌ Film ma\'lumotlari topilmadi');
  }

  const canDownload = await downloadCheck(ctx, movieId, movie.title);
  
  if (!canDownload) {
    return;
  }

  await ctx.answerCbQuery('✅ Yuklab olish linki yuborildi!');
  
  await DownloadLog.create({
    userId: ctx.from.id,
    movieId: movieId,
    movieTitle: movie.title
  });

  const downloadLinks = `
🎬 <b>${movie.title}</b>

📥 <b>Yuklab Olish Linklari:</b>

<b>Sifat:</b> 1080p BluRay
🔗 <a href="https://example.com/download/${movieId}/1080p">Yuklab olish 1080p</a>

<b>Sifat:</b> 720p
🔗 <a href="https://example.com/download/${movieId}/720p">Yuklab olish 720p</a>

<b>Sifat:</b> 480p
🔗 <a href="https://example.com/download/${movieId}/480p">Yuklab olish 480p</a>

⚠️ <i>Linklar 24 soat amal qiladi</i>

💡 <b>Eslatma:</b> Bu demo linklar. O'z server yoki CDN linkingizni qo'shing.
  `;

  await ctx.replyWithHTML(downloadLinks);
});

// Obuna tekshirish
bot.action('check_subscription', async (ctx) => {
  const { checkSubscription } = require('./middleware');
  const isSubscribed = await checkSubscription(ctx);
  
  if (isSubscribed) {
    await ctx.answerCbQuery('✅ Obuna tasdiqlandi!');
    await ctx.reply('✅ Ajoyib! Endi botdan to\'liq foydalanishingiz mumkin.\n\n/start ni bosing.');
  } else {
    await ctx.answerCbQuery('❌ Hali obuna bo\'lmagansiz!', { show_alert: true });
  }
});

// Yuklab olishni qayta urinish
bot.action(/download_retry_(\d+)/, async (ctx) => {
  const movieId = parseInt(ctx.match[1]);
  const movie = await getMovieDetails(movieId);
  
  const canDownload = await downloadCheck(ctx, movieId, movie.title);
  
  if (canDownload) {
    await ctx.answerCbQuery('✅ Yuklab olish linki yuborildi!');
    
    await DownloadLog.create({
      userId: ctx.from.id,
      movieId: movieId,
      movieTitle: movie.title
    });
    
    const downloadLinks = `
🎬 <b>${movie.title}</b>

📥 Yuklab olish linki yuqorida berilgan.
    `;
    await ctx.replyWithHTML(downloadLinks);
  }
});

// Yordam
bot.hears('ℹ️ Yordam', async (ctx) => {
  const helpText = `
ℹ️ <b>Bot Qo'llanma</b>

<b>Asosiy Funksiyalar:</b>

🔍 <b>Qidirish:</b>
Film nomini yuboring va natijalarni ko'ring

🔥 <b>Mashhur Filmlar:</b>
Eng ko'p ko'rilgan filmlar ro'yxati

🎯 <b>Men Uchun:</b>
Sizga mos shaxsiy tavsiyalar

🎭 <b>Janrlar:</b>
O'zingizga yoqqan janrdagi filmlarni toping

⭐ <b>Sevimlilar:</b>
Sevimli filmlaringizni saqlang

📋 <b>Watchlist:</b>
Keyinroq ko'rish uchun saqlang

📥 <b>Yuklab Olish:</b>
Filmlarni turli sifatda yuklab oling

⚙️ <b>Sozlamalar:</b>
Tilni o'zgartirish va statistika

⚠️ <b>Muhim:</b>
Botdan foydalanish uchun kanalimizga obuna bo'ling!

🎬 <b>Premium Funksiyalar:</b>
• AI tavsiyalar
• Ko'p tillilik
• Watchlist
• Statistika
• Ulashish

💬 Savol yoki takliflar: @support_username
🌐 Veb-sayt: https://your-website.com
  `;
  
  await ctx.replyWithHTML(helpText);
});

// Xatoliklarni tutish
bot.catch((err, ctx) => {
  console.error('Bot xatosi:', err);
  ctx.reply('❌ Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
});

// Admin panel
require('./admin')(bot);

// Botni ishga tushirish
// Render.com uchun webhook (production)
// Local uchun polling (development)
if (process.env.RENDER) {
  // Render.com - webhook mode
  const domain = process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`;
  
  bot.launch({
    webhook: {
      domain: domain,
      port: process.env.PORT || 10000,
      hookPath: '/webhook'
    }
  }).then(() => {
    console.log('✅ Bot ishga tushdi (Webhook mode)!');
    console.log(`🤖 Bot username: @${bot.botInfo.username}`);
    console.log(`🌐 Domain: ${domain}`);
    console.log(`📊 Admin panel: ${domain}/admin/login`);
  }).catch(err => {
    console.error('❌ Bot ishga tushmadi:', err);
  });
} else {
  // Local - polling mode
  bot.launch()
    .then(() => {
      console.log('✅ Bot ishga tushdi (Polling mode)!');
      console.log(`🤖 Bot username: @${bot.botInfo.username}`);
      console.log(`📊 Admin panel: http://localhost:${process.env.PORT || 3000}/admin/login`);
    })
    .catch(err => {
      console.error('❌ Bot ishga tushmadi:', err);
    });
}

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));