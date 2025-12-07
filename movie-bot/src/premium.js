const { User } = require('./database');
const { getMovieDetails, searchMovies, formatMovieInfo } = require('./tmdb');

// AI-powered film tavsiyalari (foydalanuvchi tarixiga asoslangan)
async function getPersonalizedRecommendations(userId) {
  try {
    const user = await User.findOne({ telegramId: userId });
    
    if (!user || user.favorites.length === 0) {
      // Agar sevimli filmlar bo'lmasa, mashhur filmlarni qaytaradi
      const { getTrending } = require('./tmdb');
      return await getTrending();
    }
    
    // Sevimli filmlar asosida tavsiya
    const favoriteMovies = [];
    for (const movieId of user.favorites.slice(0, 3)) {
      const movie = await getMovieDetails(movieId);
      if (movie) {
        favoriteMovies.push(movie);
      }
    }
    
    // Birinchi sevimli film janrlariga asoslangan qidiruv
    if (favoriteMovies.length > 0 && favoriteMovies[0].genres && favoriteMovies[0].genres.length > 0) {
      const genreId = favoriteMovies[0].genres[0].id;
      const { getMoviesByGenre } = require('./tmdb');
      return await getMoviesByGenre(genreId);
    }
    
    // Default: mashhur filmlar
    const { getTrending } = require('./tmdb');
    return await getTrending();
  } catch (error) {
    console.error('❌ Tavsiya xatosi:', error);
    return [];
  }
}

// Multi-language support
const translations = {
  uz: {
    welcome: '🎬 Telegram Kino Bot\'ga Xush Kelibsiz!',
    search: '🔍 Qidirish',
    trending: '🔥 Mashhur Filmlar',
    genres: '🎭 Janrlar',
    favorites: '⭐ Sevimlilar',
    help: 'ℹ️ Yordam',
    subscribe_required: '⚠️ Botdan foydalanish uchun kanalimizga obuna bo\'lishingiz kerak!',
    subscribed: '✅ Obuna bo\'ldingiz, endi yuklab olish mumkin',
    no_results: '❌ Filmlar topilmadi',
    downloading: '📥 Yuklab olinmoqda...'
  },
  ru: {
    welcome: '🎬 Добро пожаловать в Telegram Кино Бот!',
    search: '🔍 Поиск',
    trending: '🔥 Популярные Фильмы',
    genres: '🎭 Жанры',
    favorites: '⭐ Избранное',
    help: 'ℹ️ Помощь',
    subscribe_required: '⚠️ Для использования бота подпишитесь на наш канал!',
    subscribed: '✅ Вы подписались, теперь можно скачивать',
    no_results: '❌ Фильмы не найдены',
    downloading: '📥 Скачивается...'
  },
  en: {
    welcome: '🎬 Welcome to Telegram Movie Bot!',
    search: '🔍 Search',
    trending: '🔥 Trending Movies',
    genres: '🎭 Genres',
    favorites: '⭐ Favorites',
    help: 'ℹ️ Help',
    subscribe_required: '⚠️ Please subscribe to our channel to use the bot!',
    subscribed: '✅ You\'re subscribed, you can now download',
    no_results: '❌ No movies found',
    downloading: '📥 Downloading...'
  }
};

function translate(key, lang = 'uz') {
  return translations[lang]?.[key] || translations['uz'][key];
}

// Foydalanuvchi tilini saqlash
async function setUserLanguage(userId, language) {
  try {
    await User.findOneAndUpdate(
      { telegramId: userId },
      { language: language },
      { upsert: true }
    );
  } catch (error) {
    console.error('❌ Til saqlash xatosi:', error);
  }
}

async function getUserLanguage(userId) {
  try {
    const user = await User.findOne({ telegramId: userId });
    return user?.language || 'uz';
  } catch (error) {
    return 'uz';
  }
}

// Film reytingi va sharh tizimi
async function rateMovie(userId, movieId, rating) {
  try {
    // MongoDB'ga reyting saqlash
    await User.findOneAndUpdate(
      { telegramId: userId },
      {
        $set: {
          [`ratings.${movieId}`]: {
            rating: rating,
            date: new Date()
          }
        }
      },
      { upsert: true }
    );
    
    return true;
  } catch (error) {
    console.error('❌ Reyting saqlash xatosi:', error);
    return false;
  }
}

// Watchlist (ko'rish uchun saqlangan filmlar)
async function addToWatchlist(userId, movieId) {
  try {
    await User.findOneAndUpdate(
      { telegramId: userId },
      { $addToSet: { watchlist: movieId } },
      { upsert: true }
    );
    return true;
  } catch (error) {
    console.error('❌ Watchlist xatosi:', error);
    return false;
  }
}

async function removeFromWatchlist(userId, movieId) {
  try {
    await User.findOneAndUpdate(
      { telegramId: userId },
      { $pull: { watchlist: movieId } }
    );
    return true;
  } catch (error) {
    console.error('❌ Watchlist o\'chirish xatosi:', error);
    return false;
  }
}

// Do'stlarga ulashish
function generateShareMessage(movie) {
  const info = formatMovieInfo(movie);
  return `
🎬 *${info.title}* (${info.year})

⭐ Reyting: ${info.rating}/10
🎭 Janr: ${info.genres}

📝 ${info.overview.substring(0, 150)}...

🤖 Bu filmni bizning botda toping!
👉 [Bot orqali ko'rish](https://t.me/your_bot_username?start=movie_${info.id})
  `;
}

// Push notifications (yangi filmlar uchun)
async function sendNewMovieNotification(bot, movie) {
  try {
    const users = await User.find({ notifications: true }, 'telegramId');
    
    const info = formatMovieInfo(movie);
    const message = `
🆕 *Yangi Film Qo'shildi!*

🎬 ${info.title} (${info.year})
⭐ ${info.rating}/10

📥 Hoziroq yuklab oling!
    `;
    
    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
      } catch (error) {
        // User botni bloklaganda xatolik
        console.log(`User ${user.telegramId} ga xabar yuborib bo'lmadi`);
      }
    }
  } catch (error) {
    console.error('❌ Notification xatosi:', error);
  }
}

// Statistika export (CSV)
async function exportUserStatsCSV() {
  try {
    const users = await User.find().lean();
    
    let csv = 'Telegram ID,Username,First Name,Favorites,Searches,Created At\n';
    
    for (const user of users) {
      csv += `${user.telegramId},${user.username || 'N/A'},${user.firstName || 'N/A'},${user.favorites.length},${user.totalSearches},${user.createdAt}\n`;
    }
    
    return csv;
  } catch (error) {
    console.error('❌ CSV export xatosi:', error);
    return '';
  }
}

module.exports = {
  getPersonalizedRecommendations,
  translate,
  setUserLanguage,
  getUserLanguage,
  rateMovie,
  addToWatchlist,
  removeFromWatchlist,
  generateShareMessage,
  sendNewMovieNotification,
  exportUserStatsCSV
};