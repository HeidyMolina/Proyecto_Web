const canvas = document.getElementById('juego');
const ctx = canvas.getContext('2d');

const mapaLargo = 6600;
let x = 400;
let y = canvas.height - 130;
let velocidad = 4;
let saltando = false;
let dobleSaltoDisponible = true;
let gravedad = 1;
let velocidadY = 0;
let requisitosRecogidos = 0;
let enCaida = false;
let juegoIniciado = false;
let juegoPerdido = false;
let totalGasto = 0;
let mensajeActivo = false;
let mensajeTexto = "";
let mensajeTimer = 0;
let juegoGanado = false;

const ANCHO_JUGADOR = 100;
const ALTO_JUGADOR = 100;

const puntajeTexto = document.getElementById('puntaje');
const totalGastoTexto = document.getElementById('totalGastoTexto');
const mensajeFinal = document.getElementById('mensajeFinal');
const btnReintentar = document.getElementById('btnReintentar');
const audioSalto = new Audio('/audio/saltar.mp3');
const audioRequisito = new Audio('/audio/recolectar.mp3');
const audioGameOver = new Audio('/audio/gameover.mp3');


const fondo = new Image();
fondo.src = "/images-requisitos/fondo_juego1.png";

const jugadorImg = new Image();
jugadorImg.src = "/images-requisitos/saltar.png";

const ladronImg = new Image();
ladronImg.src = "/images-requisitos/ladron1.png";

const alturas = [350, 250, 200];

const datosRequisitos = {
  dpi: { texto: "DPI (Original y copia)" },
  dpi_beneficiario: { texto: "Fotocopia de DPI del beneficiario." },
  ornato: { texto: "Boleto de ornato." },
  penales: { texto: "Antecedentes penales (vigentes)" },
  policiacos: { texto: "Antecedentes policiacos (vigentes)." },
  pulmones: { texto: "Tarjeta de pulmones." },
  hematologia: { texto: "Examen de hematología completa." },
  examen_orina: { texto: "Examen de heces y orina." },
  toxicologico: { texto: "Examen toxicológico." },
  nit: { texto: "NIT." },
  embarazo: { texto: "Pruebas de embarazo para personal femenino." }
};


const requisitosBase = Object.keys(datosRequisitos);

const obstaculos = Array.from({ length: 8 }, (_, i) => ({
  imagen: Object.assign(new Image(), { src: `/images-requisitos/obstaculo${i + 1}.png` }),
  x: 800 + i * 600 + Math.random() * 400,
  y: canvas.height - 130,
  w: 140,
  h: 140
}));

let requisitos = [];

const obstaculoFinal = {
  imagen: Object.assign(new Image(), { src: '/images-requisitos/brigada.png' }),
  x: mapaLargo, // al final del recorrido
  y: canvas.height - 150,
  w: 130,
  h: 130
};


function generarRequisitos() {
  requisitos = requisitosBase.map((nombre, i) => {
    let nuevoX;
    let intento = 0;
    do {
      nuevoX = 700 + i * 500 + Math.random() * 300;
      intento++;
    } while (obstaculos.some(obs => Math.abs(obs.x - nuevoX) < 100) && intento < 10);

    return {
      nombre,
      imagen: Object.assign(new Image(), { src: `/images-requisitos/${nombre}.png` }),
      recogido: false,
      ancho: 90,
      alto: 90,
      x: nuevoX,
      y: alturas[Math.floor(Math.random() * alturas.length)]
    };
  });
}
generarRequisitos();

let fondoX = 0;

// 🎮 CONTROL DE SALTO COMPATIBLE CON TODAS LAS ENTRADAS
let toquesRapidos = 0;
let tiempoPrimerToque = 0;

// Función para reproducir el sonido de salto sin retraso
function reproducirSalto() {
  const sonido = new Audio('/audio/saltar.mp3');
  sonido.volume = 0.8; // Puedes ajustar el volumen si lo deseas
  sonido.play();
}

