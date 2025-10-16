import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

// Conéctate a tu backend de Render
const socket = io("https://chat-3syl.onrender.com", {
  transports: ["websocket"],
});

export default function Chat() {
  const [mensaje, setMensaje] = useState("");
  const [mensajes, setMensajes] = useState([]);
  const mensajesEndRef = useRef(null);

  // Hacer scroll al final
  const scrollToBottom = () => {
    mensajesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    // Recibir mensajes del servidor
    socket.on("mensaje", (msg) => {
      setMensajes((prev) => [...prev, msg]);
      scrollToBottom();
      console.log("Mensaje recibido:", msg); // debug en consola
    });

    return () => socket.disconnect();
  }, []);

  const enviarMensaje = () => {
    if (!mensaje.trim()) return;

    // Mostrar en chat inmediatamente (optimista)
    setMensajes((prev) => [...prev, `Tú: ${mensaje}`]);

    // Enviar al backend
    socket.emit("mensaje", mensaje);

    setMensaje("");
    scrollToBottom();
  };

 

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>Chat JS</h2>
      <div style={styles.chatBox}>
        {mensajes.map((m, i) => (
          <div
            key={i}
            style={{
              ...styles.mensaje,
              alignSelf: m.startsWith("⚡") || m.startsWith("❌") ? "center" : m.startsWith("Tú:") ? "flex-end" : "flex-start",
              backgroundColor: m.startsWith("⚡") || m.startsWith("❌") ? "#f9f9f9" : m.startsWith("Tú:") ? "#4CAF50" : "#f1f0f0",
              color: m.startsWith("⚡") || m.startsWith("❌") ? "#888" : m.startsWith("Tú:") ? "#fff" : "#000",
            }}
          >
            {m}
          </div>
        ))}
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
    maxWidth: "500px",
    margin: "50px auto",
    padding: "20px",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    borderRadius: "10px",
    boxShadow: "0px 5px 20px rgba(0,0,0,0.2)",
    backgroundColor: "#fff",
  },
  header: {
    textAlign: "center",
    marginBottom: "20px",
    color: "#333",
  },
  chatBox: {
    height: "400px",
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
    maxWidth: "70%",
    wordWrap: "break-word",
  },
  inputContainer: {
    display: "flex",
    marginTop: "15px",
  },
  input: {
    flex: 1,
    padding: "10px 15px",
    borderRadius: "20px",
    border: "1px solid #ccc",
    outline: "none",
    marginRight: "10px",
  },
  button: {
    padding: "10px 20px",
    borderRadius: "20px",
    border: "none",
    backgroundColor: "#4CAF50",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "bold",
  },
};
