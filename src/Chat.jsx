import React, { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import { FiPhone, FiPhoneOff, FiLoader, FiSend, FiUser } from "react-icons/fi";

// --- Ajusta URL si tu backend está en otra ruta ---
const socket = io("https://chat-3syl.onrender.com", { transports: ["websocket"] });

export default function Chat() {
  // --- Estado de usuario / UI ---
  const [usuario, setUsuario] = useState(null); // { id?, nombre, ... }
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

  // --- Refs para WebRTC / audio / timers ---
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const mensajesEndRef = useRef(null);
  const ringtoneRef = useRef(null);
  const intervaloLlamadaRef = useRef(null);

  // Inicializar ringtone (asegúrate de poner /public/ringtone.mp3 en tu proyecto)
  useEffect(() => {
    ringtoneRef.current = new Audio("/ringtone.mp3");
    ringtoneRef.current.preload = "auto";
    ringtoneRef.current.loop = true;
  }, []);

  const scrollToBottom = () => mensajesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  const formatearTiempo = (segundos) => {
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = segundos % 60;
    const arr = [h, m, s].map((v) => v.toString().padStart(2, "0"));
    return arr.join(":");
  };

  // -------------------------------------------------------------------
  // -------------------- WebRTC / Peer Connection ----------------------
  // -------------------------------------------------------------------
  const crearPeerConnection = useCallback(
    async (remoteId) => {
      if (peerConnectionRef.current) return peerConnectionRef.current;

      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peerConnectionRef.current = pc;

      // si ya hay stream local, agrégalo
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
      }

      pc.ontrack = (event) => {
        remoteAudioRef.current.srcObject = event.streams[0];
        if (audioListo) remoteAudioRef.current.play().catch(() => {});
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("iceCandidate", { to: remoteId, candidate: event.candidate });
        }
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

  // -------------------------------------------------------------------
  // --------------------- Cronómetro llamada ---------------------------
  // -------------------------------------------------------------------
  const iniciarCronometro = () => {
    if (!intervaloLlamadaRef.current) {
      setDuracionLlamada(0);
      intervaloLlamadaRef.current = setInterval(() => {
        setDuracionLlamada((prev) => prev + 1);
      }, 1000);
    }
  };
  const detenerCronometro = () => {
    if (intervaloLlamadaRef.current) {
      clearInterval(intervaloLlamadaRef.current);
      intervaloLlamadaRef.current = null;
    }
    setDuracionLlamada(0);
  };

  // -------------------------------------------------------------------
  // ---------------------------- Colgar --------------------------------
  // -------------------------------------------------------------------
  const colgar = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setLlamadaActiva(false);
    setLlamandoA(null);
    setLlamadaEntrante(null);
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

    // detener timbre
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
    detenerCronometro();
  }, []);

  // -------------------------------------------------------------------
  // -------------------------- Iniciar llamada -------------------------
  // -------------------------------------------------------------------
  const iniciarLlamada = useCallback(
    async (remoteId, esQuienLlama) => {
      const pc = await crearPeerConnection(remoteId);
      if (!pc) return;
      if (esQuienLlama) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("ofertaLlamada", { to: remoteId, offer });
      }
      // Si el otro responde, se activará cronómetro en respuestaLlamada
      // pero el que llama también puede iniciar el cronómetro al aceptar la respuesta
    },
    [crearPeerConnection]
  );

  // -------------------------------------------------------------------
  // ----------------------- Activar micrófono (iOS) --------------------
  // -------------------------------------------------------------------
  const habilitarAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setAudioListo(true);
      if (peerConnectionRef.current) stream.getTracks().forEach((t) => peerConnectionRef.current.addTrack(t, stream));
      if (remoteAudioRef.current) remoteAudioRef.current.play().catch(() => {});
    } catch (err) {
      console.error("No se pudo activar micrófono:", err);
      alert("No se pudo acceder al micrófono. Revisa los permisos.");
    }
  };

  // -------------------------------------------------------------------
  // --------------------------- Sockets --------------------------------
  // -------------------------------------------------------------------
  useEffect(() => {
    // eventos que siempre queremos escuchar (aunque aun no logueado) podrían ir aquí.
    return () => {
      socket.off();
    };
  }, []);

  useEffect(() => {
    if (!usuario) return;

    // enviar login al servidor
    socket.emit("loginUsuario", { nombre: usuario.nombre });

    socket.on("loginSuccess", (data) => {
      console.log("Login exitoso:", data);
    });

    socket.on("loginError", (err) => {
      console.error("LoginError:", err);
      alert(err.mensaje || "Error login");
      setUsuario(null);
    });

    socket.on("mensaje", (msg) => {
      setMensajes((prev) => [...prev, msg]);
      scrollToBottom();
    });

    socket.on("usuariosConectados", (list) => {
      setUsuarios(list || []);
    });

    // llamada entrante: show popup + ringtone
    socket.on("llamadaEntrante", ({ de, nombre }) => {
      console.log("Llamada entrante de:", nombre, de);
      setLlamadaEntrante({ id: de, nombre });
      if (ringtoneRef.current) {
        ringtoneRef.current.loop = true;
        ringtoneRef.current.play().catch(() => {});
      }
    });

    // respuesta al intento de llamada (ok / ocupado / rechazado)
    socket.on("respuestaLlamada", ({ respuesta }) => {
      setLlamandoA(null);
      if (respuesta) {
        setLlamadaActiva(true);
        iniciarCronometro();
      } else {
        alert("No fue posible establecer la llamada (usuario ocupado o rechazó).");
      }
    });

    // oferta desde remoto (como receptor)
    socket.on("ofertaLlamada", async ({ from, offer }) => {
      const pc = await crearPeerConnection(from);
      if (!pc) return;
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("respuestaWebRTC", { to: from, answer });
    });

    // respuesta con answer (quien llamó recibe)
    socket.on("respuestaWebRTC", async ({ answer }) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(answer);
      }
    });

    // candidatos ICE
    socket.on("iceCandidate", ({ candidate }) => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.addIceCandidate(candidate).catch((e) => {
          console.warn("addIceCandidate error:", e);
        });
      }
    });

    return () => {
      socket.off("mensaje");
      socket.off("usuariosConectados");
      socket.off("llamadaEntrante");
      socket.off("respuestaLlamada");
      socket.off("ofertaLlamada");
      socket.off("respuestaWebRTC");
      socket.off("iceCandidate");
      socket.off("loginSuccess");
      socket.off("loginError");
    };
  }, [usuario, crearPeerConnection]);

  // -------------------------------------------------------------------
  // --------------------------- UI Handlers ----------------------------
  // -------------------------------------------------------------------
  const enviarMensaje = () => {
    if (!mensaje.trim()) return;
    socket.emit("mensaje", { usuario: usuario.nombre, texto: mensaje });
    setMensaje("");
  };

  const llamar = (id, targetName) => {
    if (llamadaActiva || llamandoA) return;
    setLlamandoA(targetName);
    // envía petición de llamada por socket (servidor debe reenviar al socket id)
    socket.emit("llamada", { de: socket.id, a: id });
    iniciarLlamada(id, true);
  };

  const responderLlamada = async (aceptar) => {
    if (!llamadaEntrante) return;
    const remoteId = llamadaEntrante.id;

    socket.emit("responderLlamada", { de: socket.id, respuesta: aceptar, a: remoteId });

    // detener ringtone
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }

    setLlamadaEntrante(null);

    if (aceptar) {
      setLlamadaActiva(true);
      iniciarCronometro();
      await iniciarLlamada(remoteId, false); // receptor crea answer en server->ofertaLlamada handler
    } else {
      colgar();
    }
  };

  // -------------------------------------------------------------------
  // -------------------------------- UI -------------------------------
  // -------------------------------------------------------------------
  // Si no está logueado -> tarjeta de login con diseño
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
              placeholder="Contraseña (puedes usar cualquiera)"
              style={UI.input}
            />

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                style={UI.btnPrimary}
                onClick={async () => {
                  if (!nombreTemp.trim() || !passwordTemp.trim()) return alert("Completa ambos campos");
                  try {
                    // Llamada para registrar / crear usuario
                    const res = await fetch("https://chat-3syl.onrender.com/registrar", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ nombre: nombreTemp.trim(), password: passwordTemp.trim() }),
                    });
                    const data = await res.json();
                    if (res.ok || data.usuario) {
                      setUsuario(data.usuario || { nombre: nombreTemp.trim() });
                    } else {
                      alert(data.error || "Error en servidor");
                    }
                  } catch (err) {
                    console.error(err);
                    alert("Error al conectar con el servidor");
                  }
                }}
              >
                Entrar / Crear cuenta
              </button>

              <button
                style={UI.btnSecondary}
                onClick={() => {
                  // login local rápido (sin backend) — opcional
                  if (!nombreTemp.trim()) return alert("Escribe un nombre para entrar como invitado");
                  setUsuario({ nombre: nombreTemp.trim() });
                }}
              >
                Entrar como invitado
              </button>
            </div>

            <small style={{ color: "#777", display: "block", marginTop: 12 }}>
              Consejo: en pruebas puedes usar contraseñas simples. En producción añade hashing y validación.
            </small>
          </div>
        </div>
      </div>
    );
  }

  // UI principal cuando está logueado
  return (
    <div style={UI.app}>
      <aside style={UI.sidebar}>
        <div style={UI.sideHeader}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={UI.avatar}>{usuario.nombre.charAt(0).toUpperCase()}</div>
            <div>
              <div style={{ fontWeight: 700 }}>{usuario.nombre}</div>
              <small style={{ color: "#bdbdbd" }}>En línea</small>
            </div>
          </div>
          <button style={UI.btnSmall} onClick={() => { setUsuario(null); socket.emit("logout"); }}>
            Logout
          </button>
        </div>

        <div style={UI.userList}>
          {usuarios.length === 0 && <div style={{ color: "#9e9e9e", padding: 8 }}>No hay usuarios conectados</div>}
          {usuarios.map((u) => (
            <div key={u.id} style={UI.userRow}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={UI.avatarSmall}>{u.nombre.charAt(0).toUpperCase()}</div>
                <div>
                  <div style={{ fontWeight: 600 }}>{u.nombre}</div>
                  <small style={{ color: "#9e9e9e" }}>{u.id}</small>
                </div>
              </div>
              <button
                onClick={() => llamar(u.id, u.nombre)}
                style={UI.callBtn}
                disabled={llamadaActiva || llamandoA || llamadaEntrante}
                title={`Llamar a ${u.nombre}`}
              >
                <FiPhone />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <main style={UI.main}>
        <div style={UI.chatHeader}>
          <div style={{ fontWeight: 700 }}>Sala pública</div>
          <div style={{ color: "#888" }}>
            {llamadaActiva ? `Llamada: ${formatearTiempo(duracionLlamada)}` : "Estado: disponible"}
          </div>
        </div>

        <div style={UI.messagesWrapper}>
          {mensajes.map((m, i) => {
            const mine = m.usuario === usuario.nombre;
            return (
              <div key={i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                <div style={{ ...UI.messageBubble, background: mine ? "#4CAF50" : "#ECEFF1", color: mine ? "#fff" : "#111" }}>
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
          <button onClick={enviarMensaje} style={UI.sendBtn}><FiSend /></button>
        </div>
      </main>

      {/* audio element to play remote */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* llamada entrante popup */}
      {llamadaEntrante && !llamadaActiva && (
        <div style={UI.incoming}>
          <div style={UI.incomingCard}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{llamadaEntrante.nombre}</div>
            <div style={{ marginBottom: 12, color: "#666" }}>Te está llamando</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={UI.acceptBtn} onClick={() => responderLlamada(true)}><FiPhone /> Aceptar</button>
              <button style={UI.rejectBtn} onClick={() => responderLlamada(false)}><FiPhoneOff /> Rechazar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================
   =   ESTILOS (JS objects)   =
   ============================ */

const UI = {
  // login
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
    maxWidth: 420,
    background: "#fff",
    borderRadius: 16,
    padding: 22,
    boxShadow: "0 20px 50px rgba(15,23,42,0.3)",
  },
  logoCircle: {
    width: 52,
    height: 52,
    borderRadius: 12,
    background: "#eef2ff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
  },
  label: { display: "block", marginTop: 8, marginBottom: 6, color: "#444", fontSize: 13 },
  input: {
    width: "100%",
    padding: "10px 12px",
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
    padding: 12,
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 600,
  },
  btnSecondary: {
    flex: 1,
    background: "#f3f4f6",
    border: "none",
    padding: 12,
    borderRadius: 10,
    cursor: "pointer",
  },

  // layout
  app: {
    display: "flex",
    height: "100vh",
    background: "#f8fafc",
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
  },
  sidebar: {
    width: 300,
    background: "#0f1724",
    color: "#fff",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  sideHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    background: "#1f2937",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    color: "#fff",
  },
  btnSmall: {
    background: "#111827",
    color: "#fff",
    border: "none",
    padding: "6px 10px",
    borderRadius: 8,
    cursor: "pointer",
  },
  userList: {
    overflowY: "auto",
    paddingTop: 6,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  userRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    background: "#081226",
  },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: "#111827",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    color: "#fff",
  },
  callBtn: {
    background: "#10b981",
    border: "none",
    padding: "8px 10px",
    borderRadius: 8,
    color: "#fff",
    cursor: "pointer",
  },

  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  chatHeader: {
    padding: 16,
    borderBottom: "1px solid #e6e9ee",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#fff",
  },
  messagesWrapper: {
    flex: 1,
    overflowY: "auto",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    background: "linear-gradient(180deg,#f8fafc,#ffffff 60%)",
  },
  messageBubble: {
    maxWidth: "70%",
    padding: 12,
    borderRadius: 12,
    boxShadow: "0 6px 18px rgba(0,0,0,0.04)",
  },
  composer: {
    display: "flex",
    padding: 14,
    gap: 10,
    borderTop: "1px solid #e6e9ee",
    background: "#fff",
  },
  composerInput: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    border: "1px solid #e6e6e6",
    outline: "none",
  },
  sendBtn: {
    background: "#4f46e5",
    border: "none",
    color: "#fff",
    padding: "10px 12px",
    borderRadius: 10,
    cursor: "pointer",
  },

  // incoming popup
  incoming: {
    position: "fixed",
    right: 20,
    bottom: 20,
    zIndex: 1200,
  },
  incomingCard: {
    background: "#fff",
    padding: 14,
    borderRadius: 12,
    boxShadow: "0 20px 60px rgba(2,6,23,0.25)",
    minWidth: 220,
    textAlign: "center",
  },
  acceptBtn: {
    background: "#22c55e",
    color: "#fff",
    border: "none",
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
  },
  rejectBtn: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
  },
};
