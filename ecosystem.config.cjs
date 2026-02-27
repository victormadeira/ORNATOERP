// PM2 Ecosystem — Ornato ERP
module.exports = {
  apps: [{
    name: 'ornato-erp',
    script: 'server/index.js',
    cwd: '/home/ornato/app',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      // Ubuntu 22.04: pode ser chromium-browser ou chromium
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser',
      PUPPETEER_SKIP_DOWNLOAD: 'true',
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    error_file: '/home/ornato/logs/err.log',
    out_file: '/home/ornato/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
