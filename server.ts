import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Telegraf, Markup } from 'telegraf';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Инициализация Firebase на сервере
const firebaseConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, './firebase-applet-config.json'), 'utf-8'));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const app = express();
const PORT = 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL;

const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

if (bot) {
  // Команда Старт
  bot.start((ctx) => {
    ctx.reply(
      `Привет, ${ctx.from.first_name}! 🌸\n\nЯ бот твоего Салона Красоты. Здесь ты можешь записываться на услуги и получать уведомления о своих визитах.`,
      Markup.inlineKeyboard([
        [Markup.button.webApp('Открыть приложение', `${APP_URL}/`) as any],
      ])
    );
  });

  // Команда для проверки своих записей
  bot.command('my_bookings', async (ctx) => {
    const tgId = ctx.from.id.toString();
    const usersRef = collection(db, 'users');
    const qUser = query(usersRef, where('tgId', '==', tgId));
    const userSnap = await getDocs(qUser);

    if (userSnap.empty) {
      return ctx.reply('Сначала открой приложение, чтобы я тебя запомнил! 😊');
    }

    const userId = userSnap.docs[0].id;
    const appRef = collection(db, 'appointments');
    const qApp = query(appRef, where('clientId', '==', userId), orderBy('createdAt', 'desc'));
    const appSnap = await getDocs(qApp);

    if (appSnap.empty) {
      return ctx.reply('У тебя пока нет активных записей.');
    }

    let message = '📅 Твои записи:\n\n';
    appSnap.forEach(doc => {
      const data = doc.data();
      const status = data.status === 'confirmed' ? '✅ Подтверждена' : data.status === 'pending' ? '⏳ Ждет подтверждения' : '❌ Отменена';
      message += `🔹 ${data.serviceName}\n🕒 ${data.date} в ${data.time}\nСтатус: ${status}\n\n`;
    });

    ctx.reply(message);
  });

  // Обработка кнопок Подтвердить/Отказать от мастера
  bot.action(/confirm_app:(.+)/, async (ctx) => {
    const appId = ctx.match[1];
    try {
      const appRef = doc(db, 'appointments', appId);
      const appSnap = await getDoc(appRef);
      if (!appSnap.exists()) return ctx.answerCbQuery('Запись не найдена');

      await updateDoc(appRef, { status: 'confirmed' });
      const data = appSnap.data();

      ctx.editMessageText(`✅ Запись подтверждена!\n\nКлиент: ${data.clientName}\nУслуга: ${data.serviceName}\nДата: ${data.date} ${data.time}`);
      
      // Уведомляем клиента
      const clientDoc = await getDoc(doc(db, 'users', data.clientId));
      if (clientDoc.exists() && clientDoc.data().tgId) {
        bot.telegram.sendMessage(clientDoc.data().tgId, `🌟 Ура! Мастер подтвердил твою запись:\n\n💅 ${data.serviceName}\n📅 ${data.date} в ${data.time}\n\nЖдем тебя!`);
      }
    } catch (e) {
      console.error(e);
      ctx.answerCbQuery('Ошибка при обновлении');
    }
  });

  bot.action(/reject_app:(.+)/, async (ctx) => {
    const appId = ctx.match[1];
    try {
      const appRef = doc(db, 'appointments', appId);
      const appSnap = await getDoc(appRef);
      await updateDoc(appRef, { status: 'rejected' });
      const data = appSnap.data()!;

      ctx.editMessageText(`❌ Вы отказали в записи.\n\nКлиент: ${data.clientName}\nУслуга: ${data.serviceName}`);
      
      const clientDoc = await getDoc(doc(db, 'users', data.clientId));
      if (clientDoc.exists() && clientDoc.data().tgId) {
        bot.telegram.sendMessage(clientDoc.data().tgId, `😔 К сожалению, мастер не сможет принять тебя в это время:\n\n${data.serviceName} (${data.date} ${data.time})\n\nПопробуй выбрать другое время в приложении.`);
      }
    } catch (e) {
      console.error(e);
    }
  });

  bot.launch();
}

app.use(express.json());

