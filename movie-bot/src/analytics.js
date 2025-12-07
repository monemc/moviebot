const { User, Stats, DownloadLog } = require('./database');

// Kunlik statistika yaratish
async function generateDailyStats() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Bugungi yangi foydalanuvchilar
    const newUsers = await User.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow }
    });
    
    // Bugungi faol foydalanuvchilar
    const activeUsers = await User.countDocuments({
      lastActivity: { $gte: today, $lt: tomorrow }
    });
    
    // Bugungi qidiruvlar
    const searchesResult = await User.aggregate([
      {
        $match: {
          lastActivity: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: null,
          totalSearches: { $sum: '$totalSearches' }
        }
      }
    ]);
    
    const totalSearches = searchesResult.length > 0 ? searchesResult[0].totalSearches : 0;
    
    // Bugungi eng ko'p yuklab olingan filmlar
    const popularMovies = await DownloadLog.aggregate([
      {
        $match: {
          timestamp: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: { movieId: '$movieId', movieTitle: '$movieTitle' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      },
      {
        $project: {
          movieId: '$_id.movieId',
          title: '$_id.movieTitle',
          count: 1,
          _id: 0
        }
      }
    ]);
    
    // Jami foydalanuvchilar
    const totalUsers = await User.countDocuments();
    
    // Statistikani saqlash
    await Stats.create({
      date: today,
      totalUsers,
      activeUsers,
      totalSearches,
      newUsers,
      popularMovies
    });
    
    console.log('✅ Kunlik statistika saqlandi:', today.toLocaleDateString());
  } catch (error) {
    console.error('❌ Statistika xatosi:', error);
  }
}

// Haftalik hisobot
async function getWeeklyReport() {
  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const weeklyStats = await Stats.find({
      date: { $gte: weekAgo }
    }).sort({ date: 1 });
    
    return weeklyStats;
  } catch (error) {
    console.error('❌ Haftalik hisobot xatosi:', error);
    return [];
  }
}

// Oylik hisobot
async function getMonthlyReport() {
  try {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    
    const monthlyStats = await Stats.find({
      date: { $gte: monthAgo }
    }).sort({ date: 1 });
    
    return monthlyStats;
  } catch (error) {
    console.error('❌ Oylik hisobot xatosi:', error);
    return [];
  }
}

// Foydalanuvchi aktivlik tahlili
async function getUserActivityAnalysis(userId) {
  try {
    const user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      return null;
    }
    
    // Yuklab olish tarixi
    const downloads = await DownloadLog.find({ userId }).sort({ timestamp: -1 }).limit(50);
    
    // Eng ko'p yuklab olingan janrlar (bu TMDb dan olinadi)
    const downloadStats = {
      totalDownloads: downloads.length,
      recentDownloads: downloads.slice(0, 10),
      favoriteCount: user.favorites.length,
      totalSearches: user.totalSearches,
      memberSince: user.createdAt,
      lastActivity: user.lastActivity
    };
    
    return downloadStats;
  } catch (error) {
    console.error('❌ Foydalanuvchi tahlili xatosi:', error);
    return null;
  }
}

// Top foydalanuvchilar
async function getTopUsers(limit = 10) {
  try {
    const topUsers = await User.find()
      .sort({ totalSearches: -1 })
      .limit(limit)
      .select('telegramId firstName username totalSearches');
    
    return topUsers;
  } catch (error) {
    console.error('❌ Top foydalanuvchilar xatosi:', error);
    return [];
  }
}

// Statistika avtomatik yangilash (har kecha 00:00)
function scheduleStatsUpdate() {
  const now = new Date();
  const night = new Date();
  night.setHours(24, 0, 0, 0); // Keyingi kechasi 00:00
  
  const msUntilMidnight = night.getTime() - now.getTime();
  
  setTimeout(() => {
    generateDailyStats();
    // Har kuni takrorlanadi
    setInterval(generateDailyStats, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
  
  console.log('📊 Statistika avtomatik yangilash rejalashtirildi');
}

module.exports = {
  generateDailyStats,
  getWeeklyReport,
  getMonthlyReport,
  getUserActivityAnalysis,
  getTopUsers,
  scheduleStatsUpdate
};