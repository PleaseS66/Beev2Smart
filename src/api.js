const cors = require("cors");
const express = require("express");
const { query } = require("./db");
const { gameSettings } = require("./config");
const { verifyTONTransaction } = require("./ton"); // Verifica transacciones TON.
const router = express.Router();

router.use(cors());
router.use(express.json());

// Ruta: Obtener el estado del usuario
router.get("/user_status", async (req, res) => {
  const telegramId = req.query.id;

  if (!telegramId) {
    return res
      .status(400)
      .json({ success: false, error: "ID de usuario no proporcionado." });
  }

  try {
    console.log("Obteniendo datos del usuario con ID:", telegramId);

    const user = await query(
      "SELECT id, gotas FROM users WHERE telegram_id = ?",
      [telegramId],
    );
    console.log("Resultado de la consulta de usuario:", user);

    if (user.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Usuario no encontrado." });
    }

    const userId = user[0].id;
    const gotas = user[0].gotas;

    console.log("Obteniendo colonias...");
    const colonies = await query("SELECT id FROM colonies WHERE user_id = ?", [
      userId,
    ]);

    console.log("Obteniendo abejas...");
    const bees = await query(
      "SELECT COUNT(*) as total FROM bees WHERE colony_id IN (SELECT id FROM colonies WHERE user_id = ?)",
      [userId],
    );

    // Crear un array con los IDs de las colonias
    const colonyIds = colonies.map((colony) => colony.id);

    res.json({
      success: true,
      gotas,
      colonias: colonyIds, // Devolver los IDs en lugar de solo un conteo
      abejas: bees[0].total,
    });
  } catch (error) {
    console.error("Error al obtener el estado del usuario:", error);
    res
      .status(500)
      .json({ success: false, error: "Error interno del servidor." });
  }
});

// Ruta: Recolectar néctar
router.post("/collect_nectar", async (req, res) => {
  const telegramId = req.body.id;

  if (!telegramId) {
    return res
      .status(400)
      .json({ success: false, error: "ID de usuario no proporcionado." });
  }

  try {
    const user = await query(
      "SELECT id, last_collected FROM users WHERE telegram_id = ?",
      [telegramId],
    );

    if (user.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Usuario no encontrado." });
    }

    const userId = user[0].id;
    const lastCollected = user[0].last_collected;

    // Verificar las 24 horas
    const now = new Date();
    const lastCollectedDate = lastCollected ? new Date(lastCollected) : null;

    if (lastCollectedDate && now - lastCollectedDate < 24 * 60 * 60 * 1000) {
      return res.json({
        success: false,
        error: "Ya recolectaste néctar en las últimas 24 horas.",
      });
    }

    // Calcular la producción diaria
    const bees = await query(
      "SELECT type FROM bees WHERE colony_id IN (SELECT id FROM colonies WHERE user_id = ?)",
      [userId],
    );

    let totalProduction = 0;
    bees.forEach((bee) => {
      totalProduction += gameSettings.dailyReward[bee.type] || 0;
    });

    // Actualizar las gotas y la última fecha de recolección
    await query(
      "UPDATE users SET gotas = gotas + ?, last_collected = ? WHERE id = ?",
      [totalProduction, now, userId],
    );

    res.json({ success: true, gotas: totalProduction });
  } catch (error) {
    console.error("Error al recolectar néctar:", error);
    res
      .status(500)
      .json({ success: false, error: "Error interno del servidor." });
  }
});

