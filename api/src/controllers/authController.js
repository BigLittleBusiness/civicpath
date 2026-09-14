import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import { User } from '../models/index.js';
import { env } from '../config/env.js';

const loginSchema = Joi.object({ email: Joi.string().email().required(), password: Joi.string().min(8).required() });

function sessionUser(user) {
  return { id: user.id, organizationId: user.organizationId, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role };
}

export async function login(req, res, next) {
  try {
    const { value, error } = loginSchema.validate(req.body);
    if (error) return res.status(422).json({ error: error.message });
    const user = await User.findOne({ where: { email: value.email.toLowerCase(), status: 'active' } });
    if (!user || !(await bcrypt.compare(value.password, user.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    const token = jwt.sign({ sub: user.id, organizationId: user.organizationId, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
    await user.update({ lastLoginAt: new Date() });
    res.cookie('civicpath_session', token, { httpOnly: true, secure: env.isProduction, sameSite: env.isProduction ? 'none' : 'lax', domain: env.cookieDomain, maxAge: 8 * 60 * 60 * 1000 });
    return res.json({ data: { user: sessionUser(user) } });
  } catch (error) { return next(error); }
}

export function logout(_req, res) {
  res.clearCookie('civicpath_session', { httpOnly: true, secure: env.isProduction, sameSite: env.isProduction ? 'none' : 'lax', domain: env.cookieDomain });
  return res.status(204).send();
}

export async function me(req, res, next) {
  try {
    const user = await User.findByPk(req.auth.sub);
    if (!user || user.status !== 'active') return res.status(401).json({ error: 'Your account is unavailable.' });
    return res.json({ data: { user: sessionUser(user) } });
  } catch (error) { return next(error); }
}

