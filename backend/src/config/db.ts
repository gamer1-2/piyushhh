import Database from 'better-sqlite3';
import { JSONFilePreset } from 'lowdb/node';
import path from 'path';
import bcrypt from 'bcryptjs';

// SQLite for Users (PostgreSQL alternative)
const dbPath = path.resolve('campus_shield.db');
console.log(`Database path: ${dbPath}`);
const sql = new Database(dbPath);

// Initialize SQLite tables
sql.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'student'
  )
`);

// Auto-seed admins
const seedAdmins = () => {
  const admins = [
    { name: 'piyush', email: 'piyush@lpu.in', id: 'admin-piyush' },
    { name: 'pritam', email: 'pritam@lpu.in', id: 'admin-pritam' }
  ];

  const hashedPassword = bcrypt.hashSync('admin123', 10);

  admins.forEach(admin => {
    // Delete any existing user with this email or ID to prevent constraint violations
    sql.prepare('DELETE FROM users WHERE email = ? OR id = ?').run(admin.email, admin.id);
    
    sql.prepare('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)').run(
      admin.id, admin.name, admin.email, hashedPassword, 'admin'
    );
    console.log('Seeded admin user:', admin.email);
  });

  // Remove other admins to strictly adhere to "only two admins"
  const adminEmails = admins.map(a => a.email);
  const placeholders = adminEmails.map(() => '?').join(',');
  sql.prepare(`DELETE FROM users WHERE role = 'admin' AND email NOT IN (${placeholders})`).run(...adminEmails);
};
seedAdmins();

// LowDB for Incidents & Tracking (MongoDB alternative)
// Note: LowDB is great for local JSON storage in Node tasks.
export type Incident = {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  coordinates: { lat: number; lng: number };
  timestamp: string;
  userId: string;
  userName: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'active' | 'closed';
  upvotes: number;
  upvotedBy: string[];
  comments: any[];
  verified: boolean;
};

export type LiveTracking = {
  userId: string;
  coordinates: { lat: number; lng: number };
  timestamp: string;
};

export type Data = {
  reports: Incident[];
  live_tracking: LiveTracking[];
  alerts: any[];
};

const defaultData: Data = { reports: [], live_tracking: [], alerts: [] };
const mongoSim = await JSONFilePreset<Data>('db.json', defaultData);

export { sql, mongoSim };
