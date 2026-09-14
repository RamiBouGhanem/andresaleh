import express from 'express';
import crypto from 'node:crypto';
import {promisify} from 'node:util';
import path from 'node:path';
import {existsSync} from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const {db, readStore, writeStore} = await import('./backend/database.js');

const app = express();
const production = process.env.NODE_ENV === 'production';
const scrypt = promisify(crypto.scrypt);
const adminEmail = process.env.ADMIN_EMAIL || 'coach@demo.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'CoachDemo2026!';

if (production && (
  !process.env.ADMIN_EMAIL ||
  !process.env.ADMIN_PASSWORD ||
  adminPassword === 'CoachDemo2026!' ||
  adminPassword.length < 12
)) {
  throw new Error('Set ADMIN_EMAIL and a unique ADMIN_PASSWORD of at least 12 characters');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS message_reads (
    message_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    read_at TEXT NOT NULL,
    PRIMARY KEY (message_id, recipient_id)
  )
`);

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((q, r, next) => {
  r.set('X-Content-Type-Options', 'nosniff');
  r.set('X-Frame-Options', 'DENY');
  r.set('Referrer-Policy', 'same-origin');

  if (q.path.startsWith('/api')) r.set('Cache-Control', 'no-store');

  if (!['GET', 'HEAD', 'OPTIONS'].includes(q.method) && q.headers.origin) {
    const allowed = process.env.APP_ORIGIN || `${q.protocol}://${q.get('host')}`;
    if (q.headers.origin !== allowed) {
      return r.status(403).json({message: 'Request origin is not allowed'});
    }
  }

  next();
});

app.use(express.json({limit: '7mb'}));

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), {status});
};

const text = (value, max = 2000) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

function email(value) {
  const result = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail('Enter a valid email address');
  return result;
}

function number(value, min, max) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) {
    fail(`Enter a value between ${min} and ${max}`);
  }
  return result;
}

function choice(value, allowed) {
  if (!allowed.includes(value)) fail('Invalid status');
  return value;
}

const publicUser = user => ({
  id: user.id,
  name: user.name,
  email: user.email,
  status: user.status,
  createdAt: user.createdAt,
  lastLogin: user.lastLogin
});

async function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    fail('Use a password of 12–128 characters');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + (await scrypt(password, salt, 64)).toString('hex');
}

async function verify(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, digest] = stored.split(':');
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

const adminHash = await passwordHash(adminPassword);
const dummyHash = await passwordHash(crypto.randomBytes(20).toString('hex'));
const attempts = new Map();

function throttle(q, r, next) {
  const key = q.ip;
  let attempt = attempts.get(key);

  if (!attempt || attempt.until < Date.now()) {
    attempt = {count: 0, until: Date.now() + 900000};
    attempts.set(key, attempt);
  }

  if (++attempt.count > 30) {
    return r.status(429).json({message: 'Too many attempts — try again in 15 minutes'});
  }

  next();
}

setInterval(() => {
  for (const [key, value] of attempts) {
    if (value.until < Date.now()) attempts.delete(key);
  }

  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  db.prepare('DELETE FROM resets WHERE expires < ?').run(Date.now());
}, 60000).unref();

function cookie(q) {
  return (q.headers.cookie || '')
    .split(';')
    .map(value => value.trim())
    .find(value => value.startsWith('coach_session='))
    ?.slice(14) || '';
}

function session(q) {
  const token = cookie(q);
  return token
    ? db.prepare('SELECT * FROM sessions WHERE hash=? AND expires>?')
      .get(hash(token), Date.now())
    : null;
}

function issue(q, r, userId, role) {
  const previous = cookie(q);
  if (previous) db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(previous));

  const token = crypto.randomBytes(32).toString('hex');

  db.prepare('INSERT INTO sessions VALUES(?,?,?,?)')
    .run(hash(token), userId, role, Date.now() + 28800000);

  r.cookie('coach_session', token, {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: '/',
    maxAge: 28800000
  });
}

