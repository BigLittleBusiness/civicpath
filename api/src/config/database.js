import { DataTypes, Sequelize } from 'sequelize';
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

// MySQL returns JSON columns already parsed, but MariaDB stores JSON as LONGTEXT, so the mysql2 driver hands back strings.
// Parse string values for every JSON attribute (caching the result in dataValues) so models behave identically on both servers.
function isJsonType(type) {
  return type === DataTypes.JSON || type instanceof DataTypes.JSON;
}

function parseJsonString(value) {
  if (typeof value !== 'string' || !/^\s*[[{]/.test(value)) return value;
  try { return JSON.parse(value); } catch { return value; }
}

sequelize.addHook('beforeDefine', (attributes) => {
  for (const [name, definition] of Object.entries(attributes)) {
    const attribute = isJsonType(definition) ? (attributes[name] = { type: definition }) : definition;
    if (!isJsonType(attribute?.type) || attribute.get) continue;
    attribute.get = function getJsonAttribute() {
      const raw = this.getDataValue(name);
      const parsed = parseJsonString(raw);
      if (parsed !== raw) this.dataValues[name] = parsed;
      return parsed;
    };
  }
});

