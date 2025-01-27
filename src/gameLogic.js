const { query } = require('./db');
const { gameSettings } = require('./config');
const { sendTON, verifyTONTransaction } = require('./ton'); // Asume que tienes una función para verificar transacciones TON.

const DAILY_REWARD = gameSettings.dailyReward;
const LIFESPAN_DAYS = gameSettings.lifespan;
const MAX_BEES_PER_COLONY = gameSettings.maxBeesPerColony;
const MAX_COLONIES = gameSettings.maxColonies;
const COLONY_COST = gameSettings.colonyCost;
const GOTAS_POR_LITRO = gameSettings.gotperli;
const TON_POR_LITRO = gameSettings.tonperli;

function calcularSaldoTon(gotas) {
  return Math.floor(gotas / GOTAS_POR_LITRO) * TON_POR_LITRO;
}

async function registerUser(telegramId) {
  // Verificar si el usuario ya está registrado
  const existingUser = await query('SELECT id FROM users WHERE telegram_id = ?', [telegramId]);
  if (existingUser.length > 0) {
    return '¡Ya estás registrado!';
  }

  // Insertar el usuario en la tabla `users`
  const result = await query('INSERT INTO users (telegram_id, gotas, last_collected) VALUES (?, ?, ?)', [telegramId, 0, null]);
  const userId = result.insertId;

  // Crear una colmena inicial para el usuario
  const colonyResult = await query('INSERT INTO colonies (user_id, colony_name) VALUES (?, ?)', [userId, 'Colmena Inicial']);
  const colonyId = colonyResult.insertId;

  // Agregar una abeja free a la colmena inicial
  await query('INSERT INTO bees (colony_id, type, birth_date) VALUES (?, ?, ?)', [colonyId, 'free', new Date()]);

  return '¡Bienvenido a BeeSmart! Recibiste tu primera colmena con una abeja Free.';
}


async function buyColony(telegramId, txid = null) {
  // Verificar el usuario
  const user = await query('SELECT id FROM users WHERE telegram_id = ?', [telegramId]);
  if (user.length === 0) {
    return 'Usuario no encontrado.';
  }
  const userId = user[0].id;

  // Verificar cuántas colonias ya tiene el usuario
  const colonies = await query('SELECT COUNT(*) as total FROM colonies WHERE user_id = ?', [userId]);
  const currentColonies = colonies[0].total;

  if (currentColonies >= 6) {
    return 'Ya tienes el máximo de 6 colonias (1 gratis + 5 adicionales).';
  }

  // Cálculo del costo de la próxima colonia
  const baseCost = 15; // Costo base de la primera colonia comprada
  const costMultiplier = 1.1; // Incremento del 10%
  const colonyCost = Math.round(baseCost * Math.pow(costMultiplier, currentColonies - 1));

  if (currentColonies === 0) {
    // La primera colonia es gratis
    await query('INSERT INTO colonies (user_id, colony_name) VALUES (?, ?)', [userId, 'Colmena Inicial']);
    return '¡Recibiste tu primera colonia gratis!';
  }

  if (!txid) {
    const walletAddress = "UQC23Oavquqt7YaSiQm01vrGKlE2IfMRErkUTsx7KPUS_3qC"; // Dirección TON para recibir pagos.
    return `El costo de la próxima colonia es ${colonyCost} TON. \n` +
           `Envía el pago a la dirección:\n\n ${walletAddress} \n` +
           `\nDespués, usa el comando /buy_colony <txid> para confirmar la transacción.`;
  }

  // Verificar la transacción TON
  const transactionValid = await verifyTONTransaction(txid, colonyCost, telegramId);
  if (!transactionValid) {
    return 'Transacción no válida o no encontrada. Verifica el hash y vuelve a intentarlo.';
  }

  // Agregar la nueva colonia
  const colonyName = `Colmena #${currentColonies + 1}`;
  await query('INSERT INTO colonies (user_id, colony_name) VALUES (?, ?)', [userId, colonyName]);

  return `¡Compraste una nueva colonia (${colonyName}) por ${colonyCost} TON! Ahora tienes ${currentColonies + 1} colonias.`;
}


async function addBee(telegramId, colonyId, beeType, txid = null) {
  // Verificar el usuario
  const user = await query('SELECT id, gotas FROM users WHERE telegram_id = ?', [telegramId]);
  if (user.length === 0) {
    return 'Usuario no encontrado.';
  }
  const userId = user[0].id;

  // Verificar la colmena
  const colony = await query('SELECT * FROM colonies WHERE id = ? AND user_id = ?', [colonyId, userId]);
  if (colony.length === 0) {
    return 'Colmena no encontrada.';
  }

  // Verificar límite de abejas free
  if (beeType === 'free') {
    const freeBees = await query(
      'SELECT COUNT(*) as total FROM bees WHERE colony_id = ? AND type = "free"',
      [colonyId]
    );
    if (freeBees[0].total >= 1) {
      return 'Solo puedes tener una abeja Free. Ya tienes la tuya.';
    }
  }

  // Verificar el tipo de abeja y el costo
  const beeCost = {
    standard: 3,
    gold: 8,
  };

  const production = DAILY_REWARD[beeType];
  if (!production) {
    return 'Tipo de abeja no válido.';
  }

  if (beeType !== 'free') {
    if (!txid) {
      const walletAddress = "UQC23Oavquqt7YaSiQm01vrGKlE2IfMRErkUTsx7KPUS_3qC"; // Dirección TON para recibir pagos.
      return `Para comprar una abeja ${beeType}, envía ${beeCost[beeType]} TON a la dirección:\n\n ${walletAddress} \n` +
             `\nDespués, usa el comando /add_bee ${colonyId} ${beeType} <txid> para confirmar la transacción.`;
    }

    // Verificar la transacción en TON
    const transactionValid = await verifyTONTransaction(txid, beeCost[beeType], telegramId);
    if (!transactionValid) {
      return 'Transacción no válida o no encontrada. Verifica el hash y vuelve a intentarlo.';
    }
  }

  // Agregar la abeja a la colmena
  await query('INSERT INTO bees (colony_id, type, birth_date) VALUES (?, ?, ?)', [
    colonyId,
    beeType,
    new Date(),
  ]);

  return `¡Añadiste una abeja ${beeType} a la colmena!`;
}


