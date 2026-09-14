module.exports = {
  apps: [{
    name: 'civicpath-api',
    cwd: '/var/www/civicpath/api',
    script: 'src/index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '400M',
    time: true,
    env_production: { NODE_ENV: 'production', PORT: 3015 },
  }],
};

