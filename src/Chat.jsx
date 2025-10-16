import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import { FiPhone, FiPhoneOff } from "react-icons/fi";

const socket = io("http://localhost:3001", { transports: ["websocket"] });

export default function Chat() {
  const [mensaje, setMensaje] = useState("");
  const [mensajes, setMensajes] = useState([]);
  const [nombre, setNombre] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [llamadaEntrante, setLlamadaEntrante] = useState(null);
  const [llamadaActiva, setLlamadaActiva] = useState(false);
  const [peerConnection, setPeerConnection] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const remoteAudioRef = useRef(null);
  const mensajesEndRef = useRef(null);

  useEffect(() => {
    // Pedir nombre
    let user = "";
    while (!user) user = prompt("Ingresa tu nombre:");
    setNombre(user);
    socket.emit("nuevoUsuario", user);

    if (Notification.permission !== "granted") Notification.requestPermission();

    // Eventos
    socket.on("mensaje", (msg) => {
      setMensajes((prev) => [...prev, msg]);
      scrollToBottom();
    });
    socket.on("usuariosConectados", setUsuarios);

    // Llamada entrante
    socket.on("llamadaEntrante", ({ de, nombre }) => setLlamadaEntrante({ id: de, nombre }));

    // Respuesta de llamada
    socket.on("respuestaLlamada", async ({ respuesta, from }) => {
      setLlamadaActiva(respuesta);
      setLlamadaEntrante(null);
      if (respuesta) await iniciarLlamada(from, true);
    });

    // WebRTC señalización
    socket.on("ofertaLlamada", async ({ from, offer }) => {
      if (!peerConnection) await crearPeerConnection(from);
      await peerConnection.setRemoteDescription(offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("respuestaWebRTC", { to: from, answer });
    });

    socket.on("respuestaWebRTC", async ({ answer }) => {
      if (peerConnection) await peerConnection.setRemoteDescription(answer);
    });

    socket.on("iceCandidate", ({ candidate }) => {
      if (peerConnection) peerConnection.addIceCandidate(candidate);
    });

    return () => socket.off();
  }, [peerConnection]);

  const scrollToBottom = () => mensajesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  const enviarMensaje = () => {
    if (!mensaje.trim()) return;
    socket.emit("mensaje", { usuario: nombre, texto: mensaje });
    setMensaje("");
  };

  const crearPeerConnection = async (remoteId) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    setPeerConnection(pc);

    // Stream local
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setLocalStream(stream);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // Audio remoto
    pc.ontrack = (event) => (remoteAudioRef.current.srcObject = event.streams[0]);

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit("iceCandidate", { to: remoteId, candidate: event.candidate });
    };

    return pc;
  };

  const iniciarLlamada = async (remoteId, esQuienLlama) => {
    const pc = await crearPeerConnection(remoteId);
    if (esQuienLlama) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("ofertaLlamada", { to: remoteId, offer });
    }
  };

  const llamar = (id) => socket.emit("llamada", { de: socket.id, a: id });

  const responderLlamada = async (aceptar) => {
    socket.emit("responderLlamada", { de: socket.id, respuesta: aceptar });
    setLlamadaActiva(aceptar);
    setLlamadaEntrante(null);
    if (aceptar) await iniciarLlamada(llamadaEntrante.id, false);
  };

  const colgar = () => {
    peerConnection?.close();
    setPeerConnection(null);
    setLlamadaActiva(false);
    setLocalStream(null);
    remoteAudioRef.current.srcObject = null;
  };

  const otrosUsuarios = usuarios.filter((u) => u.nombre !== nombre);

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>Chat JS</h2>
      <div style={styles.chatBox}>
        {mensajes.map((m, i) => (
          <div key={i} style={{ margin: 5 }}>
            <strong>{m.usuario}: </strong> {m.texto}
          </div>
        ))}
        <div ref={mensajesEndRef} />
      </div>

      <div style={styles.inputContainer}>
        <input
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          placeholder="Escribe tu mensaje..."
          onKeyDown={(e) => e.key === "Enter" && enviarMensaje()}
          style={styles.input}
        />
        <button onClick={enviarMensaje} style={styles.button}>Enviar</button>
      </div>

      {llamadaEntrante && !llamadaActiva && (
        <div style={styles.llamadaBox}>
          <p>📞 {llamadaEntrante.nombre} te está llamando</p>
          <button onClick={() => responderLlamada(true)} style={styles.button}>Aceptar</button>
          <button onClick={() => responderLlamada(false)} style={styles.button}>Rechazar</button>
        </div>
      )}

      {llamadaActiva && (
        <div style={styles.llamadaBox}>
          <p>🔊 Llamada activa</p>
          <button onClick={colgar} style={styles.button}><FiPhoneOff /> Colgar</button>
        </div>
      )}

      <h4>Usuarios conectados:</h4>
      {otrosUsuarios.map((u) => (
        <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
          <span>{u.nombre}</span>
          <button onClick={() => llamar(u.id)} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <FiPhone /> Llamar
          </button>
        </div>
      ))}

      <audio ref={remoteAudioRef} autoPlay />
    </div>
  );
}

const styles = {
  container: { maxWidth: 600, margin: "20px auto", padding: 15, fontFamily: "Arial", borderRadius: 10, boxShadow: "0px 5px 20px rgba(0,0,0,0.2)", backgroundColor: "#fff" },
  header: { textAlign: "center", marginBottom: 15 },
  chatBox: { height: 300, overflowY: "auto", border: "1px solid #ddd", padding: 10, marginBottom: 10 },
  inputContainer: { display: "flex", gap: 5, marginBottom: 10 },
  input: { flex: 1, padding: 8, borderRadius: 5, border: "1px solid #ccc" },
  button: { padding: "5px 10px", borderRadius: 5, backgroundColor: "#4CAF50", color: "#fff", border: "none", cursor: "pointer" },
  llamadaBox: { padding: 10, border: "1px solid green", borderRadius: 5, marginBottom: 10, backgroundColor: "#f0fff0" },
};
