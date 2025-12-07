const mongoose = require('mongoose');
const axios = require('axios');

// Bot health check
async function checkBotHealth(bot) {
  try {
    const me = await bot.telegram.getMe();
    return {
      status: 'healthy',
      bot: {
        id: me.id,
        username: me.username,
        first_name: me.first_name
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

// MongoDB health check
async function checkDatabaseHealth() {
  try {
    const state = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    return {
      status: state === 1 ? 'healthy' : 'unhealthy',
      state: states[state],
      host: mongoose.connection.host,
      name: mongoose.connection.name
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

// TMDb API health check
async function checkTMDbHealth() {
  try {
    const response = await axios.get('https://api.themoviedb.org/3/configuration', {
      params: {
        api_key: process.env.TMDB_API_KEY
      },
      timeout: 5000
    });
    
    return {
      status: response.status === 200 ? 'healthy' : 'unhealthy',
      api: 'TMDb'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      api: 'TMDb'
    };
  }
}

// To'liq tizim health check
async function getSystemHealth(bot) {
  const [botHealth, dbHealth, tmdbHealth] = await Promise.all([
    checkBotHealth(bot),
    checkDatabaseHealth(),
    checkTMDbHealth()
  ]);
  
  const overallHealthy = 
    botHealth.status === 'healthy' &&
    dbHealth.status === 'healthy' &&
    tmdbHealth.status === 'healthy';
  
  return {
    status: overallHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {
      bot: botHealth,
      database: dbHealth,
      tmdb: tmdbHealth
    }
  };
}

// Express health endpoint
function setupHealthEndpoint(app, bot) {
  app.get('/health', async (req, res) => {
    const health = await getSystemHealth(bot);
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  });
  
  // Simple ping endpoint
  app.get('/ping', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  // Metrics endpoint
  app.get('/metrics', async (req, res) => {
    const { User, DownloadLog } = require('./database');
    
    const metrics = {
      users: {
        total: await User.countDocuments(),
        active: await User.countDocuments({ 
          lastActivity: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
        })
      },
      downloads: {
        total: await DownloadLog.countDocuments(),
        today: await DownloadLog.countDocuments({
          timestamp: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        })
      },
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
    
    res.json(metrics);
  });
}

// Error logging
function setupErrorLogging() {
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    // Bu yerda error tracking service'ga yuborish mumkin (Sentry, etc.)
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  });
}

// Periodic health check
function startHealthMonitoring(bot) {
  setInterval(async () => {
    const health = await getSystemHealth(bot);
    
    if (health.status !== 'healthy') {
      console.warn('⚠️ System health degraded:', JSON.stringify(health, null, 2));
      // Bu yerda admin'ga xabar yuborish mumkin
    } else {
      console.log('✅ System healthy');
    }
  }, 5 * 60 * 1000); // Har 5 daqiqada
}

module.exports = {
  checkBotHealth,
  checkDatabaseHealth,
  checkTMDbHealth,
  getSystemHealth,
  setupHealthEndpoint,
  setupErrorLogging,
  startHealthMonitoring
};