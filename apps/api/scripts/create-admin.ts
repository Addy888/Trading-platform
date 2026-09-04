import * as mysql from 'mysql2/promise';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

async function createAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminFirstName = process.env.ADMIN_FIRST_NAME || 'Admin';
  const adminLastName = process.env.ADMIN_LAST_NAME || 'User';

  if (!adminEmail || !adminPassword) {
    console.log('⚠️  Admin credentials not found in environment variables');
    console.log('Set ADMIN_EMAIL and ADMIN_PASSWORD to create an admin user');
    return;
  }

  // Parse DATABASE_URL
  const dbUrl = process.env.DATABASE_URL || '';
  const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  
  if (!match) {
    console.error('❌ Invalid DATABASE_URL format');
    return;
  }

  const [, user, password, host, port, database] = match;

  const connection = await mysql.createConnection({
    host,
    port: parseInt(port),
    user,
    password: decodeURIComponent(password),
    database,
  });

  try {
    // Check if admin exists
    const [rows] = await connection.execute(
      'SELECT * FROM users WHERE email = ?',
      [adminEmail]
    );

    if (Array.isArray(rows) && rows.length > 0) {
      console.log('✅ Admin user already exists');
      return;
    }

    // Create admin
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    await connection.execute(
      `INSERT INTO users (id, email, passwordHash, firstName, lastName, role, isEmailVerified, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'ADMIN', true, true, NOW(), NOW())`,
      [userId, adminEmail, passwordHash, adminFirstName, adminLastName]
    );

    // Create audit log
    await connection.execute(
      `INSERT INTO audit_logs (id, actorId, action, entityType, entityId, metadata, createdAt)
       VALUES (?, ?, 'ADMIN_CREATED', 'User', ?, ?, NOW())`,
      [uuidv4(), userId, userId, JSON.stringify({ email: adminEmail })]
    );

    console.log('✅ Admin user created successfully');
    console.log('Email:', adminEmail);
  } catch (error) {
    console.error('❌ Error creating admin:', error);
  } finally {
    await connection.end();
  }
}

createAdmin();