function realizarSalto() {
  if (!juegoIniciado || juegoPerdido) return;

  const ahora = Date.now();

  // Si es el primer toque/salto
  if (!saltando && !enCaida) {
    saltando = true;
    velocidadY = -13;
    dobleSaltoDisponible = true;

    reproducirSalto();

    tiempoPrimerToque = ahora;
    toquesRapidos = 1;
  }
  // Segundo salto si pasa rápido (doble salto)
  else if (dobleSaltoDisponible && (ahora - tiempoPrimerToque) < 300) {
    velocidadY = -16;
    x += 30;
    dobleSaltoDisponible = false;

    reproducirSalto();

    toquesRapidos = 0;
  }
}

// TECLADO
document.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && !juegoPerdido) {
    realizarSalto();
  }
});

// MOUSE
canvas.addEventListener('click', () => {
  if (!juegoPerdido) {
    realizarSalto();
  }
});

// TOUCH
canvas.addEventListener('touchstart', () => {
  if (!juegoPerdido) {
    realizarSalto();
  }
});




function dibujarEscenaInicial() {
  ctx.drawImage(fondo, 0, 0, canvas.width, canvas.height);
  ctx.drawImage(jugadorImg, x, y, ANCHO_JUGADOR, ALTO_JUGADOR);
  ctx.drawImage(ladronImg, 20, canvas.height - 120, 80, 100);


}

function actualizar() {
  if (!juegoIniciado || juegoPerdido) return;

  fondoX -= velocidad * 0.5;
  if (fondoX <= -canvas.width) fondoX = 0;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(fondo, fondoX, 0, canvas.width, canvas.height);
  ctx.drawImage(fondo, fondoX + canvas.width, 0, canvas.width, canvas.height);

  // ⬇️ GRAVEDAD Y SALTO (debe ir aquí)
  if (saltando || enCaida) {
    y += velocidadY;
    velocidadY += gravedad;

    if (y >= canvas.height - ALTO_JUGADOR - 30) {
      y = canvas.height - ALTO_JUGADOR - 30;
      velocidadY = 0;
      saltando = false;
      enCaida = false;
      dobleSaltoDisponible = true;
    }
  }

  // 👤 Dibuja al jugador con sombra y animación
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 15;
  ctx.shadowOffsetY = 10;
  ctx.translate(x + ANCHO_JUGADOR / 2, y + ALTO_JUGADOR / 2);
  const rotacion = saltando ? Math.sin(Date.now() / 100) * 0.1 : 0;
  ctx.rotate(rotacion);
  ctx.drawImage(jugadorImg, -ANCHO_JUGADOR / 2, -ALTO_JUGADOR / 2, ANCHO_JUGADOR, ALTO_JUGADOR);
  ctx.restore();

  // 🏁 Obstáculo final - brigada
obstaculoFinal.x -= velocidad;
ctx.drawImage(obstaculoFinal.imagen, obstaculoFinal.x, obstaculoFinal.y, obstaculoFinal.w, obstaculoFinal.h);

// Colisión con brigada
const tocaBrigada = (
  x + ANCHO_JUGADOR > obstaculoFinal.x &&
  x < obstaculoFinal.x + obstaculoFinal.w &&
  y + ALTO_JUGADOR > obstaculoFinal.y &&
  y < obstaculoFinal.y + obstaculoFinal.h
);

if (tocaBrigada) {
  juegoIniciado = false;
  if (requisitosRecogidos === requisitos.length) {
    juegoGanado = true;
    mostrarVictoria();
  } else {
    juegoPerdido = true;
   mostrarMensajeDerrotaPersonalizado("⚠️ No llevas todos los requisitos. Vuelve a intentarlo.");
    //mensajeFinal.style.display = 'block';
    const btnDerrota = document.getElementById('btnReintentarDerrota');
    if (btnDerrota) btnDerrota.style.display = 'inline-block';
  }
}


  // 🧍 Dibujar requisitos
  requisitos.forEach(req => {
    if (!req.recogido) {
      ctx.drawImage(req.imagen, req.x, req.y, req.ancho, req.alto);
      if (
        x < req.x + req.ancho &&
        x + ANCHO_JUGADOR > req.x &&
        y < req.y + req.alto &&
        y + ALTO_JUGADOR > req.y
      ) {
        req.recogido = true;
        requisitosRecogidos++;
        const info = datosRequisitos[req.nombre];
        mensajeTexto = `✅ ${info.texto}`;
        mensajeActivo = true;
        mensajeTimer = 100;
        audioRequisito.play();
        puntajeTexto.textContent = `Requisitos recogidos: ${requisitosRecogidos}`;

      }
    }
    req.x -= velocidad;
  });

  // 🚧 Dibujar obstáculos
  obstaculos.forEach(obs => {
    obs.x -= velocidad;
    ctx.drawImage(obs.imagen, obs.x, obs.y, obs.w, obs.h);

    const enRangoX = x + ANCHO_JUGADOR > obs.x && x < obs.x + obs.w;
    const caeSobre = y + ALTO_JUGADOR <= obs.y + 10 && y + ALTO_JUGADOR + velocidadY >= obs.y;

    if (enRangoX && caeSobre) {
      y = obs.y - ALTO_JUGADOR;
      velocidadY = 0;
      saltando = false;
      enCaida = false;
      dobleSaltoDisponible = true;
    }

    if (
      x + ANCHO_JUGADOR > obs.x &&
      x < obs.x + obs.w &&
      y + ALTO_JUGADOR > obs.y &&
      y < obs.y + obs.h &&
      !caeSobre
    ) {
      x = obs.x - ANCHO_JUGADOR;
    }
  });

  // 👇 Detección de plataforma debajo
  let hayPlataformaDebajo = false;
  obstaculos.forEach(obs => {
    const sobreObstaculo =
      x + ANCHO_JUGADOR > obs.x &&
      x < obs.x + obs.w &&
      y + ALTO_JUGADOR <= obs.y + 5 &&
      y + ALTO_JUGADOR + 5 >= obs.y;
    if (sobreObstaculo) hayPlataformaDebajo = true;
  });

  if (!hayPlataformaDebajo && y + ALTO_JUGADOR < canvas.height - 30) {
    enCaida = true;
  }

  // 💬 Dibujar mensaje
  dibujarMensajeFlotante();

  // 👮 Dibujar ladrón
  ctx.drawImage(ladronImg, 20, canvas.height - 150, 100, 130);

  // 🏁 Victoria
  //if (!juegoGanado && requisitosRecogidos === requisitos.length) {
    //juegoGanado = true;
    //juegoIniciado = false;
   // mostrarVictoria();
 // }

  // 💀 Derrota
  if (x <= 10) {
    juegoIniciado = false;
    juegoPerdido = true;
    totalGastoTexto.textContent = `Total estimado: Q${totalGasto.toFixed(2)}`;
    mostrarMensajeDerrotaPersonalizado("🚨 ¡Has sido atrapado por el delincuente!");
    //mensajeFinal.style.display = 'block';
    const btnDerrota = document.getElementById('btnReintentarDerrota');
  if (btnDerrota) btnDerrota.style.display = 'inline-block';
}

  // 🔁 Loop
  if (juegoIniciado) requestAnimationFrame(actualizar);
}




