const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { User, Stats, DownloadLog } = require('./database');

module.exports = function(bot) {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Middleware
  app.set('view engine', 'ejs');
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 soat
  }));

  // Admin kredentiallari
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
  const ADMIN_PASSWORD_HASH = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);

  // Auth middleware
  function requireAuth(req, res, next) {
    if (req.session.isAuthenticated) {
      return next();
    }
    res.redirect('/admin/login');
  }

  // Login sahifasi
  app.get('/admin/login', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="uz">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Login</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .login-container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            width: 400px;
          }
          h1 {
            color: #667eea;
            margin-bottom: 30px;
            text-align: center;
          }
          .form-group {
            margin-bottom: 20px;
          }
          label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 600;
          }
          input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border 0.3s;
          }
          input:focus {
            outline: none;
            border-color: #667eea;
          }
          button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
          }
          button:hover {
            transform: translateY(-2px);
          }
          .error {
            color: #e74c3c;
            margin-top: 10px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="login-container">
          <h1>🎬 Admin Panel</h1>
          <form method="POST" action="/admin/login">
            <div class="form-group">
              <label>Username:</label>
              <input type="text" name="username" required>
            </div>
            <div class="form-group">
              <label>Parol:</label>
              <input type="password" name="password" required>
            </div>
            <button type="submit">Kirish</button>
            ${req.query.error ? '<p class="error">❌ Username yoki parol xato!</p>' : ''}
          </form>
        </div>
      </body>
      </html>
    `);
  });

  // Login POST
  app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === ADMIN_USERNAME && bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
      req.session.isAuthenticated = true;
      res.redirect('/admin/dashboard');
    } else {
      res.redirect('/admin/login?error=1');
    }
  });

  // Logout
  app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
  });

  // Dashboard
  app.get('/admin/dashboard', requireAuth, async (req, res) => {
    try {
      const totalUsers = await User.countDocuments();
      const subscribedUsers = await User.countDocuments({ isSubscribed: true });
      const totalDownloads = await DownloadLog.countDocuments();
      
      // Oxirgi 30 kunlik foydalanuvchilar
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const activeUsers = await User.countDocuments({ 
        lastActivity: { $gte: thirtyDaysAgo } 
      });

      // Eng ko'p yuklab olingan filmlar
      const topMovies = await DownloadLog.aggregate([
        { $group: { _id: '$movieTitle', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);

      // Oxirgi foydalanuvchilar
      const recentUsers = await User.find()
        .sort({ createdAt: -1 })
        .limit(10);

      res.send(generateDashboardHTML({
        totalUsers,
        subscribedUsers,
        activeUsers,
        totalDownloads,
        topMovies,
        recentUsers
      }));
    } catch (error) {
      console.error('Dashboard xatosi:', error);
      res.status(500).send('Server xatosi');
    }
  });

  // Foydalanuvchilar ro'yxati
  app.get('/admin/users', requireAuth, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 50;
      const skip = (page - 1) * limit;

      const users = await User.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const totalUsers = await User.countDocuments();
      const totalPages = Math.ceil(totalUsers / limit);

      res.send(generateUsersHTML(users, page, totalPages));
    } catch (error) {
      console.error('Users list xatosi:', error);
      res.status(500).send('Server xatosi');
    }
  });

  // Foydalanuvchini o'chirish
  app.post('/admin/users/:id/delete', requireAuth, async (req, res) => {
    try {
      await User.findByIdAndDelete(req.params.id);
      res.redirect('/admin/users');
    } catch (error) {
      console.error('User delete xatosi:', error);
      res.status(500).send('Server xatosi');
    }
  });

  // Broadcast xabar
  app.post('/admin/broadcast', requireAuth, async (req, res) => {
    try {
      const { message } = req.body;
      const users = await User.find({}, 'telegramId');
      
      let sent = 0;
      let failed = 0;

      for (const user of users) {
        try {
          await bot.telegram.sendMessage(user.telegramId, message, { parse_mode: 'HTML' });
          sent++;
        } catch (error) {
          failed++;
        }
      }

      res.json({ success: true, sent, failed });
    } catch (error) {
      console.error('Broadcast xatosi:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Export users CSV
  app.get('/admin/export/users', requireAuth, async (req, res) => {
    try {
      const { exportUserStatsCSV } = require('./premium');
      const csv = await exportUserStatsCSV();
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
      res.send(csv);
    } catch (error) {
      console.error('CSV export xatosi:', error);
      res.status(500).send('Server xatosi');
    }
  });

  // Health check endpoint
  const { setupHealthEndpoint } = require('./monitoring');
  setupHealthEndpoint(app, bot);

  // Server ishga tushirish
  app.listen(PORT, () => {
    console.log(`🌐 Admin panel: http://localhost:${PORT}/admin/login`);
    console.log(`❤️  Health check: http://localhost:${PORT}/health`);
  });
};

