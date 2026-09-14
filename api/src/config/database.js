import { Sequelize } from 'sequelize';
import { env } from './env.js';

export const sequelize = new Sequelize(env.db.database, env.db.username, env.db.password, {
  host: env.db.host,
  port: env.db.port,
  dialect: 'mysql',
  logging: env.nodeEnv === 'development' ? false : false,
  dialectOptions: env.db.ssl ? { ssl: { require: true, rejectUnauthorized: true } } : undefined,
  define: { underscored: true, freezeTableName: true },
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
});

