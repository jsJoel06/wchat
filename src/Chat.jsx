import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import { FiPhone } from "react-icons/fi"; // Icono de llamada

const socket = io("https://chat-3syl.onrender.com", { transports: ["websocket"] });

export default function Chat() {
  const [mensaje, setMensaje] = useState("");
  const [mensajes, setMensajes] = useState([]);
  const [nombre, setNombre] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [llamadaEntrante, setLlamadaEntrante] = useState(null);
  const mensajesEndRef = useRef(null);

  // Pedir nombre solo una vez
  useEffect(() => {
    let user = "";
    while (!user) user = prompt("Ingresa tu nombre:");
    setNombre(user);
    socket.emit("nuevoUsuario", user);
  }, []);

  // Escuchar eventos
  useEffect(() => {
    socket.on("mensaje", (msg) => {
      setMensajes((prev) => [...prev, msg]);
      if (document.hidden && msg.usuario !== nombre) {
        new Notification(`${msg.usuario} dice:`, { body: msg.texto });
      }
      scrollToBottom();
    });

    socket.on("usuariosConectados", (lista) => setUsuarios(lista));

    socket.on("llamadaEntrante", ({ de }) => setLlamadaEntrante(de));

    socket.on("respuestaLlamada", ({ respuesta }) => {
      alert(respuesta ? "Llamada aceptada" : "Llamada rechazada");
    });

    return () => {
      socket.off("mensaje");
      socket.off("usuariosConectados");
      socket.off("llamadaEntrante");
      socket.off("respuestaLlamada");
    };
  }, [nombre]);

  const scrollToBottom = () =>
    mensajesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  const enviarMensaje = () => {
    if (!mensaje.trim()) return;
    socket.emit("mensaje", { usuario: nombre, texto: mensaje });
    setMensaje("");
  };

  const llamar = (id) => {
    socket.emit("llamada", { de: socket.id, a: id });
  };

  const responderLlamada = (aceptar) => {
    socket.emit("responderLlamada", { de: socket.id, respuesta: aceptar });
    setLlamadaEntrante(null);
  };

  const otrosUsuarios = usuarios.filter((u) => u.nombre !== nombre);

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

      {llamadaEntrante && (
        <div style={styles.llamadaBox}>
          <p>{llamadaEntrante} te está llamando</p>
          <button onClick={() => responderLlamada(true)} style={styles.button}>
            Aceptar
          </button>
          <button onClick={() => responderLlamada(false)} style={styles.button}>
            Rechazar
          </button>
        </div>
      )}

      <div style={{ marginTop: "15px" }}>
        <h4>Usuarios conectados:</h4>
        {otrosUsuarios.length === 0 && <p>No hay otros usuarios conectados</p>}
        {otrosUsuarios.map((u) => (
          <div
            key={u.id}
            style={{
              marginBottom: "5px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span>{u.nombre}</span>
            <button
              onClick={() => llamar(u.id)}
              style={{ ...styles.button, display: "flex", alignItems: "center", gap: "5px" }}
            >
              <FiPhone /> Llamar
            </button>
          </div>
        ))}
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
  header: { textAlign: "center", marginBottom: "15px", color: "#333" },
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
  inputContainer: { display: "flex", marginTop: "10px", gap: "10px" },
  input: {
    flex: 1,
    padding: "10px 15px",
    borderRadius: "20px",
    border: "1px solid #ccc",
    outline: "none",
    fontSize: "1rem",
  },
  button: {
    padding: "8px 15px",
    borderRadius: "20px",
    border: "none",
    backgroundColor: "#4CAF50",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "0.9rem",
  },
  llamadaBox: {
    marginTop: "10px",
    padding: "10px",
    border: "1px solid #4CAF50",
    borderRadius: "10px",
    backgroundColor: "#f0fff0",
    textAlign: "center",
  },
};
