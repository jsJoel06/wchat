import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

// Conéctate a tu backend de Render
const socket = io("https://chat-3syl.onrender.com", {
  transports: ["websocket"],
});

export default function Chat() {
  const [mensaje, setMensaje] = useState("");
  const [mensajes, setMensajes] = useState([]);
  const [nombre, setNombre] = useState("");
  const mensajesEndRef = useRef(null);

  // Pedir nombre al inicio
  useEffect(() => {
    const user = prompt("Ingresa tu nombre:") || "Usuario";
    setNombre(user);
    socket.emit("nuevoUsuario", user);
  }, []);

  // Hacer scroll al final
  const scrollToBottom = () => {
    mensajesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Escuchar mensajes del backend
  useEffect(() => {
    socket.on("mensaje", (msg) => {
      setMensajes((prev) => [...prev, msg]);
      scrollToBottom();
      console.log("Mensaje recibido:", msg);
    });

    return () => socket.disconnect();
  }, []);

  const enviarMensaje = () => {
    if (!mensaje.trim()) return;

    const msgObj = { usuario: nombre, texto: mensaje };
    setMensajes((prev) => [...prev, msgObj]); // Mostrar inmediatamente
    socket.emit("mensaje", msgObj); // Enviar al backend
    setMensaje("");
    scrollToBottom();
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>Chat JS</h2>
      <div style={styles.chatBox}>
        {mensajes.map((m, i) => {
          const esSistema = m.usuario === "Sistema";
          const esYo = m.usuario === nombre;

          return (
            <div
              key={i}
              style={{
                ...styles.mensaje,
                alignSelf: esSistema ? "center" : esYo ? "flex-end" : "flex-start",
                backgroundColor: esSistema ? "#f9f9f9" : esYo ? "#4CAF50" : "#f1f0f0",
                color: esSistema ? "#888" : esYo ? "#fff" : "#000",
              }}
            >
              {!esSistema && !esYo && <strong>{m.usuario}: </strong>}
              {m.texto}
            </div>
          );
        })}
        <div ref={mensajesEndRef} />
      </div>
      <div style={styles.inputContainer}>
        <input
          type="text"
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          placeholder="Escribe tu mensaje..."
          style={styles.input}
          onKeyDown={(e) => e.key === "Enter" && enviarMensaje()}
        />
        <button onClick={enviarMensaje} style={styles.button}>
          Enviar
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "600px",
    margin: "20px auto",
    padding: "15px",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    borderRadius: "10px",
    boxShadow: "0px 5px 20px rgba(0,0,0,0.2)",
    backgroundColor: "#fff",
  },
  header: {
    textAlign: "center",
    marginBottom: "15px",
    color: "#333",
  },
  chatBox: {
    height: "60vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    padding: "10px",
    border: "1px solid #ddd",
    borderRadius: "10px",
    backgroundColor: "#fafafa",
  },
  mensaje: {
    padding: "10px 15px",
    margin: "5px 0",
    borderRadius: "20px",
    maxWidth: "75%",
    wordWrap: "break-word",
    boxShadow: "0px 2px 5px rgba(0,0,0,0.1)",
  },
  inputContainer: {
    display: "flex",
    marginTop: "10px",
    gap: "10px",
  },
  input: {
    flex: 1,
    padding: "10px 15px",
    borderRadius: "20px",
    border: "1px solid #ccc",
    outline: "none",
    fontSize: "1rem",
  },
  button: {
    padding: "10px 20px",
    borderRadius: "20px",
    border: "none",
    backgroundColor: "#4CAF50",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "1rem",
  },

  // Media queries para móviles
  "@media (max-width: 480px)": {
    container: {
      margin: "10px",
      padding: "10px",
    },
    chatBox: {
      height: "50vh",
    },
    mensaje: {
      maxWidth: "90%",
      fontSize: "0.9rem",
    },
    input: {
      fontSize: "0.9rem",
    },
    button: {
      fontSize: "0.9rem",
      padding: "8px 15px",
    },
  },
};
