import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Telegraf, Markup } from 'telegraf';
import path from 'path';
import dotenv from 'dotenv';
import { initializeApp, cert, getApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' assert { type: 'json' };

dotenv.config();

// Initialize Firebase Admin
// Note: In a real production environment, you'd use a service account key.
// Here we'll try to initialize with the project ID from the config.
if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}
const db = getFirestore();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL;

const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

// --- Bot Logic ---

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
    const isMaster = ctx.startPayload === 'master' || ctx.from.username === 'egor0info1';
    
    // Save user to Firestore
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
        `Привет, Маргарита! 👋\n\nВы вошли как мастер. Здесь вы будете получать уведомления о новых записях и сможете управлять ими.`,
        Markup.keyboard([
          ['📥 Новые заявки', '✅ Одобренные'],
          ['⚙️ Управление салоном']
        ]).resize()
      );
    }

    ctx.reply(
      'Добро пожаловать в Beauty Salon! 🌸\n\nЯ помогу вам записаться к мастеру и следить за вашими визитами.',
      Markup.keyboard([
        ['📅 Записаться', '📋 Мои записи'],
        ['ℹ️ Информация', '⭐️ Отзывы']
      ]).resize()
    );
  });

  // Handle Menu Buttons
  bot.hears('📅 Записаться', (ctx) => {
    ctx.reply('Нажмите кнопку ниже, чтобы выбрать услугу и время:', 
      Markup.inlineKeyboard([
        [Markup.button.webApp('Открыть онлайн-запись', `${APP_URL}/book`)]
      ])
    );
  });

  bot.hears('📋 Мои записи', (ctx) => {
    ctx.reply('Ваши текущие и прошлые записи:', 
      Markup.inlineKeyboard([
        [Markup.button.webApp('Посмотреть записи', `${APP_URL}/my-appointments`)]
      ])
    );
  });

  bot.hears('📥 Новые заявки', (ctx) => {
    ctx.reply('Список новых заявок на услуги:', 
      Markup.inlineKeyboard([
        [Markup.button.webApp('Управление заявками', `${APP_URL}/master/appointments`)]
      ])
    );
  });

  bot.hears('✅ Одобренные', (ctx) => {
    ctx.reply('Ваше расписание подтвержденных записей:', 
      Markup.inlineKeyboard([
        [Markup.button.webApp('Открыть календарь', `${APP_URL}/master/appointments`)]
      ])
    );
  });

  bot.hears('ℹ️ Информация', async (ctx) => {
    const master = await db.collection('masterInfo').doc('main').get();
    const data = master.data();
    ctx.reply(
      `🌸 *О мастере*\n\n` +
      `👤 *Имя:* ${data?.name || 'Маргарита'}\n` +
      `✨ *Опыт:* ${data?.experience || '5 лет'}\n` +
      `📝 *О себе:* ${data?.bio || 'Профессиональный мастер красоты'}\n\n` +
      `📍 Мы ждем вас!`,
      { parse_mode: 'Markdown' }
    );
  });

  // --- API Endpoints for Notifications ---

  app.use(express.json());

  // Notify Master about new appointment or cancellation
  app.post('/api/notify-master', async (req, res) => {
    const { appointment, type } = req.body;
    const targetId = await getMasterChatId();

    if (bot && targetId) {
      try {
        let message = '';
        if (type === 'new') {
          message = `✨ *Новая запись!*\n\n` +
                    `👤 *Клиент:* ${appointment.clientName}\n` +
                    `💇‍♀️ *Услуга:* ${appointment.serviceName}\n` +
                    `📅 *Дата:* ${appointment.date}\n` +
                    `💬 *Комментарий:* ${appointment.notes || 'Нет'}`;
        } else if (type === 'cancel') {
          message = `❌ *Клиент отменил запись*\n\n` +
                    `👤 *Клиент:* ${appointment.clientName}\n` +
                    `💇‍♀️ *Услуга:* ${appointment.serviceName}\n` +
                    `📅 *Дата:* ${appointment.date}`;
        }

        await bot.telegram.sendMessage(targetId, message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.webApp('Открыть управление', `${APP_URL}/master/appointments`)],
          ])
        });
        res.json({ success: true });
      } catch (error) {
        console.error('Notify Master Error:', error);
        res.status(500).json({ error: 'Failed to notify master' });
      }
    } else {
      res.status(400).json({ error: 'Master chat ID not found' });
    }
  });

  // Notify Client about status change (Confirmed/Rejected)
  app.post('/api/notify-client', async (req, res) => {
    const { appointment, status } = req.body;
    const targetId = await getClientChatId(appointment.clientId);

    if (bot && targetId) {
      try {
        let message = '';
        if (status === 'confirmed') {
          message = `✅ *Ваша запись подтверждена!*\n\n` +
                    `💇‍♀️ *Услуга:* ${appointment.serviceName}\n` +
                    `📅 *Дата:* ${appointment.date}\n\n` +
                    `Ждем вас в назначенное время! ✨`;
        } else if (status === 'rejected') {
          message = `😔 *К сожалению, мастер не может принять вас в это время*\n\n` +
                    `💇‍♀️ *Услуга:* ${appointment.serviceName}\n` +
                    `📅 *Дата:* ${appointment.date}\n\n` +
                    `Пожалуйста, выберите другое время или свяжитесь с мастером.`;
        }

        await bot.telegram.sendMessage(targetId, message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.webApp('Мои записи', `${APP_URL}/my-appointments`)],
          ])
        });
        res.json({ success: true });
      } catch (error) {
        console.error('Notify Client Error:', error);
        res.status(500).json({ error: 'Failed to notify client' });
      }
    } else {
      res.status(400).json({ error: 'Client chat ID not found' });
    }
  });

  bot.launch().catch(err => console.error('Bot launch error:', err));
}

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
