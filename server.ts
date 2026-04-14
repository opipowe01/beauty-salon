import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Telegraf, Markup } from 'telegraf';
import path from 'path';
import dotenv from 'dotenv';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' assert { type: 'json' };

dotenv.config();

// Initialize Firebase Admin
if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}
const db = getFirestore();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL?.replace(/\/$/, ''); // Убираем слеш в конце если есть

const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

// --- Логика Бота ---

if (bot) {
  const getMasterChatId = async () => {
    const doc = await db.collection('masterInfo').doc('main').get();
    return doc.data()?.chatId || process.env.MASTER_CHAT_ID;
  };

  const getClientChatId = async (clientId: string) => {
    const doc = await db.collection('users').doc(clientId).get();
    return doc.data()?.chatId;
  };

  bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    // Проверка на мастера (по юзернейму или спец-коду)
    const isMaster = ctx.startPayload === 'master' || ctx.from.username === 'egor0info1';
    
    // Сохраняем пользователя в базу
    await db.collection('users').doc(`tg_${userId}`).set({
      chatId: ctx.chat.id.toString(),
      username: ctx.from.username || '',
      firstName: ctx.from.first_name || '',
      isMaster: isMaster,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    if (isMaster) {
      await db.collection('masterInfo').doc('main').set({ chatId: ctx.chat.id.toString() }, { merge: true });
      
      return ctx.reply(
        `🌟 Привет, Мастер!\n\nВы вошли в панель управления. Здесь вы будете получать уведомления о новых записях.`,
        Markup.keyboard([
          ['📥 Новые заявки', '✅ Одобренные'],
          ['⚙️ Управление салоном']
        ]).resize()
      );
    }

    ctx.reply(
      '🌸 Добро пожаловать в Beauty Salon!\n\nЯ помогу вам записаться к лучшему мастеру и буду напоминать о ваших визитах.',
      Markup.keyboard([
        ['📅 Записаться', '📋 Мои записи'],
        ['ℹ️ Информация', '⭐️ Отзывы']
      ]).resize()
    );
  });

  // Обработка кнопок меню
  bot.hears('📅 Записаться', (ctx) => {
    ctx.reply('Нажмите кнопку ниже, чтобы выбрать услугу:', 
      Markup.inlineKeyboard([
        [Markup.button.webApp('Открыть онлайн-запись', `${APP_URL}/book`)]
      ])
    );
  });

  bot.hears('📋 Мои записи', (ctx) => {
    ctx.reply('Ваши записи на услуги:', 
      Markup.inlineKeyboard([
        [Markup.button.webApp('Посмотреть мои записи', `${APP_URL}/my-appointments`)]
      ])
    );
  });

  bot.hears('📥 Новые заявки', (ctx) => {
    ctx.reply('Список новых заявок:', 
      Markup.inlineKeyboard([
        [Markup.button.webApp('Управление заявками', `${APP_URL}/master/appointments`)]
      ])
    );
  });

  bot.hears('ℹ️ Информация', async (ctx) => {
    const master = await db.collection('masterInfo').doc('main').get();
    const data = master.data();
    ctx.reply(
      `✨ *О мастере*\n\n` +
      `👤 *Имя:* ${data?.name || 'Маргарита'}\n` +
      `✨ *Опыт:* ${data?.experience || '5 лет'}\n` +
      `📝 *О себе:* ${data?.bio || 'Профессиональный мастер красоты'}\n\n` +
      `📍 Мы ждем вас!`,
      { parse_mode: 'Markdown' }
    );
  });

  // --- API для уведомлений ---
  app.use(express.json());

  app.post('/api/notify-master', async (req, res) => {
    const { appointment, type } = req.body;
    const targetId = await getMasterChatId();
    if (bot && targetId) {
      try {
        let message = type === 'new' 
          ? `✨ *Новая запись!*\n\n👤 ${appointment.clientName}\n💇‍♀️ ${appointment.serviceName}\n📅 ${appointment.date}`
          : `❌ *Запись отменена*\n\n👤 ${appointment.clientName}\n📅 ${appointment.date}`;
        
        await bot.telegram.sendMessage(targetId, message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.webApp('Управление', `${APP_URL}/master/appointments`)]])
        });
        res.json({ success: true });
      } catch (e) { res.status(500).send(e); }
    } else res.status(400).send('No bot or master ID');
  });

  app.post('/api/notify-client', async (req, res) => {
    const { appointment, status } = req.body;
    const targetId = await getClientChatId(appointment.clientId);
    if (bot && targetId) {
      try {
        let message = status === 'confirmed'
          ? `✅ *Ваша запись подтверждена!*\n\n💇‍♀️ ${appointment.serviceName}\n📅 ${appointment.date}\n\nЖдем вас! ✨`
          : `😔 *Мастер отклонил запись*\n\n📅 ${appointment.date}\n\nПопробуйте выбрать другое время.`;
        
        await bot.telegram.sendMessage(targetId, message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.webApp('Мои записи', `${APP_URL}/my-appointments`)]])
        });
        res.json({ success: true });
      } catch (e) { res.status(500).send(e); }
    } else res.status(400).send('No client ID');
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