// API для связи Telegram ID и Firebase UID
app.post('/api/link-tg', async (req, res) => {
  const { uid, tgId, firstName } = req.body;
  try {
    await updateDoc(doc(db, 'users', uid), { tgId: tgId.toString(), firstName }, { merge: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to link' });
  }
});

// API для уведомления мастера о новой записи
app.post('/api/notify-master', async (req, res) => {
  const { appointment, appId } = req.body;
  
  // Ищем админа в базе
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('role', '==', 'admin'));
  const adminSnap = await getDocs(q);

  if (!adminSnap.empty && bot) {
    const adminData = adminSnap.docs[0].data();
    if (adminData.tgId) {
      bot.telegram.sendMessage(
        adminData.tgId,
        `🔔 НОВАЯ ЗАЯВКА!\n\n👤 Клиент: ${appointment.clientName}\n📞 Тел: ${appointment.clientPhone}\n💅 Услуга: ${appointment.serviceName}\n📅 Дата: ${appointment.date}\n🕒 Время: ${appointment.time}\n💬 Коммент: ${appointment.clientComment || 'нет'}\n\nЧто делаем?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Подтвердить', `confirm_app:${appId}`),
            Markup.button.callback('❌ Отказать', `reject_app:${appId}`)
          ],
          [Markup.button.webApp('Открыть в приложении', `${APP_URL}/master/appointments`) as any]
        ])
      );
    }
  }
  res.json({ success: true });
});

async function startServer() {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
  app.listen(PORT, '0.0.0.0', () => console.log(`Сервер: http://localhost:${PORT}`));
}

startServer(import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Telegraf, Markup } from 'telegraf';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Инициализация Firebase
const configPath = path.resolve(__dirname, './firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL; // Это будет адрес на Render

const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

if (bot) {
  bot.start((ctx) => {
    ctx.reply(
      `Привет, ${ctx.from.first_name}! 🌸\n\nЯ бот твоего Салона Красоты. Записывайся на услуги прямо здесь!`,
      Markup.inlineKeyboard([
        [Markup.button.webApp('Записаться онлайн', `${APP_URL}/`) as any],
      ])
    );
  });

  bot.command('my_bookings', async (ctx) => {
    const tgId = ctx.from.id.toString();
    const qUser = query(collection(db, 'users'), where('tgId', '==', tgId));
    const userSnap = await getDocs(qUser);
    if (userSnap.empty) return ctx.reply('Открой приложение, чтобы я тебя узнал!');
    
    const userId = userSnap.docs[0].id;
    const qApp = query(collection(db, 'appointments'), where('clientId', '==', userId), orderBy('createdAt', 'desc'));
    const appSnap = await getDocs(qApp);
    if (appSnap.empty) return ctx.reply('Записей пока нет.');

    let msg = '📅 Твои записи:\n\n';
    appSnap.forEach(d => {
      const data = d.data();
      const status = data.status === 'confirmed' ? '✅' : data.status === 'pending' ? '⏳' : '❌';
      msg += `${status} ${data.serviceName}\n🕒 ${data.date} в ${data.time}\n\n`;
    });
    ctx.reply(msg);
  });

  bot.action(/confirm_app:(.+)/, async (ctx) => {
    const appId = ctx.match[1];
    const appRef = doc(db, 'appointments', appId);
    const appSnap = await getDoc(appRef);
    if (!appSnap.exists()) return;
    await updateDoc(appRef, { status: 'confirmed' });
    const data = appSnap.data();
    ctx.editMessageText(`✅ Подтверждено!\n\nКлиент: ${data.clientName}\nУслуга: ${data.serviceName}`);
    const clientDoc = await getDoc(doc(db, 'users', data.clientId));
    if (clientDoc.exists() && clientDoc.data().tgId) {
      bot.telegram.sendMessage(clientDoc.data().tgId, `🌟 Запись подтверждена!\n\n${data.serviceName}\n${data.date} в ${data.time}`);
    }
  });

  bot.action(/reject_app:(.+)/, async (ctx) => {
    const appId = ctx.match[1];
    const appRef = doc(db, 'appointments', appId);
    const appSnap = await getDoc(appRef);
    await updateDoc(appRef, { status: 'rejected' });
    ctx.editMessageText(`❌ Отказано.`);
    const data = appSnap.data()!;
    const clientDoc = await getDoc(doc(db, 'users', data.clientId));
    if (clientDoc.exists() && clientDoc.data().tgId) {
      bot.telegram.sendMessage(clientDoc.data().tgId, `😔 К сожалению, мастер отклонил запись на ${data.date} ${data.time}.`);
    }
  });

  bot.launch();
}

app.use(express.json());

app.post('/api/link-tg', async (req, res) => {
  const { uid, tgId, firstName } = req.body;
  await updateDoc(doc(db, 'users', uid), { tgId: tgId.toString(), firstName }, { merge: true });
  res.json({ success: true });
});

app.post('/api/notify-master', async (req, res) => {
  const { appointment, appId } = req.body;
  const q = query(collection(db, 'users'), where('role', '==', 'admin'));
  const adminSnap = await getDocs(q);
  if (!adminSnap.empty && bot) {
    const adminData = adminSnap.docs[0].data();
    if (adminData.tgId) {
      bot.telegram.sendMessage(
        adminData.tgId,
        `🔔 НОВАЯ ЗАЯВКА!\n\n👤 ${appointment.clientName}\n📞 ${appointment.clientPhone}\n💅 ${appointment.serviceName}\n📅 ${appointment.date} ${appointment.time}\n\nЧто делаем?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Ок', `confirm_app:${appId}`), Markup.button.callback('❌ Нет', `reject_app:${appId}`)],
          [Markup.button.webApp('Открыть записи', `${APP_URL}/master/appointments`) as any]
        ])
      );
    }
  }
  res.json({ success: true });
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    // В режиме продакшн отдаем готовую папку dist
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    // В режиме разработки используем Vite
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => console.log(`Сервер запущен на порту ${PORT}`));
}

startServer(););