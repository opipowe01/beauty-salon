import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Telegraf, Markup } from 'telegraf';
import path from 'path';
import dotenv from 'dotenv';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' assert { type: 'json' };

dotenv.config();

if (!getApps().length) {
  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountVar) {
    try {
      const serviceAccount = JSON.parse(serviceAccountVar);
      initializeApp({ credential: cert(serviceAccount), projectId: firebaseConfig.projectId });
    } catch (e) { initializeApp({ projectId: firebaseConfig.projectId }); }
  } else { initializeApp({ projectId: firebaseConfig.projectId }); }
}
const db = getFirestore();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL?.replace(/\/$/, '');

const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

if (bot) {
  bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const username = ctx.from.username || '';
    const isMaster = username === 'opipowe' || username === 'opipowe';

    await db.collection('users').doc(`tg_${userId}`).set({
      chatId: ctx.chat.id.toString(),
      username: username,
      isMaster: isMaster,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    if (isMaster) {
      await db.collection('masterInfo').doc('main').set({ chatId: ctx.chat.id.toString() }, { merge: true });
      return ctx.reply(
        `👑 *Панель управления Мастера*\n\nПривет! Вы авторизованы как владелец салона.`,
        {
          parse_mode: 'Markdown',
          ...Markup.keyboard([
            ['📥 Новые заявки', '✅ Одобренные'],
            ['⚙️ Управление салоном']
          ]).resize()
        }
      );
    }

    ctx.reply('🌸 *Добро пожаловать в Beauty Salon!*', {
      parse_mode: 'Markdown',
      ...Markup.keyboard([['📅 Записаться', '📋 Мои записи'], ['ℹ️ Информация', '⭐️ Отзывы']]).resize()
    });
  });

  bot.hears('⚙️ Управление салоном', (ctx) => {
    ctx.reply('Настройки вашего салона:', 
      Markup.inlineKeyboard([[Markup.button.webApp('Открыть меню мастера', `${APP_URL}/profile`)]])
    );
  });

  bot.hears('📅 Записаться', (ctx) => ctx.reply('Выберите услугу:', Markup.inlineKeyboard([[Markup.button.webApp('Записаться', `${APP_URL}/book`)]])));
  bot.hears('📋 Мои записи', (ctx) => ctx.reply('Ваши записи:', Markup.inlineKeyboard([[Markup.button.webApp('Открыть', `${APP_URL}/my-appointments`)]])));
  bot.hears('📥 Новые заявки', (ctx) => ctx.reply('Новые заявки:', Markup.inlineKeyboard([[Markup.button.webApp('Управление', `${APP_URL}/master/appointments`)]])));
  bot.hears('✅ Одобренные', (ctx) => ctx.reply('Ваше расписание:', Markup.inlineKeyboard([[Markup.button.webApp('Календарь', `${APP_URL}/master/appointments`)]])));

  bot.telegram.deleteWebhook().then(() => bot.launch());
}

app.use(express.json());

app.post('/api/notify-master', async (req, res) => {
  const { appointment, type } = req.body;
  const masterDoc = await db.collection('masterInfo').doc('main').get();
  const targetId = masterDoc.data()?.chatId || process.env.MASTER_CHAT_ID;
  if (bot && targetId) {
    const msg = type === 'new' ? `✨ *Новая запись!*\n👤 ${appointment.clientName}\n💇‍♀️ ${appointment.serviceName}\n📅 ${appointment.date}` : `❌ *Запись отменена*\n👤 ${appointment.clientName}\n📅 ${appointment.date}`;
    bot.telegram.sendMessage(targetId, msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.webApp('Управление', `${APP_URL}/master/appointments`)]]) });
  }
  res.json({ success: true });
});

app.post('/api/notify-client', async (req, res) => {
  const { appointment, status } = req.body;
  const user = await db.collection('users').doc(appointment.clientId).get();
  const targetId = user.data()?.chatId;
  if (bot && targetId) {
    const msg = status === 'confirmed' ? `✅ *Запись подтверждена!*\n💇‍♀️ ${appointment.serviceName}\n📅 ${appointment.date}` : `😔 *Мастер отклонил запись*\n📅 ${appointment.date}`;
    bot.telegram.sendMessage(targetId, msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.webApp('Мои записи', `${APP_URL}/my-appointments`)]]) });
  }
  res.json({ success: true });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0');
}
startServer();