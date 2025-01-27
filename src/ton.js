const TonWeb = require('tonweb');
const { ton } = require('./config');
const axios = require('axios');

const tonweb = new TonWeb(new TonWeb.HttpProvider(ton.apiUrl));

// Convierte la clave privada de hexadecimal a buffer
const hexToBytes = (hex) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
};

const privateKeyBuffer = hexToBytes(ton.privateKey);
if (privateKeyBuffer.length !== 32) {
  throw new Error('La clave privada debe tener exactamente 32 bytes.');
}

const keyPair = TonWeb.utils.keyPairFromSeed(privateKeyBuffer);

const WalletClass = TonWeb.Wallets.all.v3R1;
const wallet = new WalletClass(tonweb.provider, {
  publicKey: keyPair.publicKey,
  wc: 0,
});

// Enviar TON
async function sendTON(toAddress, amount) {
  try {
    const amountNano = TonWeb.utils.toNano(amount.toString());
    const seqno = await wallet.methods.seqno().call();
    await wallet.methods.transfer({
      secretKey: keyPair.secretKey,
      toAddress: toAddress,
      amount: amountNano,
      seqno: seqno,
      payload: null,
      sendMode: 3,
    }).send();
    console.log(`💰 Enviado ${amount} TON a ${toAddress}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error al enviar TON:', error);
    return { success: false, error };
  }
}

// Verificar una transacción TON
async function verifyTONTransaction(txid, amount, telegramId) {
  const apiUrl = `${ton.apiUrl}/getTransactions`;
  const walletAddress = ton.publicAddress;

  try {
    const response = await axios.post(apiUrl, {
      account: walletAddress,
    });

    const transactions = response.data.result;
    const validTransaction = transactions.find(
      (tx) => tx.transaction_id === txid && tx.value === amount
    );

    return validTransaction !== undefined;
  } catch (error) {
    console.error('Error verificando transacción TON:', error.message);
    return false;
  }
}

module.exports = { sendTON, verifyTONTransaction };
