import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as jose from 'jose';
import bcrypt from 'bcryptjs';
import { getAuthSecret } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const sql = neon(process.env.DATABASE_URL!);

    const users = await sql.query('SELECT * FROM auth_users WHERE email = $1', [email.toLowerCase()]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];

    if (!user.password_hash) {
      return res.status(401).json({ error: 'This account uses Google sign-in. Click "Continue with Google" instead.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Create session
    const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await sql.query(
      'INSERT INTO auth_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
      [sessionId, user.id, expiresAt.toISOString()]
    );

    // Create JWT
    const token = await new jose.SignJWT({ sub: user.id, sid: sessionId, email: user.email, name: user.name })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d')
      .sign(getAuthSecret());

    res.setHeader('Set-Cookie', `womanie_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
    return res.status(200).json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
}
