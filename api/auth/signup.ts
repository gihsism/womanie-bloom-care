import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as jose from 'jose';
import bcrypt from 'bcryptjs';
import { getAuthSecret } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Check if email exists
    const existing = await sql.query('SELECT id FROM auth_users WHERE email = $1', [email.toLowerCase()]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = 'user_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);

    await sql.query(
      'INSERT INTO auth_users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)',
      [userId, email.toLowerCase(), name || null, passwordHash]
    );

    // Create profile
    await sql.query(
      'INSERT INTO profiles (id, full_name, life_stage) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [userId, name || null, 'menstrual-cycle']
    );

    // Create session
    const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await sql.query(
      'INSERT INTO auth_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
      [sessionId, userId, expiresAt.toISOString()]
    );

    // Create JWT
    const token = await new jose.SignJWT({ sub: userId, sid: sessionId, email: email.toLowerCase(), name })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d')
      .sign(getAuthSecret());

    res.setHeader('Set-Cookie', `womanie_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
    return res.status(200).json({ success: true, user: { id: userId, email, name } });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Failed to create account' });
  }
}