function auth(role) {
  return (q, r, next) => {
    const current = session(q);

    if (!current) return r.status(401).json({message: 'Please sign in again'});
    if (role && current.role !== role) {
      return r.status(403).json({message: 'Access denied'});
    }

    if (current.role === 'member') {
      q.user = db.prepare('SELECT * FROM users WHERE id=?').get(current.userId);

      if (!q.user || q.user.status !== 'active') {
        return r.status(403).json({message: 'Your account is inactive — contact the coach'});
      }
    }

    q.session = current;
    next();
  };
}

const admin = auth('admin');
const member = auth('member');

function recipientOf(message) {
  return message.from === 'coach' ? message.memberId : 'admin';
}

function messagesWithReads(messages) {
  const receipts = new Map(
    db.prepare('SELECT message_id, recipient_id, read_at FROM message_reads')
      .all()
      .map(row => [
        JSON.stringify([row.message_id, row.recipient_id]),
        row.read_at
      ])
  );

  return messages.map(message => ({
    ...message,
    readAt: receipts.get(JSON.stringify([message.id, recipientOf(message)])) || null
  }));
}

function notificationsFor(role, userId) {
  const messages = messagesWithReads(readStore().messages);
  const users = role === 'admin'
    ? new Map(db.prepare('SELECT id, name FROM users').all().map(user => [user.id, user.name]))
    : null;

  const groups = new Map();

  for (const message of messages) {
    const incoming = role === 'admin'
      ? message.from === 'member' && users.has(message.memberId)
      : message.from === 'coach' && message.memberId === userId;

    if (!incoming || message.readAt) continue;

    const existing = groups.get(message.memberId);

    if (!existing) {
      groups.set(message.memberId, {
        memberId: message.memberId,
        senderName: role === 'admin' ? users.get(message.memberId) : 'Coach Andre',
        count: 1,
        preview: message.body.slice(0, 180),
        createdAt: message.createdAt
      });
    } else {
      existing.count++;

      if (message.createdAt >= existing.createdAt) {
        existing.preview = message.body.slice(0, 180);
        existing.createdAt = message.createdAt;
      }
    }
  }

  const conversations = [...groups.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    count: conversations.reduce((total, item) => total + item.count, 0),
    conversations
  };
}

