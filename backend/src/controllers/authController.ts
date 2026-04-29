import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { sql } from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'campus_shield_secret_key';

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    const trimmedEmail = email.toString().trim().toLowerCase();

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();

    // REQUIREMENT: Limit admin accounts to maximum 2
    if (role === 'admin') {
      const adminCountRow: any = sql.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get();
      if (adminCountRow.count >= 2) {
        return res.status(403).json({ message: 'Maximum admin threshold reached for CampusShield integrity.' });
      }
    }

    const stmt = sql.prepare('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)');
    stmt.run(id, name || 'User', trimmedEmail, hashedPassword, role || 'student');
    console.log(`User registered: ${trimmedEmail} with role ${role || 'student'}`);

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    const trimmedEmail = email.toString().trim().toLowerCase();
    const user: any = sql.prepare('SELECT * FROM users WHERE email = ?').get(trimmedEmail);
    console.log(`Login attempt for ${trimmedEmail}. Found: ${!!user}`);

    if (!user) {
      return res.status(401).json({ message: 'Account not found. Please register first.' });
    }
    
    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ message: 'Email and password required' });
    const trimmedEmail = email.toString().trim().toLowerCase();
    const user = sql.prepare('SELECT id FROM users WHERE email = ?').get(trimmedEmail);

    if (!user) {
      return res.status(404).json({ message: 'No account found with this email' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    sql.prepare('UPDATE users SET password = ? WHERE email = ?').run(hashedPassword, trimmedEmail);

    res.json({ message: 'Password reset successful! You can now login.' });
  } catch (err) {
    res.status(500).json({ message: 'Error resetting password' });
  }
};
