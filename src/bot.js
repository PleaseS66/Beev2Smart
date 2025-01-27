const { Telegraf } = require("telegraf");
const express = require("express");
const path = require("path");
const apiRoutes = require("./api");
const { connectDB, query } = require("./db");
const {
  registerUser,
  buyColony,
  addBee,
  collectNectar,
  retirarTon,
} = require("./gameLogic");
const { telegramToken } = require("./config");

const bot = new Telegraf(telegramToken);

// Configurar Express
const app = express();
app.use(express.json());

// Conectar a la base de datos
async function startBot() {
  try {
    await connectDB(); // Conectar a la base de datos
    console.log("📦 Conexión a la base de datos establecida.");

    // Rutas del bot
    bot.start((ctx) => {
      const userId = ctx.from.id; // Obtener el ID del usuario desde msg.from.id
      const webAppUrl = `https://b82526b5-8b47-4479-8bc5-80785fd1dd77-00-5b4lrqzg2re3.worf.replit.dev/?user_id=${userId}`; // URL de tu WebApp con el ID como parámetro

      return ctx.reply("¡Bienvenido! Accede a la WebApp desde aquí:", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Abrir WebApp",
                web_app: { url: webAppUrl }, // URL con el user_id incluido
              },
            ],
          ],
        },
      });
    });
    // Comando /collect para recolectar néctar
    bot.command("collect", async (ctx) => {
      const result = await collectNectar(ctx.from.id);
      return ctx.reply(result);
    });

    // Comando /buy_colony para comprar una colmena
    bot.command("buy_colony", async (ctx) => {
      const args = ctx.message.text.split(" ").slice(1); // /buy_colony [<txid>]
      const txid = args[0] || null;

      const result = await buyColony(ctx.from.id, txid);
      return ctx.reply(result);
    });

    // Comando /add_bee para agregar una abeja a una colmena
    bot.command("add_bee", async (ctx) => {
      const args = ctx.message.text.split(" ").slice(1); // /add_bee <colonyId> <beeType> [<txid>]
      const colonyId = parseInt(args[0], 10);
      const beeType = args[1];
      const txid = args[2] || null; // Opcional

      if (!colonyId || !beeType) {
        return ctx.reply("Uso: /add_bee <id_colmena> <tipo_abeja> [<txid>]");
      }

      const result = await addBee(ctx.from.id, colonyId, beeType, txid);
      return ctx.reply(result);
    });

    // Comando /retirar para retirar TON
    bot.command("retirar", async (ctx) => {
      const args = ctx.message.text.split(" ").slice(1); // Extraer argumentos
      const litros = parseFloat(args[0]); // La cantidad en litros es el primer argumento
      const walletAddress = args[1]; // La dirección TON es el segundo argumento

      if (!litros || !walletAddress) {
        return ctx.reply("Uso: /retirar <litros> <dirección TON>");
      }

      const result = await retirarTon(ctx.from.id, litros, walletAddress);
      return ctx.reply(result);
    });

    // Comando /testdb para probar conexión a la base de datos
    bot.command("testdb", async (ctx) => {
      try {
        const result = await query("SELECT 1");
        return ctx.reply("✅ Conexión a la base de datos exitosa.");
      } catch (error) {
        console.error("❌ Error en la prueba de base de datos:", error);
        return ctx.reply("❌ Error al conectar a la base de datos.");
      }
    });

    // Iniciar el bot
    bot.launch();
    console.log("🤖 Bot de Telegram en funcionamiento.");

    // Configuración de Express
    // Ruta para servir los archivos estáticos del frontend
    app.use(express.static(path.join(__dirname, "../public")));

    // Agregar el manejador de la API
    const api = require("./api");
    app.use("/api", api);

    // Iniciar el servidor
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () =>
      console.log(`🌐 Servidor web escuchando en el puerto ${PORT}`),
    );
  } catch (error) {
    console.error("❌ Error al iniciar el bot:", error);
  }
}

startBot();
