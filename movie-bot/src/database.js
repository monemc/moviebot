const mongoose = require('mongoose');

// MongoDB ulanish
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB ulanish muvaffaqiyatli');
  } catch (error) {
    console.error('❌ MongoDB ulanish xatosi:', error);
    process.exit(1);
  }
};

// Foydalanuvchi Schema
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: String,
  firstName: String,
  lastName: String,
  isSubscribed: { type: Boolean, default: false },
  favorites: [{ type: Number }], // Film IDlar
  watchlist: [{ type: Number }],
  language: { type: String, default: 'uz' },
  notifications: { type: Boolean, default: true },
  ratings: { type: Map, of: Object },
  lastActivity: { type: Date, default: Date.now },
  totalSearches: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Statistika Schema
const statsSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  totalUsers: Number,
  activeUsers: Number,
  totalSearches: Number,
  newUsers: Number,
  popularMovies: [{ movieId: Number, title: String, count: Number }]
});

// Film Yuklab Olish Loglar
const downloadLogSchema = new mongoose.Schema({
  userId: Number,
  movieId: Number,
  movieTitle: String,
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Stats = mongoose.model('Stats', statsSchema);
const DownloadLog = mongoose.model('DownloadLog', downloadLogSchema);


module.exports = { connectDB, User, Stats, DownloadLog };