// Dashboard HTML
function generateDashboardHTML(stats) {
  return `
<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header h1 { margin-bottom: 10px; }
    .nav {
      display: flex;
      gap: 20px;
      margin-top: 15px;
    }
    .nav a {
      color: white;
      text-decoration: none;
      padding: 8px 16px;
      background: rgba(255,255,255,0.2);
      border-radius: 6px;
      transition: background 0.3s;
    }
    .nav a:hover { background: rgba(255,255,255,0.3); }
    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: white;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }
    .stat-card h3 {
      color: #666;
      font-size: 14px;
      margin-bottom: 10px;
      text-transform: uppercase;
    }
    .stat-card .value {
      font-size: 36px;
      font-weight: bold;
      color: #667eea;
    }
    .card {
      background: white;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .card h2 {
      margin-bottom: 20px;
      color: #333;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e0e0e0;
    }
    th {
      background: #f5f5f5;
      font-weight: 600;
    }
    .broadcast-form textarea {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 14px;
      resize: vertical;
      min-height: 100px;
    }
    .broadcast-form button {
      margin-top: 10px;
      padding: 12px 30px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎬 Kino Bot Admin Panel</h1>
    <div class="nav">
      <a href="/admin/dashboard">Dashboard</a>
      <a href="/admin/users">Foydalanuvchilar</a>
      <a href="/admin/logout">Chiqish</a>
    </div>
  </div>
  
  <div class="container">
    <div class="stats-grid">
      <div class="stat-card">
        <h3>Jami Foydalanuvchilar</h3>
        <div class="value">${stats.totalUsers}</div>
      </div>
      <div class="stat-card">
        <h3>Obuna Bo'lganlar</h3>
        <div class="value">${stats.subscribedUsers}</div>
      </div>
      <div class="stat-card">
        <h3>Faol Foydalanuvchilar</h3>
        <div class="value">${stats.activeUsers}</div>
      </div>
      <div class="stat-card">
        <h3>Jami Yuklab Olishlar</h3>
        <div class="value">${stats.totalDownloads}</div>
      </div>
    </div>

    <div class="card">
      <h2>📢 Broadcast Xabar</h2>
      <form class="broadcast-form" id="broadcastForm">
        <textarea name="message" placeholder="Xabaringizni kiriting..." required></textarea>
        <button type="submit">Yuborish</button>
      </form>
      <div id="broadcastResult"></div>
    </div>

    <div class="card">
      <h2>🎬 Top 10 Eng Ko'p Yuklab Olingan Filmlar</h2>
      <table>
        <thead>
          <tr>
            <th>Film</th>
            <th>Yuklab Olishlar</th>
          </tr>
        </thead>
        <tbody>
          ${stats.topMovies.map(m => `
            <tr>
              <td>${m._id}</td>
              <td>${m.count}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>👥 Oxirgi Foydalanuvchilar</h2>
      <table>
        <thead>
          <tr>
            <th>Ism</th>
            <th>Username</th>
            <th>Ro'yxatdan o'tgan</th>
          </tr>
        </thead>
        <tbody>
          ${stats.recentUsers.map(u => `
            <tr>
              <td>${u.firstName || 'N/A'}</td>
              <td>@${u.username || 'N/A'}</td>
              <td>${new Date(u.createdAt).toLocaleDateString('uz-UZ')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    document.getElementById('broadcastForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = e.target.message.value;
      const resultDiv = document.getElementById('broadcastResult');
      
      resultDiv.innerHTML = '⏳ Xabar yuborilmoqda...';
      
      try {
        const res = await fetch('/admin/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        });
        
        const data = await res.json();
        
        if (data.success) {
          resultDiv.innerHTML = \`✅ Yuborildi: \${data.sent}, Xato: \${data.failed}\`;
          e.target.reset();
        } else {
          resultDiv.innerHTML = '❌ Xatolik yuz berdi';
        }
      } catch (error) {
        resultDiv.innerHTML = '❌ Server xatosi';
      }
    });
  </script>
</body>
</html>
  `;
}

// Users list HTML
function generateUsersHTML(users, page, totalPages) {
  return `
<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Foydalanuvchilar</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
    }
    .nav {
      display: flex;
      gap: 20px;
      margin-top: 15px;
    }
    .nav a {
      color: white;
      text-decoration: none;
      padding: 8px 16px;
      background: rgba(255,255,255,0.2);
      border-radius: 6px;
    }
    .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
    .card {
      background: white;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e0e0e0;
    }
    th { background: #f5f5f5; font-weight: 600; }
    .pagination {
      display: flex;
      gap: 10px;
      justify-content: center;
      margin-top: 20px;
    }
    .pagination a {
      padding: 8px 16px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 6px;
    }
    .pagination a.active { background: #764ba2; }
    .delete-btn {
      padding: 6px 12px;
      background: #e74c3c;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>👥 Foydalanuvchilar</h1>
    <div class="nav">
      <a href="/admin/dashboard">Dashboard</a>
      <a href="/admin/users">Foydalanuvchilar</a>
      <a href="/admin/logout">Chiqish</a>
    </div>
  </div>
  
  <div class="container">
    <div class="card">
      <h2>Barcha Foydalanuvchilar (${users.length} ta)</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Ism</th>
            <th>Username</th>
            <th>Obuna</th>
            <th>Qidiruvlar</th>
            <th>Ro'yxatdan</th>
            <th>Harakat</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>${u.telegramId}</td>
              <td>${u.firstName || 'N/A'}</td>
              <td>@${u.username || 'N/A'}</td>
              <td>${u.isSubscribed ? '✅' : '❌'}</td>
              <td>${u.totalSearches}</td>
              <td>${new Date(u.createdAt).toLocaleDateString('uz-UZ')}</td>
              <td>
                <form method="POST" action="/admin/users/${u._id}/delete" style="display:inline;">
                  <button class="delete-btn" onclick="return confirm('O\\'chirishni tasdiqlaysizmi?')">O'chirish</button>
                </form>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div class="pagination">
        ${page > 1 ? `<a href="/admin/users?page=${page - 1}">⬅️ Oldingi</a>` : ''}
        <a class="active">${page} / ${totalPages}</a>
        ${page < totalPages ? `<a href="/admin/users?page=${page + 1}">Keyingi ➡️</a>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
  `;
}