// PM2 Ecosystem — Ornato ERP
module.exports = {
  apps: [{
    name: 'ornato-erp',
    script: 'server/index.js',
    cwd: '/home/ornato/app',
    node_args: '--experimental-vm-modules',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser',
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