async function cleanDeadBees(userId) {
  // Obtener todas las colonias del usuario
  const colonies = await query('SELECT id FROM colonies WHERE user_id = ?', [userId]);
  let hasChanges = false;

  for (const colony of colonies) {
    // Obtener todas las abejas de la colmena
    const bees = await query('SELECT id, type, birth_date FROM bees WHERE colony_id = ?', [colony.id]);
    for (const bee of bees) {
      if (!isBeeAlive(bee)) {
        // Eliminar abejas que han muerto
        await query('DELETE FROM bees WHERE id = ?', [bee.id]);
        hasChanges = true;
      }
    }
  }

  return hasChanges;
}

// Verificar si una abeja sigue viva
function isBeeAlive(bee) {
  const today = new Date();
  const birthDate = new Date(bee.birth_date);

  const lifespan = LIFESPAN_DAYS[bee.type] || 0;
  const ageInDays = Math.floor((today - birthDate) / (1000 * 60 * 60 * 24));
  return ageInDays <= lifespan;
}


async function collectNectar(telegramId) {
  // Obtener información del usuario
  const user = await query('SELECT id, gotas, last_collected FROM users WHERE telegram_id = ?', [telegramId]);
  if (user.length === 0) {
    return 'Usuario no encontrado.';
  }

  const userId = user[0].id;

  // Verificar si ya recolectó néctar hoy
  const today = new Date().toISOString().split('T')[0];
  const lastCollected = user[0].last_collected
    ? new Date(user[0].last_collected).toISOString().split('T')[0]
    : null;

  if (lastCollected === today) {
    return 'Ya recolectaste néctar hoy. ¡Regresa mañana!';
  }

  // Limpiar abejas muertas antes de calcular la producción
  const hasChanges = await cleanDeadBees(userId);

  // Calcular la producción total de néctar
  let totalProduction = 0;
  const colonies = await query('SELECT id FROM colonies WHERE user_id = ?', [userId]);
  for (const colony of colonies) {
    const bees = await query('SELECT type, birth_date FROM bees WHERE colony_id = ?', [colony.id]);
    for (const bee of bees) {
      if (isBeeAlive(bee)) {
        totalProduction += DAILY_REWARD[bee.type];
      }
    }
  }

  // Actualizar las gotas acumuladas y la última fecha de recolección
  const newGotas = user[0].gotas + totalProduction;
  await query('UPDATE users SET gotas = ?, last_collected = ? WHERE id = ?', [newGotas, today, userId]);

  return `Recolectaste ${totalProduction} gotas hoy. Total acumulado: ${newGotas} gotas.`;
}


async function retirarTon(telegramId, litros, walletAddress) {
  const MONTO_MINIMO_LITROS = 2; // Define el monto mínimo en litros

  // Validar si la dirección TON es válida
  if (!walletAddress || walletAddress.length < 48 || walletAddress.length > 50) {
    return 'Por favor, proporciona una dirección TON válida.';
  }

  // Verificar si la cantidad en litros es válida
  if (isNaN(litros) || litros <= 0) {
    return 'Por favor, proporciona una cantidad válida en litros.';
  }

  // Validar si la cantidad cumple con el monto mínimo
  if (litros < MONTO_MINIMO_LITROS) {
    return `El monto mínimo para retirar es de ${MONTO_MINIMO_LITROS} litros (${MONTO_MINIMO_LITROS * GOTAS_POR_LITRO} gotas).`;
  }

  // Verificar el usuario
  const user = await query('SELECT id, gotas FROM users WHERE telegram_id = ?', [telegramId]);
  if (user.length === 0) {
    return 'Usuario no encontrado. Usa /start para registrarte primero.';
  }

  const userId = user[0].id;
  const gotas = user[0].gotas;

  // Calcular gotas necesarias para el retiro solicitado
  const gotasNecesarias = litros * GOTAS_POR_LITRO;

  // Validar si el usuario tiene suficientes gotas
  if (gotas < gotasNecesarias) {
    return `Saldo insuficiente. Necesitas ${gotasNecesarias} gotas para retirar ${litros} litros (1 litro = ${GOTAS_POR_LITRO} gotas). Tienes actualmente ${gotas} gotas.`;
  }

  // Guardar la solicitud de retiro en la base de datos
  const montoRetiro = litros * TON_POR_LITRO; // 1 litro = 1 TON
  await query(
    'INSERT INTO withdraw_requests (user_id, gotas, ton_amount, wallet_address) VALUES (?, ?, ?, ?)',
    [userId, gotasNecesarias, montoRetiro, walletAddress]
  );

  // Resta las gotas del usuario
  await query('UPDATE users SET gotas = ? WHERE id = ?', [gotas - gotasNecesarias, userId]);

  return `¡Solicitud de retiro registrada con éxito! Retirarás ${montoRetiro} TON (${gotasNecesarias} gotas). Será procesado manualmente.`;
}



module.exports = { registerUser, buyColony, addBee, collectNectar, retirarTon };
