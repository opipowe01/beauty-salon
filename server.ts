import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Telegraf, Markup } from 'telegraf';
import path from 'path';
import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc, query, where, getDocs, updateDoc, orderBy } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json' assert { type: 'json' };

dotenv.config();

// Initialize Firebase Client SDK (works in Node.js too)
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL;

const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

// --- Bot Logic ---

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
      // Save user to Firestore
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
          `Привет, Маргарита! 👋\n\nВы вошли как мастер. Здесь вы будете получать уведомления о новых записях и сможете управлять ими.`,
          Markup.keyboard([
            ['📥 Активные заявки', '👥 Клиенты'],
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
    } catch (error) {
      console.error('Bot Start Error:', error);
      ctx.reply('Произошла ошибка при регистрации. Пожалуйста, попробуйте позже.');
    }
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

  bot.hears('📥 Активные заявки', async (ctx) => {
    try {
      const q = query(collection(db, 'appointments'), where('status', '==', 'pending'), orderBy('date', 'asc'));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        return ctx.reply('У вас пока нет новых заявок. ✨');
      }

      ctx.reply('Список новых заявок:');
      for (const doc of snapshot.docs) {
        const app = doc.data();
        const msg = `👤 *Клиент:* ${app.clientName}\n` +
                    `📞 *Тел:* ${app.clientPhone || 'Не указан'}\n` +
                    `💇‍♀️ *Услуга:* ${app.serviceName}\n` +
                    `📅 *Дата:* ${app.date}`;
        
        await ctx.reply(msg, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Одобрить', `confirm_${doc.id}`),
              Markup.button.callback('❌ Отклонить', `reject_${doc.id}`)
            ],
            [Markup.button.callback('💬 Написать', `contact_${doc.id}`)]
          ])
        });
      }
    } catch (e) {
      console.error('New Apps Error:', e);
      ctx.reply('Ошибка при получении заявок.');
    }
  });

  bot.hears('👥 Клиенты', async (ctx) => {
    try {
      const q = query(collection(db, 'appointments'), where('status', '==', 'confirmed'), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        return ctx.reply('Список одобренных клиентов пуст. 🌸');
      }

      let msg = '👥 *Ваши клиенты:*\n\n';
      snapshot.docs.forEach(doc => {
        const app = doc.data();
        msg += `👤 ${app.clientName}\n📞 ${app.clientPhone || '-'}\n💇‍♀️ ${app.serviceName}\n📅 ${app.date}\n\n`;
      });

      ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error('Clients List Error:', e);
      ctx.reply('Ошибка при получении списка клиентов.');
    }
  });

  bot.hears('⭐️ Отзывы', async (ctx) => {
    try {
      const q = query(collection(db, 'reviews'), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        return ctx.reply('Отзывов пока нет. Будьте первым! ✨', 
          Markup.inlineKeyboard([[Markup.button.webApp('Оставить отзыв', `${APP_URL}/reviews`)]])
        );
      }

      let msg = '⭐️ *Последние отзывы:*\n\n';
      snapshot.docs.slice(0, 5).forEach(doc => {
        const r = doc.data();
        const stars = '⭐'.repeat(r.rating);
        msg += `${stars}\n👤 ${r.clientName}\n💬 ${r.comment}\n\n`;
      });

      ctx.reply(msg, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.webApp('Все отзывы / Оставить свой', `${APP_URL}/reviews`)]])
      });
    } catch (e) {
      console.error('Reviews Error:', e);
      ctx.reply('Ошибка при получении отзывов.');
    }
  });

  // Action Handlers
  bot.action(/confirm_(.+)/, async (ctx) => {
    const appId = ctx.match[1];
    try {
      const appRef = doc(db, 'appointments', appId);
      const appSnap = await getDoc(appRef);
      if (!appSnap.exists()) return ctx.answerCbQuery('Запись не найдена.');
      
      await updateDoc(appRef, { status: 'confirmed' });
      
      // Notify client
      const appData = appSnap.data();
      const clientChatId = await getClientChatId(appData.clientId);
      if (clientChatId) {
        await bot.telegram.sendMessage(clientChatId, `✅ *Ваша запись подтверждена!*\n\n💇‍♀️ ${appData.serviceName}\n📅 ${appData.date}`, { parse_mode: 'Markdown' });
      }

      const messageText = (ctx.callbackQuery?.message && 'text' in ctx.callbackQuery.message) ? ctx.callbackQuery.message.text : '';
      await ctx.editMessageText(messageText + '\n\n✅ *Одобрено*', { parse_mode: 'Markdown' });
      ctx.answerCbQuery('Запись подтверждена!');
    } catch (e) {
      console.error('Confirm Action Error:', e);
      ctx.answerCbQuery('Ошибка.');
    }
  });

  bot.action(/reject_(.+)/, async (ctx) => {
    const appId = ctx.match[1];
    try {
      const appRef = doc(db, 'appointments', appId);
      const appSnap = await getDoc(appRef);
      if (!appSnap.exists()) return ctx.answerCbQuery('Запись не найдена.');
      
      await updateDoc(appRef, { status: 'rejected' });
      
      // Notify client
      const appData = appSnap.data();
      const clientChatId = await getClientChatId(appData.clientId);
      if (clientChatId) {
        await bot.telegram.sendMessage(clientChatId, `😔 *К сожалению, мастер отклонил запись.*\n\n📅 ${appData.date}\nПожалуйста, выберите другое время.`, { parse_mode: 'Markdown' });
      }

      const messageText = (ctx.callbackQuery?.message && 'text' in ctx.callbackQuery.message) ? ctx.callbackQuery.message.text : '';
      await ctx.editMessageText(messageText + '\n\n❌ *Отклонено*', { parse_mode: 'Markdown' });
      ctx.answerCbQuery('Запись отклонена.');
    } catch (e) {
      console.error('Reject Action Error:', e);
      ctx.answerCbQuery('Ошибка.');
    }
  });

  bot.action(/contact_(.+)/, async (ctx) => {
    const appId = ctx.match[1];
    try {
      const appSnap = await getDoc(doc(db, 'appointments', appId));
      if (!appSnap.exists()) return ctx.answerCbQuery('Запись не найдена.');
      const appData = appSnap.data();
      
      const userSnap = await getDoc(doc(db, 'users', appData.clientId));
      const userData = userSnap.data();
      
      let msg = `👤 *Клиент:* ${appData.clientName}\n`;
      if (userData?.username) msg += `🔗 *Telegram:* @${userData.username}\n`;
      if (appData.clientPhone) msg += `📞 *Телефон:* ${appData.clientPhone}`;
      
      ctx.reply(msg, { parse_mode: 'Markdown' });
      ctx.answerCbQuery();
    } catch (e) {
      ctx.answerCbQuery('Ошибка.');
    }
  });

  bot.hears('ℹ️ Информация', async (ctx) => {
    try {
      const masterDoc = await getDoc(doc(db, 'masterInfo', 'main'));
      const data = masterDoc.data();
      ctx.reply(
        `🌸 *О мастере*\n\n` +
        `👤 *Имя:* ${data?.name || 'Маргарита'}\n` +
        `✨ *Опыт:* ${data?.experience || '5 лет'}\n` +
        `📍 *Адрес:* ${data?.address || 'Не указан'}\n` +
        `📝 *О себе:* ${data?.bio || 'Профессиональный мастер красоты'}\n\n` +
        `Мы ждем вас!`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('Info Error:', e);
      ctx.reply('Не удалось загрузить информацию о мастере.');
    }
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
                    `📞 *Тел:* ${appointment.clientPhone || 'Не указан'}\n` +
                    `💇‍♀️ *Услуга:* ${appointment.serviceName}\n` +
                    `📅 *Дата:* ${appointment.date}\n` +
                    `💬 *Коммент:* ${appointment.notes || 'Нет'}`;
          
          await bot.telegram.sendMessage(targetId, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback('✅ Одобрить', `confirm_${appointment.id}`),
                Markup.button.callback('❌ Отклонить', `reject_${appointment.id}`)
              ],
              [Markup.button.callback('💬 Написать клиенту', `contact_${appointment.id}`)]
            ])
          });
        } else if (type === 'cancel') {
          message = `❌ *Клиент отменил запись*\n\n` +
                    `👤 *Клиент:* ${appointment.clientName}\n` +
                    `💇‍♀️ *Услуга:* ${appointment.serviceName}\n` +
                    `📅 *Дата:* ${appointment.date}`;
          await bot.telegram.sendMessage(targetId, message, { parse_mode: 'Markdown' });
        }

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
