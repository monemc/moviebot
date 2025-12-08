require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// ✅ START
bot.start((ctx) => {
  ctx.reply(
    "🎬 Assalomu alaykum!\n\nBu test rejimidagi Movie Bot.\nHozircha faqat asosiy funksiyalar ishlaydi.",
    Markup.keyboard([
      ["🔎 Kino qidirish"],
      ["ℹ️ Bot haqida", "📞 Aloqa"]
    ]).resize()
  );
});

// ✅ KINO QIDIRISH (VAQTINCHA DUMMY)
bot.hears("🔎 Kino qidirish", (ctx) => {
  ctx.reply("🛠 Hozircha kino qidirish vaqtincha o‘chiq.\nTez orada qo‘shiladi!");
});

// ✅ BOT HAQIDA
bot.hears("ℹ️ Bot haqida", (ctx) => {
  ctx.reply(
    "🤖 Movie Bot\n\n" +
    "Versiya: 2.0.0 (Test)\n" +
    "Holat: Ishlayapti ✅\n\n" +
    "Tez orada:\n" +
    "• Kino qidirish\n• Yuklab olish\n• Majburiy obuna"
  );
});

// ✅ ALOQA
bot.hears("📞 Aloqa", (ctx) => {
  ctx.reply("📩 Admin: @your_username");
});

// ✅ TEST UCHUN BUYRUQLAR
bot.command("ping", (ctx) => ctx.reply("pong ✅"));
bot.command("status", (ctx) => ctx.reply("✅ Bot ishlayapti, hammasi joyida!"));

// ✅ HAR QANDAY YOZUVGA REAKSIYA
bot.on("text", (ctx) => {
  ctx.reply("❗ Noma’lum buyruq.\nIltimos, menyudan foydalaning.");
});

// ✅ BOTNI ISHGA TUSHIRISH
bot.launch().then(() => {
  console.log("✅ Bot muvaffaqiyatli ishga tushdi");
});

// ✅ RENDER UCHUN TO‘G‘RI YOPILISH
process.on("SIGTERM", () => bot.stop("SIGTERM"));
process.on("SIGINT", () => bot.stop("SIGINT"));