function markMessagesRead(q, r, role) {
  if (!Array.isArray(q.body.ids) ||
      q.body.ids.length > 200 ||
      q.body.ids.some(value => typeof value !== 'string')) {
    fail('Choose valid messages');
  }

  const requested = new Set(q.body.ids);
  const memberId = role === 'admin' ? text(q.body.memberId, 100) : q.user.id;
  if (!memberId) fail('Choose a member');

  const allowed = readStore().messages.filter(message =>
    requested.has(message.id) &&
    message.memberId === memberId &&
    message.from === (role === 'admin' ? 'member' : 'coach')
  );

  const recipient = role === 'admin' ? 'admin' : q.user.id;
  const timestamp = now();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO message_reads(message_id, recipient_id, read_at)
    VALUES(?,?,?)
  `);

  db.exec('BEGIN IMMEDIATE');

  try {
    allowed.forEach(message => insert.run(message.id, recipient, timestamp));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  r.json({ok: true});
}

app.get('/api/health', (_q, r) => r.json({ok: true, database: 'sqlite'}));

app.get('/api/session', (q, r) => {
  r.json({role: session(q)?.role || null});
});

app.post('/api/logout', (q, r) => {
  db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(cookie(q)));
  r.clearCookie('coach_session', {path: '/'});
  r.status(204).end();
});

app.post('/api/admin/login', throttle, async (q, r) => {
  if (!(await verify(q.body.password, adminHash)) ||
      text(q.body.email).toLowerCase() !== adminEmail.toLowerCase()) {
    fail('Incorrect email or password', 401);
  }

  issue(q, r, 'admin', 'admin');
  r.json({ok: true});
});

app.post('/api/member/register', throttle, async (q, r) => {
  const address = email(q.body.email);
  const name = text(q.body.name, 100);
  if (!name) fail('Enter your name');

  const password = await passwordHash(q.body.password);
  const userId = id();

  try {
    db.prepare('INSERT INTO users(id,email,name,password,createdAt) VALUES(?,?,?,?,?)')
      .run(userId, address, name, password, now());
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) fail('An account already uses that email', 409);
    throw e;
  }

  issue(q, r, userId, 'member');
  r.status(201).json({ok: true});
});

app.post('/api/member/login', throttle, async (q, r) => {
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email(q.body.email));
  const valid = await verify(q.body.password, user?.password || dummyHash);

  if (!valid || !user) fail('Incorrect email or password', 401);
  if (user.status !== 'active') fail('Your account is inactive — contact the coach', 403);

  db.prepare('UPDATE users SET lastLogin=? WHERE id=?').run(now(), user.id);
  issue(q, r, user.id, 'member');
  r.json({ok: true});
});

app.post('/api/member/password', member, async (q, r) => {
  if (!await verify(q.body.current, q.user.password)) fail('Current password is incorrect');

  const password = await passwordHash(q.body.password);
  db.prepare('UPDATE users SET password=? WHERE id=?').run(password, q.user.id);
  db.prepare('DELETE FROM sessions WHERE userId=?').run(q.user.id);
  issue(q, r, q.user.id, 'member');
  r.json({ok: true});
});

app.post('/api/member/reset', throttle, async (q, r) => {
  const digest = hash(text(q.body.token, 100));
  const reset = db.prepare('SELECT * FROM resets WHERE hash=? AND expires>?')
    .get(digest, Date.now());

  if (!reset) fail('This reset link is invalid or expired');
  const password = await passwordHash(q.body.password);

  db.exec('BEGIN IMMEDIATE');

  try {
    const live = db.prepare('SELECT * FROM resets WHERE hash=? AND expires>?')
      .get(digest, Date.now());

    if (!live) fail('Reset link already used');

    db.prepare('UPDATE users SET password=? WHERE id=?').run(password, live.userId);
    db.prepare('DELETE FROM resets WHERE userId=?').run(live.userId);
    db.prepare('DELETE FROM sessions WHERE userId=?').run(live.userId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  r.json({ok: true});
});

function catalogProgram(program) {
  const {content, ...publicFields} = program;
  return publicFields;
}

app.get('/api/programs', (_q, r) => {
  r.json(readStore().programs.filter(program => program.status === 'published').map(catalogProgram));
});

app.post('/api/track', (_q, r) => {
  const store = readStore();
  store.views++;
  writeStore(store);
  r.status(204).end();
});

app.post('/api/leads', throttle, (q, r) => {
  const store = readStore();
  const name = text(q.body.name, 100);
  const address = email(q.body.email);
  if (!name) fail('Name is required');

  store.leads.unshift({
    id: id(),
    name,
    email: address,
    goal: text(q.body.goal),
    source: 'Website',
    status: 'new',
    createdAt: now()
  });

  writeStore(store);
  r.status(201).json({ok: true});
});

app.post('/api/orders', member, (q, r) => {
  const store = readStore();
  const program = store.programs.find(item =>
    (item.id === q.body.programId || item.title === q.body.program) &&
    item.status === 'published'
  );

  if (!program) fail('Program not available', 404);

  const existing = store.orders.find(order =>
    order.memberId === q.user.id &&
    order.programId === program.id &&
    order.status === 'pending'
  );

  if (existing) {
    return r.json({
      reference: existing.id,
      message: 'Your existing request is awaiting the coach’s review'
    });
  }

  const order = {
    id: id(),
    memberId: q.user.id,
    name: q.user.name,
    email: q.user.email,
    phone: text(q.body.phone, 60),
    programId: program.id,
    program: program.title,
    amount: program.price,
    status: 'pending',
    createdAt: now()
  };

  store.orders.unshift(order);
  writeStore(store);

  r.status(201).json({
    reference: order.id,
    message: 'Your request is saved — your coach will arrange payment and program access'
  });
});

app.get('/api/member/dashboard', member, (q, r) => {
  const store = readStore();
  const userId = q.user.id;

  r.json({
    user: publicUser(q.user),
    assignments: store.assignments
      .filter(assignment => assignment.memberId === userId)
      .map(assignment => ({
        ...assignment,
        program: store.programs.find(program => program.id === assignment.programId) ||
          {title: 'Archived program'}
      })),
    checkins: store.checkins.filter(item => item.memberId === userId),
    messages: messagesWithReads(store.messages.filter(item => item.memberId === userId)),
    bookings: store.bookings.filter(item => item.memberId === userId),
    orders: store.orders.filter(item => item.memberId === userId)
  });
});

app.get('/api/member/notifications', member, (q, r) => {
  r.json(notificationsFor('member', q.user.id));
});

app.get('/api/admin/notifications', admin, (_q, r) => {
  r.json(notificationsFor('admin', 'admin'));
});

app.post('/api/member/messages/read', member, (q, r) => {
  markMessagesRead(q, r, 'member');
});

app.post('/api/admin/messages/read', admin, (q, r) => {
  markMessagesRead(q, r, 'admin');
});

app.post('/api/member/checkins', member, (q, r) => {
  const store = readStore();

  const checkin = {
    id: id(),
    memberId: q.user.id,
    createdAt: now(),
    weight: q.body.weight === '' || q.body.weight == null
      ? null
      : number(q.body.weight, 20, 400),
    completed: number(q.body.completed, 0, 30),
    planned: number(q.body.planned, 1, 30),
    notes: text(q.body.notes),
    reply: ''
  };

  if (checkin.completed > checkin.planned) {
    fail('Completed sessions cannot exceed planned sessions');
  }

  store.checkins.unshift(checkin);
  writeStore(store);
  r.status(201).json(checkin);
});

app.post('/api/member/messages', member, (q, r) => {
  const body = text(q.body.body);
  if (!body) fail('Enter a message');

  const store = readStore();
  store.messages.push({
    id: id(),
    memberId: q.user.id,
    from: 'member',
    body,
    createdAt: now()
  });

  writeStore(store);
  r.status(201).json({ok: true});
});

app.get('/api/services', (_q, r) => {
  r.json(readStore().services.filter(service => service.active));
});

app.post('/api/bookings', member, (q, r) => {
  const store = readStore();
  const service = store.services.find(item => item.id === q.body.serviceId && item.active);
  const time = Date.parse(q.body.requestedAt);

  if (!service || !Number.isFinite(time) ||
      time < Date.now() || time > Date.now() + 180 * 86400000) {
    fail('Choose a service and a future date within six months');
  }

  const booking = {
    id: id(),
    memberId: q.user.id,
    name: q.user.name,
    serviceId: service.id,
    title: service.title,
    duration: service.duration,
    price: service.price,
    requestedAt: new Date(time).toISOString(),
    status: 'requested',
    notes: text(q.body.notes, 500),
    createdAt: now()
  };

  store.bookings.unshift(booking);
  writeStore(store);
  r.status(201).json(booking);
});

app.patch('/api/member/bookings/:id', member, (q, r) => {
  const store = readStore();
  const booking = store.bookings.find(item =>
    item.id === q.params.id && item.memberId === q.user.id
  );

  if (!booking) fail('Not found', 404);
  if (!['requested', 'confirmed'].includes(booking.status)) {
    fail('This appointment cannot be cancelled');
  }

  booking.status = 'cancelled';
  writeStore(store);
  r.json(booking);
});

app.get('/api/transformations', (_q, r) => {
  r.json(readStore().transformations
    .filter(item => item.published && item.consent)
    .map(({consent, ...item}) => item));
});

app.get('/api/admin/dashboard', admin, (_q, r) => {
  const store = readStore();
  const users = db.prepare('SELECT * FROM users ORDER BY createdAt DESC').all();

  const clients = users.map(user => {
    const checkin = store.checkins.find(item => item.memberId === user.id);

    return {
      ...publicUser(user),
      program: store.assignments
        .filter(item => item.memberId === user.id)
        .map(item => store.programs.find(program => program.id === item.programId)?.title)
        .filter(Boolean)
        .join(', ') || 'Not assigned',
      progress: 0,
      compliance: checkin ? Math.round(checkin.completed / checkin.planned * 100) : 0,
      nextCheckIn: checkin ? checkin.createdAt.slice(0, 10) : 'No check-in yet'
    };
  });

  const programs = store.programs.map(program => ({
    ...program,
    sales: store.orders.filter(order =>
      order.programId === program.id && order.status === 'paid'
    ).length
  }));

  r.json({
    ...store,
    messages: messagesWithReads(store.messages),
    programs,
    clients,
    stats: {
      revenue: store.orders.filter(order => order.status === 'paid')
        .reduce((total, order) => total + order.amount, 0),
      orders: store.orders.length,
      clients: clients.filter(client => client.status === 'active').length,
      leads: store.leads.filter(lead => lead.status === 'new').length,
      views: store.views
    }
  });
});

function programInput(input) {
  const title = text(input.title, 120);
  if (!title) fail('Title is required');

  return {
    title,
    tag: text(input.tag, 40),
    subtitle: text(input.subtitle, 150),
    duration: text(input.duration, 50),
    level: text(input.level, 50),
    price: number(input.price, 0, 100000),
    status: choice(input.status, ['draft', 'published']),
    description: text(input.description, 5000),
    features: Array.isArray(input.features)
      ? input.features.slice(0, 30).map(feature => text(feature, 250))
      : [],
    content: text(input.content, 30000)
  };
}

app.post('/api/admin/programs', admin, (q, r) => {
  const store = readStore();
  const program = {id: id(), ...programInput(q.body)};
  store.programs.unshift(program);
  writeStore(store);
  r.status(201).json(program);
});

app.put('/api/admin/programs/:id', admin, (q, r) => {
  const store = readStore();
  const program = store.programs.find(item => item.id === q.params.id);
  if (!program) fail('Not found', 404);

  Object.assign(program, programInput(q.body));
  writeStore(store);
  r.json(program);
});

app.delete('/api/admin/programs/:id', admin, (q, r) => {
  const store = readStore();

  if (store.assignments.some(item => item.programId === q.params.id)) {
    fail('This program is assigned to a member — set it to draft to remove it from sale');
  }

  store.programs = store.programs.filter(item => item.id !== q.params.id);
  writeStore(store);
  r.status(204).end();
});

for (const type of ['orders', 'leads']) {
  app.patch(`/api/admin/${type}/:id`, admin, (q, r) => {
    const store = readStore();
    const item = store[type].find(value => value.id === q.params.id);
    if (!item) fail('Not found', 404);

    item.status = choice(q.body.status, type === 'orders'
      ? ['pending', 'paid', 'cancelled', 'refunded']
      : ['new', 'contacted', 'qualified', 'converted', 'closed']);

    writeStore(store);
    r.json(item);
  });
}

app.patch('/api/admin/members/:id', admin, (q, r) => {
  const status = choice(q.body.status, ['active', 'inactive']);
  db.prepare('UPDATE users SET status=? WHERE id=?').run(status, q.params.id);

  if (status === 'inactive') {
    db.prepare('DELETE FROM sessions WHERE userId=?').run(q.params.id);
  }

  r.json({ok: true});
});

app.post('/api/admin/members/:id/reset', admin, (q, r) => {
  if (!db.prepare('SELECT id FROM users WHERE id=?').get(q.params.id)) {
    fail('Not found', 404);
  }

  const token = crypto.randomBytes(32).toString('hex');

  db.exec('BEGIN IMMEDIATE');

  try {
    db.prepare('DELETE FROM resets WHERE userId=?').run(q.params.id);
    db.prepare('INSERT INTO resets VALUES(?,?,?)')
      .run(hash(token), q.params.id, Date.now() + 1800000);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  r.json({path: `/member?reset=${token}`});
});

app.post('/api/admin/assignments', admin, (q, r) => {
  const store = readStore();

  if (!db.prepare('SELECT id FROM users WHERE id=?').get(q.body.memberId) ||
      !store.programs.some(program => program.id === q.body.programId)) {
    fail('Choose a member and a program');
  }

  if (!store.assignments.some(item =>
    item.memberId === q.body.memberId && item.programId === q.body.programId
  )) {
    store.assignments.push({
      id: id(),
      memberId: q.body.memberId,
      programId: q.body.programId,
      createdAt: now()
    });
  }

  writeStore(store);
  r.json({ok: true});
});

app.delete('/api/admin/assignments/:id', admin, (q, r) => {
  const store = readStore();
  store.assignments = store.assignments.filter(item => item.id !== q.params.id);
  writeStore(store);
  r.status(204).end();
});

app.post('/api/admin/messages', admin, (q, r) => {
  const store = readStore();
  const body = text(q.body.body);

  if (!body || !db.prepare('SELECT id FROM users WHERE id=?').get(q.body.memberId)) {
    fail('Select a member and enter a message');
  }

  store.messages.push({
    id: id(),
    memberId: q.body.memberId,
    from: 'coach',
    body,
    createdAt: now()
  });

  writeStore(store);
  r.status(201).json({ok: true});
});

app.patch('/api/admin/checkins/:id', admin, (q, r) => {
  const store = readStore();
  const checkin = store.checkins.find(item => item.id === q.params.id);
  if (!checkin) fail('Not found', 404);

  checkin.reply = text(q.body.reply);
  writeStore(store);
  r.json(checkin);
});

app.patch('/api/admin/bookings/:id', admin, (q, r) => {
  const store = readStore();
  const booking = store.bookings.find(item => item.id === q.params.id);
  if (!booking) fail('Not found', 404);

  const status = choice(q.body.status, ['requested', 'confirmed', 'completed', 'cancelled']);

  if (status === 'confirmed') {
    const start = Date.parse(booking.requestedAt);
    const end = start + booking.duration * 60000;

    if (start < Date.now()) fail('Cannot confirm an appointment in the past');

    if (store.bookings.some(other =>
      other.id !== booking.id &&
      other.status === 'confirmed' &&
      Date.parse(other.requestedAt) < end &&
      Date.parse(other.requestedAt) + other.duration * 60000 > start
    )) {
      fail('Another confirmed appointment overlaps this time', 409);
    }
  }

  booking.status = status;
  writeStore(store);
  r.json(booking);
});

app.post('/api/admin/services', admin, (q, r) => {
  const store = readStore();
  const input = q.body;
  const title = text(input.title, 120);
  if (!title) fail('Title is required');

  const service = {
    id: input.id || id(),
    title,
    duration: number(input.duration, 15, 180),
    price: number(input.price, 0, 10000),
    description: text(input.description),
    active: input.active === true
  };

  const index = store.services.findIndex(item => item.id === service.id);
  if (index < 0) store.services.push(service);
  else store.services[index] = service;

  writeStore(store);
  r.json(service);
});

function image(value) {
  if (!value) return '';

  if (typeof value !== 'string' ||
      value.length > 2800000 ||
      !/^data:image\/(png|jpeg|webp);base64,/.test(value)) {
    fail('Use a JPEG, PNG or WebP image under 2 MB');
  }

  const bytes = Buffer.from(value.split(',')[1], 'base64');

  if (!(bytes[0] === 255 && bytes[1] === 216) &&
      !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      !(bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WEBP')) {
    fail('Invalid image');
  }

  return value;
}

app.post('/api/admin/transformations', admin, (q, r) => {
  const store = readStore();
  const input = q.body;

  const transformation = {
    id: input.id || id(),
    name: text(input.name, 100),
    title: text(input.title, 150),
    story: text(input.story, 2500),
    duration: text(input.duration, 100),
    before: image(input.before),
    after: image(input.after),
    consent: input.consent === true,
    published: input.published === true
  };

  if (!transformation.name || !transformation.title) fail('Name and title are required');

  if (transformation.published &&
      (!transformation.consent || !transformation.before || !transformation.after)) {
    fail('Before and after photos and recorded permission are required to publish');
  }

  const index = store.transformations.findIndex(item => item.id === transformation.id);
  if (index < 0) store.transformations.push(transformation);
  else store.transformations[index] = transformation;

  writeStore(store);
  r.json({ok: true});
});

app.delete('/api/admin/transformations/:id', admin, (q, r) => {
  const store = readStore();
  store.transformations = store.transformations.filter(item => item.id !== q.params.id);
  writeStore(store);
  r.status(204).end();
});

app.use('/api', (_q, r) => r.status(404).json({message: 'API route not found'}));

app.use(express.static(path.resolve('dist')));
app.get('/{*path}', (_q, r) => r.sendFile(path.resolve('dist/index.html')));

app.use((error, _q, r, _next) => {
  if (!error.status) console.error(error);

  r.status(error.status || 500).json({
    message: error.status ? error.message : 'Server error — please try again'
  });
});

const server = app.listen(process.env.PORT || 10000, () => {
  console.log(`Coach platform ready on port ${process.env.PORT || 10000}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}