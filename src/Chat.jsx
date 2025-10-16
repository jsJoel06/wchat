import React, { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import { FiPhone, FiPhoneOff, FiLoader } from "react-icons/fi";

const socket = io("https://chat-3syl.onrender.com", { transports: ["websocket"] });

export default function Chat() {
  const [usuario, setUsuario] = useState(null);
  const [nombreTemp, setNombreTemp] = useState("");
  const [passwordTemp, setPasswordTemp] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [mensajes, setMensajes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [llamadaEntrante, setLlamadaEntrante] = useState(null);
  const [llamadaActiva, setLlamadaActiva] = useState(false);
  const [llamandoA, setLlamandoA] = useState(null);
  const [audioListo, setAudioListo] = useState(false);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const mensajesEndRef = useRef(null);
  const ringtoneRef = useRef(new Audio("/ringtone.mp3"));

  const scrollToBottom = () =>
    mensajesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  // --- WebRTC functions ---
  const crearPeerConnection = useCallback(
    async (remoteId) => {
      if (peerConnectionRef.current) return peerConnectionRef.current;
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peerConnectionRef.current = pc;

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) =>
          pc.addTrack(track, localStreamRef.current)
        );
      }

      pc.ontrack = (event) => {
        remoteAudioRef.current.srcObject = event.streams[0];
        if (audioListo) remoteAudioRef.current.play().catch(() => {});
      };

      pc.onicecandidate = (event) => {
        if (event.candidate)
          socket.emit("iceCandidate", { to: remoteId, candidate: event.candidate });
      };

      pc.oniceconnectionstatechange = () => {
        if (["disconnected", "failed", "closed"].includes(pc.iceConnectionState)) {
          colgar();
        }
      };

      return pc;
    },
    [audioListo]
  );

  const colgar = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setLlamadaActiva(false);
    setLlamandoA(null);
    setLlamadaEntrante(null);
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

    // Detiene el timbre si está sonando
    ringtoneRef.current.pause();
    ringtoneRef.current.currentTime = 0;
  }, []);

  const iniciarLlamada = useCallback(
    async (remoteId, esQuienLlama) => {
      const pc = await crearPeerConnection(remoteId);
      if (!pc) return;
      if (esQuienLlama) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("ofertaLlamada", { to: remoteId, offer });
      }
    },
    [crearPeerConnection]
  );

  const habilitarAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setAudioListo(true);
      if (peerConnectionRef.current)
        stream.getTracks().forEach((track) =>
          peerConnectionRef.current.addTrack(track, stream)
        );
      if (remoteAudioRef.current) remoteAudioRef.current.play().catch(() => {});
    } catch (err) {
      console.error("No se pudo activar el micrófono:", err);
    }
  };

  // --- Socket.io ---
  useEffect(() => {
    if (!usuario) return;

    socket.emit("loginUsuario", { nombre: usuario.nombre });

    socket.on("loginSuccess", (data) => console.log("Login exitoso:", data));
    socket.on("loginError", (err) => {
      alert(err.mensaje);
      setUsuario(null);
    });

    socket.on("mensaje", (msg) => {
      setMensajes((prev) => [...prev, msg]);
      scrollToBottom();
    });

    socket.on("usuariosConectados", setUsuarios);

    socket.on("llamadaEntrante", ({ de, nombre }) => {
      console.log("📞 Llamada entrante de:", nombre);
      setLlamadaEntrante({ id: de, nombre });

      // Reproduce sonido de llamada
      const ringtone = ringtoneRef.current;
      ringtone.loop = true;
      ringtone.play().catch(() => {});
    });

    socket.on("respuestaLlamada", ({ respuesta }) => {
      setLlamandoA(null);
      if (respuesta) setLlamadaActiva(true);
      else alert("La persona no puede atender la llamada.");
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
      if (peerConnectionRef.current)
        await peerConnectionRef.current.setRemoteDescription(answer);
    });

    socket.on("iceCandidate", ({ candidate }) => {
      if (peerConnectionRef.current)
        peerConnectionRef.current.addIceCandidate(candidate);
    });

    return () => socket.off();
  }, [usuario, crearPeerConnection]);

  // --- UI Handlers ---
  const enviarMensaje = () => {
    if (!mensaje.trim()) return;
    socket.emit("mensaje", { usuario: usuario.nombre, texto: mensaje });
    setMensaje("");
  };

  const llamar = (id, targetName) => {
    if (llamadaActiva || llamandoA) return;
    setLlamandoA(targetName);
    socket.emit("llamada", { de: socket.id, a: id });
    iniciarLlamada(id, true);
  };

  const responderLlamada = async (aceptar) => {
    if (!llamadaEntrante) return;
    const remoteId = llamadaEntrante.id;
    socket.emit("responderLlamada", { de: socket.id, respuesta: aceptar, a: remoteId });

    // Detiene el timbre
    ringtoneRef.current.pause();
    ringtoneRef.current.currentTime = 0;

    setLlamadaEntrante(null);
    if (aceptar) {
      setLlamadaActiva(true);
      await iniciarLlamada(remoteId, false);
    } else colgar();
  };

  const otrosUsuarios = usuarios.filter((u) => u.nombre !== usuario?.nombre);

  // --- Login UI ---
  if (!usuario) {
    return (
      <div style={{ textAlign: "center", marginTop: 50 }}>
        <h2>Ingresa tus datos</h2>
        <input
          type="text"
          value={nombreTemp}
          onChange={(e) => setNombreTemp(e.target.value)}
          placeholder="Nombre"
          style={{ marginBottom: 5 }}
        />
        <input
          type="password"
          value={passwordTemp}
          onChange={(e) => setPasswordTemp(e.target.value)}
          placeholder="Contraseña"
          style={{ marginBottom: 5 }}
        />
        <button
          onClick={async () => {
            if (!nombreTemp.trim() || !passwordTemp.trim()) return;
            try {
              const res = await fetch("https://chat-3syl.onrender.com/registrar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  nombre: nombreTemp.trim(),
                  password: passwordTemp.trim(),
                }),
              });
              const data = await res.json();
              if (res.ok || data.usuario)
                setUsuario(data.usuario || { nombre: nombreTemp.trim() });
              else alert(data.error);
            } catch (err) {
              console.error(err);
              alert("Error al registrar/login");
            }
          }}
        >
          Entrar
        </button>
      </div>
    );
  }

  // --- Chat UI ---
  return (
    <div style={styles.container}>
      <h2 style={styles.header}>Chat JS</h2>
      <div style={styles.chatBox}>
        {mensajes.map((m, i) => (
          <div key={i} style={{ margin: 5, color: m.usuario === usuario.nombre ? "blue" : "black" }}>
            <strong>{m.usuario === usuario.nombre ? "Tú" : m.usuario}: </strong>
            {m.texto}
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

      {!audioListo && (
        <button onClick={habilitarAudio} style={styles.audioButton}>
          Tocar para activar audio 📢
        </button>
      )}

      {/* Popup tipo WhatsApp */}
      {llamadaEntrante && !llamadaActiva && (
        <div style={styles.popupLlamada}>
          <div style={styles.popupContenido}>
            <p style={{ fontSize: 16, fontWeight: "bold" }}>
              📞 {llamadaEntrante.nombre} te está llamando...
            </p>
            <div style={styles.popupBotones}>
              <button onClick={() => responderLlamada(true)} style={styles.btnAceptar}>
                Aceptar
              </button>
              <button onClick={() => responderLlamada(false)} style={styles.btnRechazar}>
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Llamando a alguien */}
      {llamandoA && !llamadaActiva && (
        <div style={styles.llamadaBox}>
          <p><FiLoader className="spinner" /> Llamando a {llamandoA}...</p>
          <button onClick={colgar} style={styles.buttonRechazar}>
            <FiPhoneOff /> Cancelar
          </button>
        </div>
      )}

      {/* Llamada activa */}
      {llamadaActiva && (
        <div style={styles.llamadaBox}>
          <p>🔊 Llamada activa</p>
          <button onClick={colgar} style={styles.buttonRechazar}>
            <FiPhoneOff /> Colgar
          </button>
        </div>
      )}

      <h4>Usuarios conectados:</h4>
      {otrosUsuarios.length > 0 ? (
        otrosUsuarios.map((u) => (
          <div key={u.id} style={styles.userRow}>
            <span>{u.nombre}</span>
            <button
              onClick={() => llamar(u.id, u.nombre)}
              disabled={llamadaActiva || llamandoA || llamadaEntrante}
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
      <style>{globalStyles}</style>
    </div>
  );
}

// --- Estilos ---
const styles = {
  container: {
    maxWidth: 600,
    margin: "20px auto",
    padding: 15,
    fontFamily: "Arial, sans-serif",
    borderRadius: 10,
    boxShadow: "0px 5px 20px rgba(0,0,0,0.2)",
    backgroundColor: "#fff",
  },
  header: { textAlign: "center", marginBottom: 15 },
  chatBox: {
    height: 300,
    overflowY: "auto",
    border: "1px solid #ddd",
    padding: 10,
    marginBottom: 10,
    display: "flex",
    flexDirection: "column",
  },
  inputContainer: { display: "flex", gap: 5, marginBottom: 10, flexWrap: "wrap" },
  input: { flex: 1, padding: 8, borderRadius: 5, border: "1px solid #ccc", minWidth: 0 },
  button: {
    padding: "8px 10px",
    borderRadius: 5,
    backgroundColor: "#4CAF50",
    color: "#fff",
    border: "none",
    cursor: "pointer",
  },
  buttonRechazar: {
    padding: "8px 10px",
    borderRadius: 5,
    backgroundColor: "#f44336",
    color: "#fff",
    border: "none",
    cursor: "pointer",
  },
  llamadaBox: {
    padding: 10,
    border: "1px solid green",
    borderRadius: 5,
    marginBottom: 10,
    backgroundColor: "#f0fff0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
  },
  userRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
    marginBottom: 8,
    padding: 5,
    borderBottom: "1px dotted #eee",
    flexWrap: "wrap",
  },
  callButton: {
    padding: "5px 10px",
    borderRadius: 5,
    backgroundColor: "#2196F3",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  audioButton: {
    marginBottom: 10,
    padding: "8px",
    borderRadius: 5,
    backgroundColor: "#2196F3",
    color: "#fff",
    border: "none",
    cursor: "pointer",
  },
  popupLlamada: {
    position: "fixed",
    bottom: 20,
    right: 20,
    backgroundColor: "#fff",
    border: "1px solid #ccc",
    borderRadius: 15,
    boxShadow: "0 0 15px rgba(0,0,0,0.3)",
    padding: 15,
    zIndex: 1000,
    animation: "slideIn 0.4s ease-out",
  },
  popupContenido: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
  },
  popupBotones: { display: "flex", gap: 10 },
  btnAceptar: {
    backgroundColor: "#25D366",
    color: "#fff",
    border: "none",
    padding: "8px 15px",
    borderRadius: 8,
    cursor: "pointer",
  },
  btnRechazar: {
    backgroundColor: "#f44336",
    color: "#fff",
    border: "none",
    padding: "8px 15px",
    borderRadius: 8,
    cursor: "pointer",
  },
};

const globalStyles = `
  @media (max-width: 600px) {
    .chatBox { height: 250px; }
    input, button { width: 100% !important; margin-bottom: 5px; }
  }
  .spinner { animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes slideIn {
    from { transform: translateY(50px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;
