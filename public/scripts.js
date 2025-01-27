// URL de la API (cámbiala por la correcta de tu servidor)
const API_URL =
  "https://b82526b5-8b47-4479-8bc5-80785fd1dd77-00-5b4lrqzg2re3.worf.replit.dev/api";

// Obtener el user_id desde los parámetros de la URL
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get("user_id");

if (!userId) {
  alert(
    "No se detectó tu ID de usuario. Asegúrate de acceder desde el enlace proporcionado por el bot.",
  );
} else {
  console.log("ID de usuario detectado:", userId); // Verificar que el user_id es correcto

  // Función para actualizar la información del usuario
  // Función para actualizar la información del usuario
  async function updateUserInfo() {
    try {
      const response = await fetch(`${API_URL}/user_status?id=${userId}`);
      const data = await response.json();

      if (data.success) {
        // Mostrar las gotas y el número total de abejas
        document.getElementById("gotas").textContent = data.gotas || "0";
        document.getElementById("abejas").textContent = data.abejas || "0";

        // Mostrar los IDs de las colonias como una lista
        const coloniasEl = document.getElementById("colonias");
        if (data.colonias.length === 0) {
          coloniasEl.textContent = "No tienes colonias.";
        } else {
          coloniasEl.textContent = data.colonias.join(", "); // Mostrar los IDs separados por comas
        }
      } else {
        alert(data.error || "No se pudieron cargar los datos del usuario.");
      }
    } catch (error) {
      console.error("Error al conectar con la API:", error);
    }
  }

  // Función para recolectar néctar
  document
    .getElementById("collect-nectar")
    .addEventListener("click", async () => {
      try {
        const response = await fetch(`${API_URL}/collect_nectar`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id: userId }),
        });
        const data = await response.json();

        if (data.success) {
          alert(`Recolectaste néctar. Total gotas: ${data.gotas}`);
          updateUserInfo();
        } else {
          alert(data.error || "No se pudo recolectar néctar.");
        }
      } catch (error) {
        console.error("Error al conectar con la API:", error);
      }
    });

  // Función para comprar una colmena
  document.getElementById("buy-colony").addEventListener("click", async () => {
    const txid = prompt(
      "Para comprar una colmena, ingresa el TXID de la transacción TON:",
    );

    if (!txid) {
      alert("Debes ingresar un TXID válido para continuar.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/buy_colony`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: userId, txid }),
      });
      const data = await response.json();

      if (data.success) {
        alert("¡Has comprado una nueva colmena!");
        updateUserInfo();
      } else {
        alert(data.error || "No se pudo comprar una colmena.");
      }
    } catch (error) {
      console.error("Error al conectar con la API:", error);
    }
  });

  // Función para comprar una abeja

  document.getElementById("buy-bee").addEventListener("click", async () => {
    const colonyId = prompt("Ingresa el ID de la colmena:");
    const beeType = prompt(
      "¿Qué tipo de abeja deseas agregar? (free, standard, gold):",
    );
    const txid =
      beeType === "free" ? null : prompt("Ingresa el TXID de la transacción:");

    if (!colonyId || !beeType) {
      alert("Debes proporcionar el ID de la colmena y el tipo de abeja.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/add_bee`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: userId, colonyId, beeType, txid }),
      });
      const data = await response.json();

      if (data.success) {
        alert(data.message); // Mensaje de éxito desde la API
        updateUserInfo(); // Actualizamos la UI
      } else {
        alert(data.error || "No se pudo añadir la abeja.");
      }
    } catch (error) {
      console.error("Error al conectar con la API:", error);
    }
  });

  // Función para retirar TON
  document.getElementById("withdraw").addEventListener("click", async () => {
    const litros = prompt("¿Cuántos litros deseas retirar?");
    const wallet = prompt("Ingresa tu dirección TON:");

    if (!litros || !wallet) {
      alert("Debes proporcionar los litros y la dirección TON.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: userId, litros, wallet }),
      });
      const data = await response.json();

      if (data.success) {
        alert("¡Solicitud de retiro registrada!");
        updateUserInfo();
      } else {
        alert(data.error || "No se pudo realizar el retiro.");
      }
    } catch (error) {
      console.error("Error al conectar con la API:", error);
    }
  });

  // Actualizar la información al cargar la página
  updateUserInfo();
}
