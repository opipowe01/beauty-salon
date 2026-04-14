import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Telegraf, Markup } from 'telegraf';
import path from 'path';
import dotenv from 'dotenv';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' assert { type: 'json' };

dotenv.config();

// Инициализация Firebase
if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}
const db = getFirestore();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL?.replace(/\/$/, '');

const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

// --- Логика Бота ---

if (bot) {
  console.log('Инициализация бота...');

  // Функция для получения ID мастера
  const getMasterChatId = async () => {
    const doc = await db.collection('masterInfo').doc('main').get();
    return doc.data()?.chatId || process.env.MASTER_CHAT_ID;
  };

  // Приветствие и Меню
  bot.start(async (ctx) => {
    console.log(`Получена команда /start от ${ctx.from.username}`);
    const userId = ctx.from.id.toString();
    const isMaster = ctx.from.username === 'opipowe'; // Твой юзернейм

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
        `👑 *Панель управления Мастера*\n\nПривет, Маргарита! Вы успешно авторизованы.`,
        {
          parse_mode: 'Markdown',
          ...Markup.keyboard([
            ['📥 Новые заявки', '✅ Одобренные'],
            ['⚙️ Управление салоном']
          ]).resize()
        }
      );
    }

    ctx.reply(
      '🌸 *Добро пожаловать в Beauty Salon!*\n\nЯ помогу вам записаться к мастеру и буду присылать уведомления о статусе вашей записи.',
      {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
          ['📅 Записаться', '📋 Мои записи'],
          ['ℹ️ Информация', '⭐️ Отзывы']
        ]).resize()
      }
    );
  });

  // Обработка кнопок
  bot.hears('📅 Записаться', (ctx) => {
    ctx.reply('Нажмите кнопку ниже, чтобы выбрать время:', 
      Markup.inlineKeyboard([[Markup.button.webApp('Выбрать услугу', `${APP_URL}/book`)]])
    );
  });

  bot.hears('📋 Мои записи', (ctx) => {
    ctx.reply('Ваши текущие записи:', 
      Markup.inlineKeyboard([[Markup.button.webApp('Открыть список', `${APP_URL}/my-appointments`)]])
    );
  });

  bot.hears('📥 Новые заявки', (ctx) => {
    ctx.reply('Новые клиенты ждут ответа:', 
      Markup.inlineKeyboard([[Markup.button.webApp('Управление', `${APP_URL}/master/appointments`)]])
    );
  });

  bot.hears('ℹ️ Информация', async (ctx) => {
    const master = await db.collection('masterInfo').doc('main').get();
    const data = master.data();
    ctx.reply(
      `✨ *О мастере*\n\n👤 *Имя:* ${data?.name || 'Маргарита'}\n✨ *Опыт:* ${data?.experience || '5 лет'}\n📝 *О себе:* ${data?.bio || 'Профессиональный мастер красоты'}`,
      { parse_mode: 'Markdown' }
    );
  });

  // Запуск бота с предварительной очисткой Webhook
  bot.telegram.deleteWebhook()
    .then(() => {
      console.log('Старые настройки Telegram удалены. Запускаю бота...');
      return bot.launch();
    })
    .then(() => console.log('Бот успешно запущен и слушает команды!'))
    .catch(err => console.error('Ошибка при запуске бота:', err));

  // Остановка бота при выключении сервера
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

// --- API для уведомлений ---
app.use(express.json());

app.post('/api/notify-master', async (req, res) => {
  const { appointment, type } = req.body;
  const targetId = await db.collection('masterInfo').doc('main').get().then(d => d.data()?.chatId) || process.env.MASTER_CHAT_ID;
  
  if (bot && targetId) {
    const msg = type === 'new' 
      ? `✨ *Новая запись!*\n\n👤 ${appointment.clientName}\n💇‍♀️ ${appointment.serviceName}\n📅 ${appointment.date}`
      : `❌ *Запись отменена*\n\n👤 ${appointment.clientName}\n📅 ${appointment.date}`;
    
    bot.telegram.sendMessage(targetId, msg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.webApp('Открыть управление', `${APP_URL}/master/appointments`)]])
    }).catch(e => console.error('Error sending to master:', e));
  }
  res.json({ success: true });
});

app.post('/api/notify-client', async (req, res) => {
  const { appointment, status } = req.body;
  const user = await db.collection('users').doc(appointment.clientId).get();
  const targetId = user.data()?.chatId;

  if (bot && targetId) {
    const msg = status === 'confirmed'
      ? `✅ *Ваша запись подтверждена!*\n\n💇‍♀️ ${appointment.serviceName}\n📅 ${appointment.date}\n\nЖдем вас! ✨`
      : `😔 *Мастер не может принять вас в это время*\n\n📅 ${appointment.date}\n\nПожалуйста, выберите другое время.`;
    
    bot.telegram.sendMessage(targetId, msg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.webApp('Мои записи', `${APP_URL}/my-appointments`)]])
    }).catch(e => console.error('Error sending to client:', e));
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
  app.listen(PORT, '0.0.0.0', () => console.log(`Сервер запущен на порту ${PORT}`));
}
startServer();