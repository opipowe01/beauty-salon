import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Telegraf, Markup } from 'telegraf';
import path from 'path';
import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc, query, where, getDocs, updateDoc, orderBy } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json' assert { type: 'json' };

dotenv.config();

// Инициализация Firebase (Клиентский SDK работает и на сервере)
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL;

const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

// --- Логика Бота ---

if (bot) {
  const getMasterChatId = async () => {
    try {
      const masterDoc = await getDoc(doc(db, 'masterInfo', 'main'));
      return masterDoc.data()?.chatId || process.env.MASTER_CHAT_ID;
    } catch (e) {
      console.error('Error getting master chatId:', e);
      return process.env.MASTER_CHAT_ID;
    }
  };

  const getClientChatId = async (clientId: string) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', clientId));
      return userDoc.data()?.chatId;
    } catch (e) {
      console.error('Error getting client chatId:', e);
      return null;
    }
  };

  bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const isMaster = ctx.startPayload === 'master' || ctx.from.username === 'egor0info1';
    const clientId = `tg_${userId}`;
    
    try {
      await setDoc(doc(db, 'users', clientId), {
        chatId: ctx.chat.id.toString(),
        username: ctx.from.username || '',
        firstName: ctx.from.first_name || '',
        isMaster: isMaster,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      if (isMaster) {
        await setDoc(doc(db, 'masterInfo', 'main'), { chatId: ctx.chat.id.toString() }, { merge: true });
        return ctx.reply(
          `Привет, Маргарита! 👋\n\nВы вошли как мастер.`,
          Markup.keyboard([
            ['📥 Новые заявки', '✅ Одобренные'],
            ['⚙️ Управление салоном']
          ]).resize()
        );
      }

      ctx.reply(
        'Добро пожаловать в Beauty Salon! 🌸',
        Markup.keyboard([
          ['📅 Записаться', '📋 Мои записи'],
          ['ℹ️ Информация', '⭐️ Отзывы']
        ]).resize()
      );
    } catch (error) {
      console.error('Bot Start Error:', error);
    }
  });

  bot.hears('📅 Записаться', (ctx) => {
    ctx.reply('Нажмите кнопку ниже:', Markup.inlineKeyboard([[Markup.button.webApp('Открыть запись', `${APP_URL}/book`)]]));
  });

  bot.hears('📋 Мои записи', (ctx) => {
    ctx.reply('Ваши записи:', Markup.inlineKeyboard([[Markup.button.webApp('Посмотреть', `${APP_URL}/my-appointments`)]]));
  });

  bot.hears('ℹ️ Информация', async (ctx) => {
    try {
      const masterDoc = await getDoc(doc(db, 'masterInfo', 'main'));
      const data = masterDoc.data();
      ctx.reply(
        `🌸 *О мастере*\n\n` +
        `👤 *Имя:* ${data?.name || 'Маргарита'}\n` +
        `✨ *Опыт:* ${data?.experience || '5 лет'}\n` +
        `📝 *О себе:* ${data?.bio || 'Мастер красоты'}\n`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) { ctx.reply('Ошибка загрузки данных.'); }
  });

  app.use(express.json());

  app.post('/api/notify-master', async (req, res) => {
    const { appointment, type } = req.body;
    const targetId = await getMasterChatId();
    if (bot && targetId) {
      try {
        let message = type === 'new' ? `✨ *Новая запись!*\n\n👤 ${appointment.clientName}\n💇‍♀️ ${appointment.serviceName}\n📅 ${appointment.date}` : `❌ *Отмена записи*`;
        await bot.telegram.sendMessage(targetId, message, { parse_mode: 'Markdown' });
        res.json({ success: true });
      } catch (error) { res.status(500).json({ error: 'Failed' }); }
    }
  });

  app.post('/api/notify-client', async (req, res) => {
    const { appointment, status } = req.body;
    const targetId = await getClientChatId(appointment.clientId);
    if (bot && targetId) {
      try {
        let message = status === 'confirmed' ? `✅ *Запись подтверждена!*\n\n📅 ${appointment.date}` : `😔 *Отказ в записи*`;
        await bot.telegram.sendMessage(targetId, message, { parse_mode: 'Markdown' });
        res.json({ success: true });
      } catch (error) { res.status(500).json({ error: 'Failed' }); }
    }
  });

  bot.launch().catch(err => console.error('Bot launch error:', err));
}

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
}
startServer();