// Ruta: Comprar abeja
router.post("/add_bee", async (req, res) => {
  const { id: telegramId, colonyId, beeType, txid } = req.body;

  if (!telegramId || !colonyId || !beeType) {
    return res
      .status(400)
      .json({ success: false, error: "Faltan datos necesarios." });
  }

  try {
    // Verificar el usuario
    const user = await query("SELECT id FROM users WHERE telegram_id = ?", [
      telegramId,
    ]);
    if (user.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Usuario no encontrado." });
    }
    const userId = user[0].id;

    // Verificar la colmena
    const colony = await query(
      "SELECT id FROM colonies WHERE id = ? AND user_id = ?",
      [colonyId, userId],
    );
    if (colony.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Colmena no encontrada." });
    }

    // Validar el tipo de abeja
    const beeCost = gameSettings.beeCosts[beeType];
    if (!beeCost && beeType !== "free") {
      return res
        .status(400)
        .json({ success: false, error: "Tipo de abeja no válido." });
    }

    // Restricción: Solo 1 abeja free por usuario
    if (beeType === "free") {
      const freeBeeCount = await query(
        "SELECT COUNT(*) as total FROM bees WHERE type = 'free' AND colony_id IN (SELECT id FROM colonies WHERE user_id = ?)",
        [userId],
      );
      if (freeBeeCount[0].total > 0) {
        return res.status(400).json({
          success: false,
          error: "Ya tienes una abeja free. No puedes añadir otra.",
        });
      }
    }

    // Si la abeja no es `free`, validar el `txid`
    if (beeType !== "free") {
      const transactionValid = await verifyTONTransaction(
        txid,
        beeCost,
        telegramId,
      );
      if (!transactionValid) {
        return res.status(400).json({
          success: false,
          error: "Transacción no válida o no encontrada. Verifica el TXID.",
        });
      }
    }

    // Agregar la abeja a la colmena
    await query(
      "INSERT INTO bees (colony_id, type, birth_date) VALUES (?, ?, ?)",
      [colonyId, beeType, new Date()],
    );

    res.json({
      success: true,
      message: `¡Abeja ${beeType} añadida a la colmena ${colonyId}!`,
    });
  } catch (error) {
    console.error("Error al agregar abeja:", error);
    res
      .status(500)
      .json({ success: false, error: "Error interno del servidor." });
  }
});

// Ruta: Comprar colmena
router.post("/buy_colony", async (req, res) => {
  const { id: telegramId, txid } = req.body;

  if (!telegramId || !txid) {
    return res
      .status(400)
      .json({ success: false, error: "Faltan datos necesarios." });
  }

  try {
    // Verificar el usuario
    const user = await query("SELECT id FROM users WHERE telegram_id = ?", [
      telegramId,
    ]);

    if (user.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Usuario no encontrado." });
    }

    const userId = user[0].id;

    // Verificar la transacción TON
    const colonyCost = gameSettings.colonyCost;
    const transactionValid = await verifyTONTransaction(
      txid,
      colonyCost,
      telegramId,
    );

    if (!transactionValid) {
      return res.json({
        success: false,
        error: "Transacción no válida o no encontrada.",
      });
    }

    // Agregar una nueva colmena
    await query("INSERT INTO colonies (user_id, colony_name) VALUES (?, ?)", [
      userId,
      `Colmena #${Date.now()}`,
    ]);

    res.json({ success: true, message: "Colmena comprada con éxito." });
  } catch (error) {
    console.error("Error al comprar colmena:", error);
    res
      .status(500)
      .json({ success: false, error: "Error interno del servidor." });
  }
});

// Ruta: Retirar TON
router.post("/withdraw", async (req, res) => {
  const { id: telegramId, litros, wallet } = req.body;

  if (!telegramId || !litros || !wallet) {
    return res
      .status(400)
      .json({ success: false, error: "Faltan datos necesarios." });
  }

  try {
    const gotasNecesarias = litros * gameSettings.gotperli;

    if (litros < 2) {
      return res.status(400).json({
        success: false,
        error: `El monto mínimo para retirar es 2 litros (${gameSettings.gotperli * 2} gotas).`,
      });
    }

    const user = await query(
      "SELECT id, gotas FROM users WHERE telegram_id = ?",
      [telegramId],
    );

    if (user.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Usuario no encontrado." });
    }

    const userId = user[0].id;
    const currentGotas = user[0].gotas;

    if (currentGotas < gotasNecesarias) {
      return res.status(400).json({
        success: false,
        error: `Saldo insuficiente. Necesitas ${gotasNecesarias} gotas para retirar ${litros} litros.`,
      });
    }

    await query(
      "INSERT INTO withdraw_requests (user_id, gotas, ton_amount, wallet_address) VALUES (?, ?, ?, ?)",
      [userId, gotasNecesarias, litros, wallet],
    );

    await query("UPDATE users SET gotas = gotas - ? WHERE id = ?", [
      gotasNecesarias,
      userId,
    ]);

    res.json({
      success: true,
      message: "Solicitud de retiro registrada con éxito.",
    });
  } catch (error) {
    console.error("Error al procesar el retiro:", error);
    res
      .status(500)
      .json({ success: false, error: "Error interno del servidor." });
  }
});

module.exports = router;
