import React, { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import { FiPhone, FiPhoneOff, FiSend } from "react-icons/fi";

// --- Ajusta URL si tu backend está en otra ruta ---
const socket = io("https://chat-3syl.onrender.com", {
  transports: ["websocket"],
});

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
  const [duracionLlamada, setDuracionLlamada] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const mensajesEndRef = useRef(null);
  const ringtoneRef = useRef(null);
  const intervaloLlamadaRef = useRef(null);

  useEffect(() => {
    ringtoneRef.current = new Audio("/ringtone.mp3");
    ringtoneRef.current.preload = "auto";
    ringtoneRef.current.loop = true;

    socket.on("mensaje", (msg) => setMensajes((m) => [...m, msg]));

    socket.on("usuariosConectados", (lista) => setUsuarios(lista));

    socket.on("llamadaEntrante", ({ de, nombre }) => {
      setLlamadaEntrante({ de, nombre });
      ringtoneRef.current.play().catch(() => {});
    });

    socket.on("ofertaLlamada", async ({ from, offer }) => {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socket.emit("respuestaWebRTC", { to: from, answer });
    });

    socket.on("respuestaWebRTC", async ({ answer }) => {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("iceCandidate", ({ candidate }) => {
      if (peerConnectionRef.current && candidate) {
        peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    return () => {
      socket.off("mensaje");
      socket.off("usuariosConectados");
      socket.off("llamadaEntrante");
      socket.off("ofertaLlamada");
      socket.off("respuestaWebRTC");
      socket.off("iceCandidate");
    };
  }, []);

  const scrollToBottom = () =>
    mensajesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  const formatearTiempo = (seg) => {
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    const s = seg % 60;
    return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
  };

  const iniciarCronometro = () => {
    if (!intervaloLlamadaRef.current) {
      setDuracionLlamada(0);
      intervaloLlamadaRef.current = setInterval(
        () => setDuracionLlamada((p) => p + 1),
        1000
      );
    }
  };
  const detenerCronometro = () => {
    if (intervaloLlamadaRef.current) clearInterval(intervaloLlamadaRef.current);
    intervaloLlamadaRef.current = null;
    setDuracionLlamada(0);
  };

  const habilitarAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setAudioListo(true);
      if (peerConnectionRef.current)
        stream.getTracks().forEach((t) => peerConnectionRef.current.addTrack(t, stream));
      if (remoteAudioRef.current) remoteAudioRef.current.play().catch(() => {});
    } catch (err) {
      console.error("No se pudo activar micrófono:", err);
      alert("No se pudo acceder al micrófono. Revisa los permisos.");
    }
  };

  const iniciarLlamada = async (usuarioDestino) => {
    if (!audioListo) await habilitarAudio();

    const pc = new RTCPeerConnection();
    peerConnectionRef.current = pc;

    // Agregar audio local
    localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));

    // Recibir audio remoto
    pc.ontrack = (event) => {
      remoteAudioRef.current.srcObject = event.streams[0];
    };

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate)
        socket.emit("iceCandidate", { to: usuarioDestino.id, candidate: event.candidate });
    };

    setLlamandoA(usuarioDestino);
    setLlamadaActiva(true);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("ofertaLlamada", { to: usuarioDestino.id, offer });
  };

  const aceptarLlamada = async () => {
    if (!audioListo) await habilitarAudio();

    const pc = new RTCPeerConnection();
    peerConnectionRef.current = pc;

    localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));

    pc.ontrack = (event) => {
      remoteAudioRef.current.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
      if (event.candidate)
        socket.emit("iceCandidate", { to: llamadaEntrante.de, candidate: event.candidate });
    };

    setLlamandoA({ id: llamadaEntrante.de });
    setLlamadaActiva(true);
    setLlamadaEntrante(null);

    iniciarCronometro();
  };

  const colgar = useCallback(() => {
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    peerConnectionRef.current = null;
    if (localStreamRef.current)
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLlamadaActiva(false);
    setLlamandoA(null);
    setLlamadaEntrante(null);
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
    detenerCronometro();
  }, []);

  const enviarMensaje = () => {
    if (!mensaje.trim()) return;
    socket.emit("mensaje", { usuario: usuario.nombre, texto: mensaje });
    setMensaje("");
  };

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  // ----------- Login UI ----------
  if (!usuario) {
    return (
      <div style={UI.loginBackground}>
        <div style={UI.loginCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={UI.logoCircle}>💬</div>
            <div>
              <h1 style={{ margin: 0 }}>Chat JS</h1>
              <small style={{ color: "#666" }}>Inicia sesión o regístrate</small>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <label style={UI.label}>Nombre</label>
            <input
              value={nombreTemp}
              onChange={(e) => setNombreTemp(e.target.value)}
              placeholder="Tu nombre visible"
              style={UI.input}
            />
            <label style={UI.label}>Contraseña</label>
            <input
              type="password"
              value={passwordTemp}
              onChange={(e) => setPasswordTemp(e.target.value)}
              placeholder="Contraseña"
              style={UI.input}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                style={UI.btnPrimary}
                onClick={() => {
                  setUsuario({ nombre: nombreTemp.trim() });
                  socket.emit("loginUsuario", { nombre: nombreTemp, password: passwordTemp });
                }}
              >
                Entrar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ----------- Chat principal UI ----------
  return (
    <div style={UI.app}>
      {/* Sidebar */}
      {sidebarOpen && (
        <aside style={UI.sidebar}>
          <div style={UI.sideHeader}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={UI.avatar}>{usuario.nombre.charAt(0).toUpperCase()}</div>
              <div>
                <div style={{ fontWeight: 700 }}>{usuario.nombre}</div>
                <small style={{ color: "#bdbdbd" }}>En línea</small>
              </div>
            </div>
            <button style={UI.btnSmall} onClick={toggleSidebar}>
              Cerrar
            </button>
          </div>

          <div style={UI.userList}>
            {usuarios.map((u) => (
              <div key={u.id} style={UI.userRow}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={UI.avatarSmall}>{u.nombre.charAt(0).toUpperCase()}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{u.nombre}</div>
                  </div>
                </div>
                <button
                  onClick={() => iniciarLlamada(u)}
                  style={UI.callBtn}
                >
                  <FiPhone />
                </button>
              </div>
            ))}
          </div>
        </aside>
      )}

      {!sidebarOpen && (
        <button style={UI.openSidebarBtn} onClick={toggleSidebar}>
          ☰
        </button>
      )}

      <main style={UI.main}>
        <div style={UI.chatHeader}>
          <div style={{ fontWeight: 700 }}>Sala pública</div>
          <div style={{ color: "#888" }}>
            {llamadaActiva
              ? `Llamada: ${formatearTiempo(duracionLlamada)}`
              : "Estado: disponible"}
          </div>
        </div>

        <div style={UI.messagesWrapper}>
          {mensajes.map((m, i) => {
            const mine = m.usuario === usuario.nombre;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: mine ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    ...UI.messageBubble,
                    background: mine ? "#4CAF50" : "#ECEFF1",
                    color: mine ? "#fff" : "#111",
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                    {mine ? "Tú" : m.usuario}
                  </div>
                  <div>{m.texto}</div>
                </div>
              </div>
            );
          })}
          <div ref={mensajesEndRef} />
        </div>

        <div style={UI.composer}>
          <input
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviarMensaje()}
            placeholder="Escribe un mensaje..."
            style={UI.composerInput}
          />
          <button onClick={enviarMensaje} style={UI.sendBtn}>
            <FiSend />
          </button>
        </div>
      </main>

      <audio ref={remoteAudioRef} autoPlay />

      {llamadaEntrante && !llamadaActiva && (
        <div style={UI.incoming}>
          <div style={UI.incomingCard}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              {llamadaEntrante.nombre}
            </div>
            <div style={{ marginBottom: 12, color: "#666" }}>Te está llamando</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={UI.acceptBtn} onClick={aceptarLlamada}>
                <FiPhone /> Aceptar
              </button>
              <button style={UI.rejectBtn} onClick={colgar}>
                <FiPhoneOff /> Rechazar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================
// ESTILOS (los mismos que tenías)
// ============================
const UI = {
  app: {
    display: "flex",
    height: "100vh",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  sidebar: {
    width: 260,
    background: "#0f1724",
    color: "#fff",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    position: "fixed",
    top: 0,
    bottom: 0,
    zIndex: 1000,
    transition: "transform 0.3s ease",
  },
  openSidebarBtn: {
    position: "fixed",
    left: 10,
    top: 10,
    zIndex: 1100,
    background: "#4f46e5",
    color: "#fff",
    border: "none",
    padding: "10px 14px",
    borderRadius: 8,
    cursor: "pointer",
  },
  sideHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 8,
    background: "#1f2937",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
  },
  btnSmall: {
    background: "#111827",
    color: "#fff",
    border: "none",
    padding: "6px 10px",
    borderRadius: 6,
    cursor: "pointer",
  },
  userList: {
    overflowY: "auto",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  userRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
    background: "#081226",
  },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 6,
    background: "#111827",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
  },
  callBtn: {
    background: "#10b981",
    border: "none",
    padding: "6px 8px",
    borderRadius: 6,
    color: "#fff",
    cursor: "pointer",
  },

  main: {
    flex: 1,
    marginLeft: 0,
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    transition: "margin-left 0.3s ease",
  },
  chatHeader: {
    padding: 12,
    borderBottom: "1px solid #e6e9ee",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#fff",
  },
  messagesWrapper: {
    flex: 1,
    overflowY: "auto",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  messageBubble: {
    maxWidth: "70%",
    padding: 10,
    borderRadius: 10,
    boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
  },
  composer: {
    display: "flex",
    padding: 10,
    gap: 6,
    borderTop: "1px solid #e6e9ee",
    background: "#fff",
  },
  composerInput: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    border: "1px solid #e6e6e6",
  },
  sendBtn: {
    background: "#4f46e5",
    border: "none",
    color: "#fff",
    padding: "8px 10px",
    borderRadius: 8,
    cursor: "pointer",
  },

  incoming: { position: "fixed", right: 10, bottom: 10, zIndex: 1200 },
  incomingCard: {
    background: "#fff",
    padding: 12,
    borderRadius: 12,
    boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
    minWidth: 200,
    textAlign: "center",
  },
  acceptBtn: {
    background: "#22c55e",
    color: "#fff",
    border: "none",
    padding: "6px 10px",
    borderRadius: 6,
    cursor: "pointer",
  },
  rejectBtn: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    padding: "6px 10px",
    borderRadius: 6,
    cursor: "pointer",
  },

  loginBackground: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "linear-gradient(135deg,#4f46e5 0%, #06b6d4 100%)",
    padding: 20,
  },
  loginCard: {
    width: "100%",
    maxWidth: 400,
    background: "#fff",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
  },
  logoCircle: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "#eef2ff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
  },
  label: {
    display: "block",
    marginTop: 6,
    marginBottom: 4,
    color: "#444",
    fontSize: 13,
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #e6e6e6",
    marginBottom: 8,
    outline: "none",
    fontSize: 14,
  },
  btnPrimary: {
    flex: 1,
    background: "linear-gradient(90deg,#4f46e5,#06b6d4)",
    color: "#fff",
    border: "none",
    padding: 10,
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 600,
  },

  // ==== MEDIA QUERIES ====
  '@media(max-width: 768px)': {
    sidebar: { transform: 'translateX(-100%)', position: 'fixed', zIndex: 1000 },
    main: { marginLeft: 0 },
    openSidebarBtn: { display: 'block' },
  },
  '@media(min-width: 769px)': {
    sidebar: { transform: 'translateX(0)' },
    openSidebarBtn: { display: 'none' },
  },
};