function dibujarMensajeFlotante() {
  if (mensajeActivo && mensajeTimer > 0) {
    ctx.save();
    const ancho = 500;
    const alto = 80;
    const xBurbuja = canvas.width / 2 - ancho / 2;
    const yBurbuja = 40;

    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 15;

    ctx.fillStyle = "#e6d5f7";
    ctx.strokeStyle = "#5c4a75";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(xBurbuja + 20, yBurbuja);
    ctx.lineTo(xBurbuja + ancho - 20, yBurbuja);
    ctx.quadraticCurveTo(xBurbuja + ancho, yBurbuja, xBurbuja + ancho, yBurbuja + 20);
    ctx.lineTo(xBurbuja + ancho, yBurbuja + alto - 20);
    ctx.quadraticCurveTo(xBurbuja + ancho, yBurbuja + alto, xBurbuja + ancho - 20, yBurbuja + alto);
    ctx.lineTo(xBurbuja + ancho / 2 + 20, yBurbuja + alto);
    ctx.lineTo(xBurbuja + ancho / 2, yBurbuja + alto + 20);
    ctx.lineTo(xBurbuja + ancho / 2 - 20, yBurbuja + alto);
    ctx.lineTo(xBurbuja + 20, yBurbuja + alto);
    ctx.quadraticCurveTo(xBurbuja, yBurbuja + alto, xBurbuja, yBurbuja + alto - 20);
    ctx.lineTo(xBurbuja, yBurbuja + 20);
    ctx.quadraticCurveTo(xBurbuja, yBurbuja, xBurbuja + 20, yBurbuja);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#2d1c4d";
    ctx.font = "18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(mensajeTexto, canvas.width / 2, yBurbuja + alto / 2 + 5);

    ctx.restore();
    mensajeTimer--;
    if (mensajeTimer <= 0) mensajeActivo = false;
  }
}

