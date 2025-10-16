import React, { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import { FiPhone, FiPhoneOff, FiLoader } from "react-icons/fi"; // Added FiLoader

const socket = io("https://chat-3syl.onrender.com", { transports: ["websocket"] });

export default function Chat() {
  const [mensaje, setMensaje] = useState("");
  const [mensajes, setMensajes] = useState([]);
  const [nombre, setNombre] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [llamadaEntrante, setLlamadaEntrante] = useState(null);
  const [llamadaActiva, setLlamadaActiva] = useState(false);
  const [llamandoA, setLlamandoA] = useState(null); // New state to track who is being called
  
  const peerConnectionRef = useRef(null); // Use ref for mutable peerConnection
  const [localStream, setLocalStream] = useState(null);
  const remoteAudioRef = useRef(null);
  const mensajesEndRef = useRef(null);

  const scrollToBottom = () => mensajesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  // --- WebRTC Functions ---
  const crearPeerConnection = useCallback(async (remoteId) => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peerConnectionRef.current = pc;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setLocalStream(stream);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => (remoteAudioRef.current.srcObject = event.streams[0]);

      pc.onicecandidate = (event) => {
        if (event.candidate) socket.emit("iceCandidate", { to: remoteId, candidate: event.candidate });
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
          colgar();
        }
      };

      return pc;
    } catch (error) {
      console.error("Error al obtener el stream de audio:", error);
      peerConnectionRef.current = null;
      return null;
    }
  }, []);

  const colgar = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    setLlamadaActiva(false);
    setLlamandoA(null);
    setLlamadaEntrante(null);
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    // Notify the other user that the call has ended (optional: depends on server logic)
    // socket.emit("colgarLlamada", { to: targetId }); 
  }, [localStream]);

  const iniciarLlamada = useCallback(async (remoteId, esQuienLlama) => {
    const pc = await crearPeerConnection(remoteId);
    if (!pc) return;

    if (esQuienLlama) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("ofertaLlamada", { to: remoteId, offer });
    }
  }, [crearPeerConnection]);

  // --- Socket.io and Lifecycle Effects ---
  useEffect(() => {
    // Pedir nombre
    let user = "";
    while (!user) user = prompt("Ingresa tu nombre:");
    setNombre(user);
    socket.emit("nuevoUsuario", user);

    if (Notification.permission !== "granted") Notification.requestPermission();

    // Event handlers
    socket.on("mensaje", (msg) => {
      setMensajes((prev) => [...prev, msg]);
      scrollToBottom();
    });
    socket.on("usuariosConectados", setUsuarios);

    socket.on("llamadaEntrante", ({ de, nombre }) => {
      // Only set incoming call if not already active
      if (!llamadaActiva && !llamandoA) {
        setLlamadaEntrante({ id: de, nombre });
      } else {
        // Send a busy signal back (optional)
        socket.emit("responderLlamada", { de: socket.id, respuesta: false, ocupado: true });
      }
    });

    socket.on("respuestaLlamada", async ({ respuesta, from }) => {
      setLlamandoA(null); // Calling attempt finished
      if (respuesta) {
        setLlamadaActiva(true);
      }
    });

    socket.on("ofertaLlamada", async ({ from, offer }) => {
      const pc = await crearPeerConnection(from);
      if (!pc) return;
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("respuestaWebRTC", { to: from, answer });
    });

    socket.on("respuestaWebRTC", async ({ answer }) => {
      if (peerConnectionRef.current) await peerConnectionRef.current.setRemoteDescription(answer);
    });

    socket.on("iceCandidate", ({ candidate }) => {
      if (peerConnectionRef.current) peerConnectionRef.current.addIceCandidate(candidate);
    });

    return () => socket.off();
  }, [llamadaActiva, llamandoA, crearPeerConnection, colgar]); // Depend on call states

  // --- UI Handlers ---
  const enviarMensaje = () => {
    if (!mensaje.trim()) return;
    socket.emit("mensaje", { usuario: nombre, texto: mensaje });
    setMensaje("");
  };

  const llamar = (id, targetName) => {
    if (llamadaActiva || llamadaEntrante) return; // Cannot call if busy
    setLlamandoA(targetName);
    socket.emit("llamada", { de: socket.id, a: id });
    // This side is the one calling, so start the WebRTC setup
    iniciarLlamada(id, true);
  };

  const responderLlamada = async (aceptar) => {
    const remoteId = llamadaEntrante.id;
    socket.emit("responderLlamada", { de: socket.id, respuesta: aceptar, a: remoteId });
    setLlamadaEntrante(null);
    
    if (aceptar) {
      setLlamadaActiva(true);
      await iniciarLlamada(remoteId, false); // Receiving side does not send offer
    } else {
      colgar();
    }
  };

  const otrosUsuarios = usuarios.filter((u) => u.nombre !== nombre);

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>Chat JS</h2>
      {/* --- Chat Box --- */}
      <div style={styles.chatBox}>
        {mensajes.map((m, i) => (
          <div key={i} style={{ margin: 5, color: m.usuario === nombre ? 'blue' : 'black' }}>
            <strong>{m.usuario === nombre ? 'Tú' : m.usuario}: </strong> {m.texto}
          </div>
        ))}
        <div ref={mensajesEndRef} />
      </div>

      {/* --- Message Input --- */}
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

      {/* --- Calling UI --- */}
      {llamadaEntrante && !llamadaActiva && (
        <div style={styles.llamadaBox}>
          <p>📞 {llamadaEntrante.nombre} te está llamando</p>
          <button onClick={() => responderLlamada(true)} style={styles.button}>Aceptar</button>
          <button onClick={() => responderLlamada(false)} style={styles.buttonRechazar}>Rechazar</button>
        </div>
      )}

      {llamandoA && !llamadaActiva && (
        <div style={styles.llamadaBox}>
          <p><FiLoader className="spinner" /> Llamando a {llamandoA}...</p>
          <button onClick={colgar} style={styles.buttonRechazar}><FiPhoneOff /> Cancelar</button>
        </div>
      )}

      {llamadaActiva && (
        <div style={styles.llamadaBox}>
          <p>🔊 Llamada activa</p>
          <button onClick={colgar} style={styles.buttonRechazar}><FiPhoneOff /> Colgar</button>
        </div>
      )}

      {/* --- Connected Users --- */}
      <h4>Usuarios conectados:</h4>
      {otrosUsuarios.length > 0 ? (
        otrosUsuarios.map((u) => (
          <div key={u.id} style={styles.userRow}>
            <span>{u.nombre}</span>
            <button
              onClick={() => llamar(u.id, u.nombre)}
              disabled={llamadaActiva || llamadaEntrante || llamandoA}
              style={styles.callButton}
            >
              <FiPhone style={{ marginRight: 5 }} /> Llamar
            </button>
          </div>
        ))
      ) : (
        <p>No hay otros usuarios conectados.</p>
      )}

      <audio ref={remoteAudioRef} autoPlay />

      {/* Simple style for the spinner and a small global style for the call button */}
      <style>{`
        .spinner {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: { maxWidth: 600, margin: "20px auto", padding: 15, fontFamily: "Arial", borderRadius: 10, boxShadow: "0px 5px 20px rgba(0,0,0,0.2)", backgroundColor: "#fff" },
  header: { textAlign: "center", marginBottom: 15 },
  chatBox: { height: 300, overflowY: "auto", border: "1px solid #ddd", padding: 10, marginBottom: 10, display: 'flex', flexDirection: 'column' },
  inputContainer: { display: "flex", gap: 5, marginBottom: 10 },
  input: { flex: 1, padding: 8, borderRadius: 5, border: "1px solid #ccc" },
  button: { padding: "8px 10px", borderRadius: 5, backgroundColor: "#4CAF50", color: "#fff", border: "none", cursor: "pointer", transition: 'background-color 0.3s' },
  buttonRechazar: { padding: "8px 10px", borderRadius: 5, backgroundColor: "#f44336", color: "#fff", border: "none", cursor: "pointer", transition: 'background-color 0.3s' },
  llamadaBox: { padding: 10, border: "1px solid green", borderRadius: 5, marginBottom: 10, backgroundColor: "#f0fff0", display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  userRow: { display: "flex", alignItems: "center", justifyContent: 'space-between', gap: 5, marginBottom: 8, padding: 5, borderBottom: '1px dotted #eee' },
  callButton: { padding: "5px 10px", borderRadius: 5, backgroundColor: "#2196F3", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", transition: 'background-color 0.3s' },
};