// PM2 Ecosystem — Ornato ERP (Node + Python CNC Optimizer)
module.exports = {
  apps: [
    {
      name: 'ornato-erp',
      script: 'server/index.js',
      cwd: '/home/ornato/app',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        CNC_OPTIMIZER_URL: 'http://localhost:8000',
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
    },
    {
      name: 'cnc-optimizer',
      // Usa o uvicorn do venv (tem as deps: fastapi, shapely, numpy, etc.)
      // /usr/bin/python3 do sistema NÃO tem uvicorn instalado.
      script: '/home/ornato/app/cnc_optimizer/venv/bin/uvicorn',
      args: 'app.main:app --host 127.0.0.1 --port 8000',
      cwd: '/home/ornato/app/cnc_optimizer',
      interpreter: 'none',
      env: {
        PYTHONUNBUFFERED: '1',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      error_file: '/home/ornato/logs/cnc-err.log',
      out_file: '/home/ornato/logs/cnc-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
