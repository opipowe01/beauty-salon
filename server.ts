import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Токен вашего бота (берется из .env или настроек Render)
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

// ID чата мастера (подставляется автоматически при /start)
let masterChatId = process.env.MASTER_CHAT_ID || '';

bot.start((ctx) => {
  const payload = (ctx as any).startPayload;
  // Регистрация мастера по username или специальной ссылке
  if (payload === 'master' || ctx.from.username === 'egor0info1') {
    masterChatId = ctx.chat.id.toString();
    ctx.reply('✅ Вы успешно зарегистрированы как мастер! Теперь сюда будут приходить уведомления о новых записях.');
  } else {
    ctx.reply('Привет! Я бот салона красоты. Здесь мастер получает уведомления о записях.');
  }
});

// Эндпоинт для отправки уведомлений
app.post("/api/notify-master", async (req, res) => {
  const { appointment } = req.body;
  
  if (!masterChatId) {
    console.error("Master Chat ID not set");
    return res.status(400).json({ error: "Master not registered in bot" });
  }

  const message = `
🔔 *Новая запись!*

👤 *Клиент:* ${appointment.clientName}
📞 *Телефон:* ${appointment.clientPhone}
💇‍♀️ *Услуга:* ${appointment.serviceName}
📅 *Дата:* ${appointment.date}
📝 *Заметка:* ${appointment.notes || 'нет'}

Пожалуйста, подтвердите запись в панели управления.
  `;

  try {
    await bot.telegram.sendMessage(masterChatId, message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.url('📱 Открыть управление', `https://t.me/${bot.botInfo?.username || 'bot'}/app`)]
      ])
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Telegram notify error:", error);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  
  bot.launch().then(() => console.log('Bot started')).catch(err => console.error('Bot launch error:', err));
}

startServer();