function mostrarMensajeDerrotaPersonalizado(texto) {
  ctx.save();

  // Sombra de fondo oscuro (para destacar el mensaje)
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Cuadro con bordes redondeados
  const ancho = 600;
  const alto = 180;
  const x = canvas.width / 2 - ancho / 2;
  const y = canvas.height / 2 - alto / 2;

  ctx.fillStyle = "#fff3e0"; // fondo suave beige/anaranjado
  ctx.strokeStyle = "#ff6f00"; // borde naranja fuerte
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(x, y, ancho, alto, 30);
  ctx.fill();
  ctx.stroke();

  // Texto centrado y grande
  ctx.fillStyle = "#bf360c"; // texto rojo oscuro
  ctx.font = "bold 26px Arial";
  ctx.textAlign = "center";
  ctx.fillText(texto, canvas.width / 2, y + alto / 2 + 10);

  ctx.restore();
}


window.onload = () => {
  fondo.onload = dibujarEscenaInicial;

  const btnInicio = document.getElementById('btnIniciar');
  const btnReintentarDerrota = document.getElementById('btnReintentarDerrota');
  const btnReintentarVictoria = document.getElementById('btnReintentarVictoria');

  if (btnInicio) {
  btnInicio.addEventListener('click', () => {
    juegoIniciado = true;
    actualizar();
    btnInicio.style.display = 'none';
  });
}

if (btnReintentarDerrota) {
  btnReintentarDerrota.addEventListener('click', () => {
    window.location.reload();
  });
}

if (btnReintentarVictoria) {
  btnReintentarVictoria.addEventListener('click', () => {
    window.location.reload();
  });
}
}; 


function reiniciarJuego() {
  x = 400;
  y = canvas.height - 130;
  velocidadY = 0;
  saltando = false;
  enCaida = false;
  dobleSaltoDisponible = true;
  requisitosRecogidos = 0;
  totalGasto = 0;
  juegoIniciado = false; // IMPORTANTE: volver a esperar clic para iniciar
  juegoPerdido = false;
  juegoGanado = false;

  // Oculta modal de victoria
  const modal = document.getElementById('modalVictoria');
  if (modal) modal.style.display = 'none';

  // Oculta mensaje de derrota
  mensajeFinal.style.display = 'none';

  // Oculta botones de reintento
  btnReintentar.style.display = 'none';
  const btnDerrota = document.getElementById('btnReintentarDerrota');
  if (btnDerrota) btnDerrota.style.display = 'none';
  const btnVictoria = document.getElementById('btnReintentarVictoria');
  if (btnVictoria) btnVictoria.style.display = 'none';

  // Muestra botón "Iniciar carrera" otra vez
  const btnInicio = document.getElementById('btnIniciar');
  if (btnInicio) btnInicio.style.display = 'inline-block';

  // Reiniciar puntuaciones en pantalla
  puntajeTexto.textContent = "Requisitos recogidos: 0";
  totalGastoTexto.textContent = "Total estimado: Q0.00";

  // Reposicionar obstáculos
  obstaculos.forEach((obs, i) => {
    obs.x = 800 + i * 600 + Math.random() * 400;
  });

  // Regenerar requisitos y dibujar pantalla inicial
  obstaculoFinal.x = mapaLargo;
  generarRequisitos();
  dibujarEscenaInicial();


}

function mostrarVictoria() {
  const modal = document.getElementById('modalVictoria');
  const audio = document.getElementById('audioVictoria');

  document.getElementById('modalPuntaje').textContent = `Requisitos recogidos: ${requisitosRecogidos}`;
  document.getElementById('modalGasto').textContent = `Total estimado: Q${totalGasto.toFixed(2)}`;

  modal.style.display = 'flex';
  audio.play();

  const btnVictoria = document.getElementById('btnReintentarVictoria');
  if (btnVictoria) btnVictoria.style.display = 'inline-block';
}



