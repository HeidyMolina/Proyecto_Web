// ------------------------------------------------
// ARCHIVO: server.js (100% CONECTADO A MYSQL)
// ------------------------------------------------

require('dotenv').config();

const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const juegosRouter = require('./routes/juegos');
const db = require('./db');

const app = express();


app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// —— Configuración de EJS + express-ejs-layouts ——
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layout'); // Asegúrate de tener views/layout.ejs

// RUTA para el quiz de patrulla
app.get('/juegos/quiz_patrulla', (req, res) => {
  res.render('quiz_patrulla', { title: 'Quiz Patrulla' });
});


// —— Middlewares ——
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: true
}));


app.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { 
    title: 'Recuperar Contraseña',
    layout: 'layout_auth' // 👉 usa layout limpio
  });
});

app.get('/reset-password/:token', (req, res) => {
  const { token } = req.params;
  db.query("SELECT * FROM usuarios WHERE reset_token=? AND reset_expira > NOW()", 
    [token], (err, results) => {
      if (err || results.length === 0) 
        return res.send('⚠️ Enlace inválido o expirado.');
      
      res.render('reset-password', { 
        title: 'Nueva Contraseña', 
        token,
        layout: 'layout_auth' // 👉 también sin panel
      });
    });
});


app.use((req, res, next) => {
  // Disponible como `user` en TODAS las vistas/partials (incluido el header)
  res.locals.user = req.session.user || null;
  // Si te sirve, también un flag de admin:
  res.locals.isAdmin = !!(req.session.user && req.session.user.rol === 'admin');
  next();
});

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.rol !== 'admin') {
    return res.redirect('/login');
  }
  next();
}

// —— Carga de rutas personalizadas ——
app.use('/juegos', juegosRouter);

// —— Estructura de carpetas necesarias ——
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const assistantDir = path.join(__dirname, 'data', 'assistant');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(assistantDir)) fs.mkdirSync(assistantDir, { recursive: true });

// —— Configuración de multer ——
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// —— Configuración de correo ——  
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,             // ✅ puerto seguro SSL
  secure: true,          // ✅ con 465 debe ser true
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Verificar conexión SMTP
transporter.verify((err, success) => {
  if (err) {
    console.error("❌ Error con SMTP:", err);
  } else {
    console.log("✅ Conexión SMTP exitosa. Listo para enviar correos ✉️");
  }
});



app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// —— RUTAS ——

// Página principal
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.redirect('/login');
});

// Registro (GET)
app.get('/register', (req, res) => {
  res.render('register', { title: 'Registrarse', user: null });
});

// Registro (POST)
app.post('/register', async (req, res) => {
  const { nombre, apellido, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  db.query('SELECT id FROM usuarios WHERE email = ?', [email.trim().toLowerCase()], (err, results) => {
    if (err) return res.status(500).send('Error interno.');
    if (results.length > 0) return res.send('El correo ya está registrado.');

    db.query(
      'INSERT INTO usuarios (nombre, apellido, email, password, rol) VALUES (?, ?, ?, ?, ?)',
      [nombre.trim(), apellido.trim(), email.trim().toLowerCase(), hashedPassword, 'usuario'],
      (err, result) => {
        if (err) return res.status(500).send('Error al registrar usuario.');

        // ✅ GUARDAR ID EN SESIÓN
        req.session.user = {
          id: result.insertId,
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          email: email.trim().toLowerCase(),
          rol: 'usuario'
        };
        req.session.save(() => res.redirect('/loading'));
      }
    );
  });
});


// ==========================
// Contador de visitas (UPSERT)
// ==========================
function contarVisita(nombreVista) {
  const sql = `
    INSERT INTO visitas (vista, contador)
    VALUES (?, 1)
    ON DUPLICATE KEY UPDATE contador = contador + 1
  `;
  db.query(sql, [nombreVista], (err) => {
    if (err) console.error("Error al contar visita en " + nombreVista, err);
  });
}

// (Opcional) Semilla para asegurar las vistas creadas
const VISTAS_A_CONTAR = [
  'dashboard',
  'mensajes',
  'historia',
  'proyeccion-social',
  'gestion-riesgo',
  'actos-civicos',
  'medio-ambiente',
  'minigame',
  'assistant',
  'requisitos'
];

function seedVisitas() {
  const values = VISTAS_A_CONTAR.map(v => [v, 0]);
  // Crea filas si no existen (requiere índice UNIQUE en `vista`)
  db.query(
    'INSERT IGNORE INTO visitas (vista, contador) VALUES ?',
    [values],
    (err) => {
      if (err) console.error('Error sembrando visitas:', err);
    }
  );
}

// Llama a la semilla una vez al arrancar el server
seedVisitas();



// Login (GET)
app.get('/login', (req, res) => {
  res.render('login', { title: 'Iniciar Sesión', user: null });
});

// Login (POST)
app.post('/login', async (req, res) => {
  const email = req.body.email.trim().toLowerCase();
  const password = req.body.password.trim();

  db.query(
    'SELECT id, nombre, apellido, email, password, rol FROM usuarios WHERE email = ? LIMIT 1',
    [email],
    async (err, results) => {
      if (err) return res.render('login', { 
        title: 'Iniciar Sesión', 
        layout: 'layout_auth',
        msg: { type: 'error', text: '❌ Error interno.' }
      });

      if (results.length === 0) {
        return res.render('login', { 
          title: 'Iniciar Sesión', 
          layout: 'layout_auth',
          msg: { type: 'error', text: '⚠️ Credenciales inválidas.' }
        });
      }

      const user = results[0];
      const esValida = await bcrypt.compare(password, user.password);

      if (!esValida) {
        return res.render('login', { 
          title: 'Iniciar Sesión', 
          layout: 'layout_auth',
          msg: { type: 'error', text: 'Contraseña incorrecta.' }
        });
      }

      // ✅ Login correcto
      req.session.user = {
        id: user.id,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        rol: user.rol || 'usuario'
      };
      req.session.save(() => res.redirect('/loading'));
    }
  );
});


const crypto = require('crypto');

// ============= OLVIDÉ MI CONTRASEÑA =============

// GET → formulario para pedir correo
app.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { 
  title: 'Recuperar Contraseña', 
  layout: 'layout_auth'   // 👈 Forzamos a usar el layout limpio
});
});


// POST → generar token y enviar link por correo
app.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  const token = crypto.randomBytes(20).toString('hex');
  const expira = new Date(Date.now() + 15 * 60 * 1000); // expira en 15 min

  db.query(
    "UPDATE usuarios SET reset_token=?, reset_expira=? WHERE email=?", 
    [token, expira, email],
    (err, result) => {
      if (err) {
        return res.render("forgot-password", { 
          title: "Recuperar Contraseña",
          layout: "layout_auth",
          msg: { type: "error", text: "❌ Error interno." }
        });
      }

      if (result.affectedRows === 0) {
        return res.render("forgot-password", { 
          title: "Recuperar Contraseña",
          layout: "layout_auth",
          msg: { type: "warning", text: "⚠️ Correo no encontrado." }
        });
      }

      const link = `${process.env.BASE_URL}/reset-password/${token}`;
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Recupera tu contraseña',
        html: `
          <h2>Solicitud de recuperación de contraseña</h2>
          <p>Has solicitado restablecer tu contraseña.</p>
          <p>Haz clic en el siguiente enlace (válido por 15 minutos):</p>
          <a href="${link}">${link}</a>
        `
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
  console.error("❌ Error al enviar correo:", error);
  return res.render("forgot-password", {
    title: "Recuperar Contraseña",
    msg: { type: "error", text: "❌ Error enviando correo." },
    layout: "layout_auth"
  });
}

console.log("✅ Correo enviado:", info.response);
res.render("forgot-password", {
  title: "Recuperar Contraseña",
  msg: { type: "success", text: "✅ Revisa tu correo para continuar." },
  layout: "layout_auth"
});

      });
    }
  );
});



// GET → formulario para ingresar nueva contraseña
app.get('/reset-password/:token', (req, res) => {
  const { token } = req.params;
  db.query("SELECT * FROM usuarios WHERE reset_token=? AND reset_expira > NOW()", 
    [token], (err, results) => {
      if (err || results.length === 0) return res.send('⚠️ Enlace inválido o expirado.');
      res.render('reset-password', { title: 'Nueva Contraseña', token });
    });
});


// POST → guardar nueva contraseña
app.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  const hashed = await bcrypt.hash(password, 10);

  db.query(
    "UPDATE usuarios SET password=?, reset_token=NULL, reset_expira=NULL WHERE reset_token=? AND reset_expira > NOW()", 
    [hashed, token], 
    (err, result) => {
      if (err || result.affectedRows === 0) {
        return res.render("reset-password", {
          title: "Nueva Contraseña",
          token,
          layout: "layout_auth",
          msg: { type: "error", text: "⚠️ Error al restablecer contraseña." }
        });
      }

      res.render("login", {
        title: "Iniciar Sesión",
        layout: "layout_auth",
        msg: { type: "success", text: "✅ Contraseña actualizada, ahora puedes iniciar sesión." }
      });
    }
  );
});   

// Pantalla de carga
app.get('/loading', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  db.query("SELECT * FROM anuncio ORDER BY id DESC LIMIT 1", (err, resultados) => {
    const anuncio = resultados[0] || null;
    res.render('loading', { layout: false, anuncio });
  });
});


// Pantalla anuncios
app.get('/admin/anuncios', (req, res) => {
  if (!req.session.user || req.session.user.rol !== 'admin') return res.redirect('/login');

  const publicado = req.session.publicado;
  req.session.publicado = null;

  db.query("SELECT * FROM anuncio ORDER BY id DESC LIMIT 1", (err, resultados) => {
    if (err) return res.send('Error al cargar anuncio.');
    const anuncio = resultados[0] || null;
    res.render('anuncios', {
      title: 'Gestionar Anuncios',
      user: req.session.user,
      anuncio,
      publicado
    });
  });
});



// Guardar anuncios

app.post('/admin/anuncios', upload.single('imagen'), (req, res) => {
  const { titulo } = req.body;
  const imagen = req.file ? '/uploads/' + req.file.filename : '';

  db.query("DELETE FROM anuncio", (err) => {
    if (err) return res.send('Error al eliminar anuncio anterior.');

    db.query("INSERT INTO anuncio (titulo, imagen) VALUES (?, ?)", [titulo, imagen], (err2) => {
      if (err2) return res.send('Error al guardar nuevo anuncio.');
      req.session.publicado = true;
      res.redirect('/admin/anuncios');
    });
  });
});


// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Dashboard
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  contarVisita("dashboard");

  db.query("SELECT * FROM comentariociudadanos", (err, comentarios) => {
    if (err) return res.send("Error al cargar comentarios.");

    res.render('dashboard', { 
      title: 'Dashboard',
      user: req.session.user,
      comentarios // 👈 ahora la variable se llama comentarios
    });
  });
});



// Asistente Virtual Justito
app.get('/assistant', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  contarVisita("assistant");   
  res.render('assistant', { title: 'Asistente Virtual', user: req.session.user });
});



// Subir archivos
app.get('/uploads', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('upload', { title: 'Subir Archivos', user: req.session.user });
});

// Prueba de conexión a la base de datos
app.get('/prueba-db', (req, res) => {
  db.query('SELECT NOW() AS fecha_actual', (err, results) => {
    if (err) {
      console.error('❌ Error de conexión:', err);
      return res.status(500).send('Error en la base de datos');
    }
    res.send(`✅ Conectado a la base de datos. Fecha actual: ${results[0].fecha_actual}`);
  });
});



// Vista: Actos Cívicos
app.get('/actos-civicos', (req, res) => {
  contarVisita("actos-civicos");  
  db.query("SELECT * FROM publicaciones WHERE categoria = 'actos-civicos' ORDER BY fecha DESC", (err, resultados) => {
    if (err) return res.send('Error cargando publicaciones.');

    const publicaciones = resultados.map(pub => ({
      ...pub,
      imagenes: JSON.parse(pub.imagenes || '[]')
    }));

    res.render('actos-civicos', {
      title: 'Actos Cívicos',
      publicaciones,
      user: req.session.user || null
    });
  });
});

// Vista: Proyección Social
app.get('/proyeccion-social', (req, res) => {
  contarVisita("proyeccion-social"); 
  db.query("SELECT * FROM publicaciones WHERE categoria = 'proyeccion-social' ORDER BY fecha DESC", (err, resultados) => {
    if (err) return res.send('Error cargando publicaciones.');

    const publicaciones = resultados.map(pub => ({
      ...pub,
      imagenes: JSON.parse(pub.imagenes || '[]')
    }));

    res.render('proyeccion-social', {
      title: 'Proyección Social',
      publicaciones,
      user: req.session.user || null
    });
  });
});

// Vista: Gestión de Riesgo
app.get('/gestion-riesgo', (req, res) => {
  contarVisita("gestion-riesgo"); 
  db.query("SELECT * FROM publicaciones WHERE categoria = 'gestion-riesgo' ORDER BY fecha DESC", (err, resultados) => {
    if (err) return res.send('Error cargando publicaciones.');

    const publicaciones = resultados.map(pub => ({
      ...pub,
      imagenes: JSON.parse(pub.imagenes || '[]')
    }));

    res.render('gestion-riesgo', {
      title: 'Gestión de Riesgo',
      publicaciones,
      user: req.session.user || null
    });
  });
});

// Vista: Medio Ambiente
app.get('/medio-ambiente', (req, res) => {
  contarVisita("medio-ambiente"); 
  db.query("SELECT * FROM publicaciones WHERE categoria = 'medio-ambiente' ORDER BY fecha DESC", (err, resultados) => {
    if (err) return res.send('Error cargando publicaciones.');

    const publicaciones = resultados.map(pub => ({
      ...pub,
      imagenes: JSON.parse(pub.imagenes || '[]')
    }));

    res.render('medio-ambiente', {
      title: 'Medio Ambiente',
      publicaciones,
      user: req.session.user || null
    });
  });
});

// Vista: Admin 
app.get('/admin', (req, res) => {
  if (!req.session.user || req.session.user.rol !== 'admin') {
    return res.redirect('/login');
  }

  const publicado = req.session.publicado; // ✅
  req.session.publicado = null;

  db.query("SELECT * FROM publicaciones ORDER BY fecha DESC", (err, resultados) => {
    if (err) return res.send('Error al cargar publicaciones.');

    const publicaciones = resultados.map(pub => ({
      ...pub,
      imagenes: JSON.parse(pub.imagenes || '[]')
    }));

    res.render('admin', {
      title: 'Admin',
      user: req.session.user,
      publicaciones,
      publicado // pasa a la vista
    });
  });
});


//Ruta publicar
app.post('/admin/publicar', upload.array('imagenes', 10), (req, res) => {
  const { titulo, descripcion, categoria, fecha_actividad } = req.body;
  const imagenes = req.files.map(file => '/uploads/' + file.filename);

  db.query(
    'INSERT INTO publicaciones (titulo, descripcion, categoria, fecha_actividad, imagenes) VALUES (?, ?, ?, ?, ?)',
    [titulo, descripcion, categoria, fecha_actividad, JSON.stringify(imagenes)],
    (err, result) => {
      if (err) return res.send('Error al guardar publicación.');

      req.session.publicado = true;
      res.redirect('/admin/publicar'); // o a /admin si prefieres volver al panel
    }
  );
});

// Ruta GET: Mostrar formulario de publicación
app.get('/admin/publicar', (req, res) => {
  if (!req.session.user || req.session.user.rol !== 'admin') return res.redirect('/login');

  db.query("SELECT * FROM publicaciones ORDER BY fecha DESC", (err, resultados) => {
    if (err) return res.send('Error cargando publicaciones.');

    const publicaciones = resultados.map(pub => ({
      ...pub,
      imagenes: JSON.parse(pub.imagenes || '[]')
    }));

    res.render('publicar', {
      title: 'Nueva Publicación',
      user: req.session.user,
      publicaciones
    });
  });
});

// Ruta GET: Mostrar formulario de edición
app.get('/admin/editar/:id', (req, res) => {
  const id = req.params.id;

  db.query("SELECT * FROM publicaciones WHERE id = ?", [id], (err, resultados) => {
    if (err || resultados.length === 0) return res.send('Publicación no encontrada.');

    const publicacion = resultados[0];
    publicacion.imagenes = JSON.parse(publicacion.imagenes || '[]');

    res.render('editar-publicacion', {  // Aquí debe ser 'editar-publicacion'
      title: 'Editar Publicación',
      user: req.session.user,
      publicacion
    });
  });
});

// Ruta POST: Guardar cambios
app.post('/admin/editar/:id', upload.array('imagenes', 10), (req, res) => {
  const id = req.params.id;
  const { titulo, descripcion, categoria, fecha_actividad } = req.body;
  const nuevasImagenes = req.files.map(file => '/uploads/' + file.filename);

  db.query("SELECT imagenes FROM publicaciones WHERE id = ?", [id], (err, resultados) => {
    if (err || resultados.length === 0) return res.send('Error al obtener publicación.');

    const imagenesAnteriores = JSON.parse(resultados[0].imagenes || '[]');
    const imagenesFinales = nuevasImagenes.length > 0 ? nuevasImagenes : imagenesAnteriores;

    db.query(
      "UPDATE publicaciones SET titulo = ?, descripcion = ?, categoria = ?, fecha_actividad = ?, imagenes = ? WHERE id = ?",
      [titulo, descripcion, categoria, fecha_actividad, JSON.stringify(imagenesFinales), id],
      (err2) => {
        if (err2) return res.send('Error al actualizar publicación.');
        res.redirect('/admin/publicar');
      }
    );
  });
});

//Ruta historia
app.get('/historia', (req, res) => {
   contarVisita("historia"); 
  res.render('historia', { 
    title: 'Historia de la Brigada',
    user: req.session.user || null
  });
});


// Ruta POST: Eliminar publicación
app.post('/admin/eliminar/:id', (req, res) => {
  const id = req.params.id;

  db.query("SELECT imagenes FROM publicaciones WHERE id = ?", [id], (err, resultados) => {
    if (err || resultados.length === 0) return res.send('Publicación no encontrada.');

    const imagenes = JSON.parse(resultados[0].imagenes || '[]');
    imagenes.forEach(img => {
      const ruta = path.join(__dirname, 'public', img);
      if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
    });

    db.query("DELETE FROM publicaciones WHERE id = ?", [id], (err2) => {
      if (err2) return res.send('Error al eliminar publicación.');
      res.redirect('/admin/publicar');
    });
  });
});

// -----------------------------
// RUTA: GESTIÓN DE REQUISITOS
// -----------------------------
app.get('/admin/requisitos', (req, res) => {
    
  if (!req.session.user || req.session.user.rol !== 'admin') return res.redirect('/login');
  

  const actualizado = req.session.actualizado;
  req.session.actualizado = null;

  db.query("SELECT * FROM requisitos", (err1, reqs) => {
    if (err1) return res.send('Error al cargar requisitos.');

    db.query("SELECT * FROM beneficios", (err2, bens) => {
      if (err2) return res.send('Error al cargar beneficios.');

      db.query("SELECT * FROM testimonios", (err3, testis) => {
        if (err3) return res.send('Error al cargar testimonios.');

        res.render('gestion_requisitos', {
          title: 'Gestionar Requisitos',
          requisitos: reqs,
          beneficios: bens,
          testimonios: testis,
          actualizado,
          user: req.session.user
        });
      });
    });
  });
});
// -----------------------------
// RUTA: GESTIÓN DE REQUISITOS
// -----------------------------
app.get('/admin/requisitos', (req, res) => {
  if (!req.session.user || req.session.user.rol !== 'admin') return res.redirect('/login');

  const actualizado = req.session.actualizado;
  req.session.actualizado = null;

  db.query("SELECT * FROM requisitos", (err1, reqs) => {
    if (err1) return res.send('Error al cargar requisitos.');

    db.query("SELECT * FROM beneficios", (err2, bens) => {
      if (err2) return res.send('Error al cargar beneficios.');

      db.query("SELECT * FROM testimonios", (err3, testis) => {
        if (err3) return res.send('Error al cargar testimonios.');

        res.render('gestion_requisitos', {
          title: 'Gestionar Requisitos',
          requisitos: reqs,
          beneficios: bens,
          testimonios: testis,
          actualizado,
          user: req.session.user
        });
      });
    });
  });
});

// -----------------------------
// GUARDAR REQUISITOS
// -----------------------------
app.post('/admin/requisitos/guardar', (req, res) => {
  const nuevos = Array.isArray(req.body.nuevos_requisitos)
    ? req.body.nuevos_requisitos
    : [req.body.nuevos_requisitos];

  db.query("DELETE FROM requisitos", (err) => {
    if (err) return res.send('Error al eliminar requisitos.');

    const valores = nuevos.filter(Boolean).map(texto => [texto]);

    db.query("INSERT INTO requisitos (texto) VALUES ?", [valores], (err2) => {
      if (err2) return res.send('Error al guardar requisitos.');
      req.session.actualizado = true;
      res.redirect('/admin/requisitos');
    });
  });
});

// VISTA DEL EDITOR DE REQUISITOS
app.get('/admin/editor/requisitos', (req, res) => {
  if (!req.session.user || req.session.user.rol !== 'admin') return res.redirect('/login');

  const actualizado = req.session.actualizado;
  req.session.actualizado = null;

  db.query("SELECT * FROM requisitos", (err, reqs) => {
    if (err) return res.send("Error al cargar requisitos.");
    res.render('editor_requisitos', {
      title: 'Editar Requisitos',
      requisitos: reqs,
      actualizado,
      user: req.session.user
    });
  });
});

// AGREGAR NUEVO REQUISITO
app.post('/admin/editor/requisitos/agregar', upload.single('imagen'), (req, res) => {
  const { texto } = req.body;
  const imagen = req.file ? '/uploads/' + req.file.filename : null;

  db.query("INSERT INTO requisitos (texto, imagen) VALUES (?, ?)", [texto, imagen], (err) => {
    if (err) return res.send("Error al agregar requisito.");
    req.session.actualizado = true;
    res.redirect('/admin/editor/requisitos');
  });
});

// EDITAR REQUISITO
app.post('/admin/requisitos/editar/:id', upload.single('imagen'), (req, res) => {
  const { id } = req.params;
  const { texto } = req.body;

  if (req.file) {
    const imagen = '/uploads/' + req.file.filename;
    db.query("UPDATE requisitos SET texto = ?, imagen = ? WHERE id = ?", [texto, imagen, id], (err) => {
      if (err) return res.send("Error al actualizar requisito.");
      req.session.actualizado = true;
      res.redirect('/admin/editor/requisitos');
    });
  } else {
    db.query("UPDATE requisitos SET texto = ? WHERE id = ?", [texto, id], (err) => {
      if (err) return res.send("Error al actualizar requisito.");
      req.session.actualizado = true;
      res.redirect('/admin/editor/requisitos');
    });
  }
});

// ELIMINAR REQUISITO
app.post('/admin/requisitos/eliminar/:id', (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM requisitos WHERE id = ?", [id], (err) => {
    if (err) return res.send("Error al eliminar requisito.");
    req.session.actualizado = true;
    res.redirect('/admin/editor/requisitos');
  });
});

// -----------------------------
// GUARDAR BENEFICIOS
// -----------------------------
app.post('/admin/beneficios/guardar', (req, res) => {
  const nuevos = Array.isArray(req.body.nuevos_beneficios)
    ? req.body.nuevos_beneficios
    : [req.body.nuevos_beneficios];

  db.query("DELETE FROM beneficios", (err) => {
    if (err) return res.send('Error al eliminar beneficios.');

    const valores = nuevos.filter(Boolean).map(texto => [texto]);

    db.query("INSERT INTO beneficios (texto) VALUES ?", [valores], (err2) => {
      if (err2) return res.send('Error al guardar beneficios.');
      req.session.actualizado = true;
      res.redirect('/admin/requisitos');
    });
  });
});

// -----------------------------
// AGREGAR NUEVO TESTIMONIO  (usado desde /admin/requisitos)
// -----------------------------
app.post('/admin/testimonios/nuevo', upload.single('imagen'), (req, res) => {
  const { nombre, cita } = req.body;
  const imagen = req.file ? '/uploads/' + req.file.filename : null;

  db.query(
    'INSERT INTO testimonios (nombre, cita, imagen) VALUES (?, ?, ?)',
    [nombre, cita, imagen],
    (err) => {
      if (err) return res.send('Error al guardar nuevo testimonio.');
      req.session.actualizado = true;
      res.redirect('/admin/requisitos');
    }
  );
});

// -----------------------------
// 🚨 RUTAS VIEJAS DE TESTIMONIOS (comentadas)
// -----------------------------

/*

// -----------------------------
// AGREGAR NUEVO TESTIMONIO  (usado desde /admin/requisitos)
// -----------------------------
app.post('/admin/testimonios/nuevo', upload.single('imagen'), (req, res) => {
  const { nombre, cita } = req.body;
  const imagen = req.file ? '/uploads/' + req.file.filename : null;

  db.query(
    'INSERT INTO testimonios (nombre, cita, imagen) VALUES (?, ?, ?)',
    [nombre, cita, imagen],
    (err) => {
      if (err) return res.send('Error al guardar nuevo testimonio.');
      req.session.actualizado = true;
      res.redirect('/admin/requisitos');
    }
  );
});

// -----------------------------
// EDITAR TESTIMONIO EXISTENTE  (usado desde /admin/requisitos)
// -----------------------------
app.post('/admin/testimonios/editar/:id', upload.single('imagen'), (req, res) => {
  const { nombre, cita } = req.body;
  const { id } = req.params;

  if (req.file) {
    const imagen = '/uploads/' + req.file.filename;
    db.query('UPDATE testimonios SET nombre = ?, cita = ?, imagen = ? WHERE id = ?', [nombre, cita, imagen, id], (err) => {
      if (err) return res.send('Error al editar testimonio.');
      req.session.actualizado = true;
      res.redirect('/admin/requisitos');
    });
  } else {
    db.query('UPDATE testimonios SET nombre = ?, cita = ? WHERE id = ?', [nombre, cita, id], (err) => {
      if (err) return res.send('Error al editar testimonio.');
      req.session.actualizado = true;
      res.redirect('/admin/requisitos');
    });
  }
});

// -----------------------------
// ELIMINAR TESTIMONIO  (usado desde /admin/requisitos)
// -----------------------------
app.post('/admin/testimonios/eliminar/:id', (req, res) => {
  const { id } = req.params;

  db.query('DELETE FROM testimonios WHERE id = ?', [id], (err) => {
    if (err) return res.send('Error al eliminar testimonio.');
    req.session.actualizado = true;
    res.redirect('/admin/requisitos');
  });
});

*/


// -----------------------------
// VISTA PÚBLICA: REQUISITOS (muestra requisitos/beneficios/testimonios)
// -----------------------------
app.get('/requisitos', (req, res) => {
   contarVisita("requisitos");
  db.query('SELECT * FROM requisitos', (err1, reqs) => {
    if (err1) return res.send('Error al cargar requisitos.');
    db.query('SELECT * FROM beneficios', (err2, bens) => {
      if (err2) return res.send('Error al cargar beneficios.');
      db.query('SELECT * FROM testimonios', (err3, testis) => {
        if (err3) return res.send('Error al cargar testimonios.');
        res.render('requisitos', {
          title: 'Requisitos y Beneficios',
          requisitos: reqs,
          beneficios: bens,
          testimonios: testis,
          user: req.session.user || null
        });
      });
    });
  });
});

// -----------------------------
// EDITOR: REQUISITOS (VISTA + CRUD)  ***SIN DUPLICADOS***
// -----------------------------
app.get('/admin/editor/requisitos', (req, res) => {
  if (!req.session.user || req.session.user.rol !== 'admin') return res.redirect('/login');

  const actualizado = req.session.actualizado;
  req.session.actualizado = null;

  db.query('SELECT * FROM requisitos', (err, reqs) => {
    if (err) return res.send('Error al cargar requisitos.');
    res.render('editor_requisitos', {
      title: 'Editar Requisitos',
      requisitos: reqs,
      actualizado,
      user: req.session.user
    });
  });
});

app.post('/admin/editor/requisitos/agregar', upload.single('imagen'), (req, res) => {
  const { texto } = req.body;
  const imagen = req.file ? '/uploads/' + req.file.filename : null;

  db.query('INSERT INTO requisitos (texto, imagen) VALUES (?, ?)', [texto, imagen], (err) => {
    if (err) return res.send('Error al agregar requisito.');
    req.session.actualizado = true;
    res.redirect('/admin/editor/requisitos');
  });
});

app.post('/admin/editor/requisitos/editar/:id', upload.single('imagen'), (req, res) => {
  const { id } = req.params;
  const { texto } = req.body;

  if (req.file) {
    const imagen = '/uploads/' + req.file.filename;
    db.query('UPDATE requisitos SET texto = ?, imagen = ? WHERE id = ?', [texto, imagen, id], (err) => {
      if (err) return res.send('Error al actualizar requisito.');
      req.session.actualizado = true;
      res.redirect('/admin/editor/requisitos');
    });
  } else {
    db.query('UPDATE requisitos SET texto = ? WHERE id = ?', [texto, id], (err) => {
      if (err) return res.send('Error al actualizar requisito.');
      req.session.actualizado = true;
      res.redirect('/admin/editor/requisitos');
    });
  }
});

app.post('/admin/editor/requisitos/eliminar/:id', (req, res) => {
  const { id } = req.params;

  db.query('DELETE FROM requisitos WHERE id = ?', [id], (err) => {
    if (err) return res.send('Error al eliminar requisito.');
    req.session.actualizado = true;
    res.redirect('/admin/editor/requisitos');
  });
});

// -----------------------------
// EDITOR: BENEFICIOS (VISTA + CRUD)  ***ARREGLADA LLAVE MAL CERRADA***
// -----------------------------
app.get('/admin/editor/editar_beneficios', (req, res) => {
  if (!req.session.user || req.session.user.rol !== 'admin') return res.redirect('/login');

  db.query('SELECT * FROM beneficios', (err, resultados) => {
    if (err) {
      console.error('Error al obtener beneficios:', err);
      return res.status(500).send('Error interno del servidor');
    }
    res.render('editar_beneficios', {
      title: 'Editar Beneficios',
      beneficios: resultados,
      user: req.session.user
    });
  });
});

app.post('/admin/editor/beneficios/agregar', upload.single('imagen'), (req, res) => {
  const { texto } = req.body;
  const imagen = req.file ? '/uploads/' + req.file.filename : null;

  db.query('INSERT INTO beneficios (texto, imagen) VALUES (?, ?)', [texto, imagen], (err) => {
    if (err) {
      console.error('Error al agregar beneficio:', err);
    }
    req.session.agregado = true;
    res.redirect('/admin/editor/editar_beneficios');
  });
});

app.post('/admin/beneficios/editar/:id', upload.single('imagen'), (req, res) => {
  const { id } = req.params;
  const { texto } = req.body;

  if (req.file) {
    const imagen = '/uploads/' + req.file.filename;
    db.query('UPDATE beneficios SET texto = ?, imagen = ? WHERE id = ?', [texto, imagen, id], (err) => {
      if (err) return res.send('Error al editar beneficio.');
      req.session.actualizado = true;
      res.redirect('/admin/editor/editar_beneficios');
    });
  } else {
    db.query('UPDATE beneficios SET texto = ? WHERE id = ?', [texto, id], (err) => {
      if (err) return res.send('Error al editar beneficio.');
      req.session.actualizado = true;
      res.redirect('/admin/editor/editar_beneficios');
    });
  }
});

app.post('/admin/beneficios/eliminar/:id', (req, res) => {
  const { id } = req.params;

  db.query('DELETE FROM beneficios WHERE id = ?', [id], (err) => {
    if (err) return res.send('Error al eliminar beneficio.');
    req.session.eliminado = true;
    res.redirect('/admin/editor/editar_beneficios');
  });
});

// =============================
// TESTIMONIOS: deps y storage + VISTA EDITOR (única versión)
// =============================
const uploadDirTestimonios = path.join(__dirname, 'public', 'uploads', 'testimonios');
fs.mkdirSync(uploadDirTestimonios, { recursive: true });

const uploadTestimonios = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDirTestimonios),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
    }
  }),
  fileFilter: (req, file, cb) => {
    if (!file || !file.mimetype) return cb(null, true);
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Solo se permiten imágenes'));
  }
});

// VISTA EDITOR DE TESTIMONIOS
app.get('/admin/editor/testimonio', (req, res) => {
  if (!req.session.user || req.session.user.rol !== 'admin') return res.redirect('/login');

  const agregado = !!req.session.agregado;
  const eliminado = !!req.session.eliminado;
  req.session.agregado = null;
  req.session.eliminado = null;

  db.query('SELECT * FROM testimonios ORDER BY id DESC', (err, resultados) => {
    if (err) {
      console.error('Error obteniendo testimonios:', err.code, err.sqlMessage || err.message);
      return res.status(500).send('Error al obtener testimonios.');
    }
    res.render('testimonio', {
      title: 'Editar Testimonios',
      testimonios: resultados,
      agregado,
      eliminado,
      user: req.session.user
    });
  });
});

// AGREGAR TESTIMONIO (desde el editor)
app.post('/admin/editor/testimonios/agregar', uploadTestimonios.single('imagen'), (req, res) => {
  const { nombre, grado, cita } = req.body;
  const imagen = req.file ? '/uploads/testimonios/' + req.file.filename : null;

  if (!nombre || !grado || !cita) {
    console.error('Faltan campos en testimonio:', { nombre, grado, cita });
    return res.status(400).send('Faltan campos obligatorios.');
  }

  db.query(
    'INSERT INTO testimonios (nombre, grado, cita, imagen) VALUES (?, ?, ?, ?)',
    [nombre, grado, cita, imagen],
    (err) => {
      if (err) {
        console.error('Error guardando testimonio:', err.code, err.sqlMessage || err.message);
        return res.status(500).send('Error al guardar testimonio.');
      }
      req.session.agregado = true;
      res.redirect('/admin/editor/testimonio');
    }
  );
});

// ELIMINAR TESTIMONIO (desde el editor)
app.post('/admin/editor/testimonios/eliminar/:id', (req, res) => {
  const { id } = req.params;

  db.query('SELECT imagen FROM testimonios WHERE id = ?', [id], (err, rows) => {
    if (err) {
      console.error('Error obteniendo imagen de testimonio:', err.code, err.sqlMessage || err.message);
      return res.status(500).send('Error al eliminar testimonio.');
    }

    const img = rows?.[0]?.imagen;

    db.query('DELETE FROM testimonios WHERE id = ?', [id], (err2) => {
      if (err2) {
        console.error('Error eliminando testimonio:', err2.code, err2.sqlMessage || err2.message);
        return res.status(500).send('Error al eliminar testimonio.');
      }

      if (img) {
        const absPath = path.join(__dirname, 'public', img.replace(/^\//, ''));
        if (fs.existsSync(absPath)) {
          try { fs.unlinkSync(absPath); } catch (e) { console.warn('No se pudo borrar imagen:', e.message); }
        }
      }

      req.session.eliminado = true;
      res.redirect('/admin/editor/testimonio');
    });
  });
});


// =============================
// CIUDADANOS: storage y rutas
// =============================
const uploadDirCiudadanos = path.join(__dirname, 'public', 'uploads', 'ciudadanos');
fs.mkdirSync(uploadDirCiudadanos, { recursive: true });

const uploadCiudadanos = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDirCiudadanos),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
    }
  }),
  fileFilter: (req, file, cb) => {
    if (!file || !file.mimetype) return cb(null, true);
    return /^image\//.test(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Solo se permiten imágenes'));
  }
});

// -----------------------------
// COMENTARIOS DE CIUDADANOS (tabla: comentariociudadanos)
// -----------------------------

// Vista de gestión (formulario + lista)
app.get('/admin/agregarciudadano', (req, res) => {
  if (!req.session.user || req.session.user.rol !== 'admin') return res.redirect('/login');

  const agregado = req.session.agregado;
  const eliminado = req.session.eliminado;
  req.session.agregado = null;
  req.session.eliminado = null;

  db.query("SELECT * FROM comentariociudadanos ORDER BY id DESC", (err, comentarios) => {
    if (err) return res.send("Error al cargar comentarios de ciudadanos.");
   res.render('agregarciudadano', { 
  title: 'Gestión de Ciudadanos',   // 👈 aquí agregamos el title
  comentarios, 
  agregado, 
  eliminado 
});
});
});

// =============================
// AGREGAR COMENTARIO CIUDADANO
// =============================
app.post('/admin/agregarciudadano/agregar', uploadCiudadanos.single('foto'), (req, res) => {
  const { nombre, ocupacion, descripcion } = req.body;
  const foto = req.file ? '/uploads/ciudadanos/' + req.file.filename : null;

  if (!nombre || !ocupacion || !descripcion) {
    console.error('❌ Faltan campos al agregar comentario ciudadano');
    return res.status(400).send('Faltan datos obligatorios.');
  }

  const sql = 'INSERT INTO comentariociudadanos (nombre, ocupacion, descripcion, foto) VALUES (?, ?, ?, ?)';
  db.query(sql, [nombre, ocupacion, descripcion, foto], (err) => {
    if (err) {
      console.error('❌ Error al guardar comentario ciudadano:', err);
      return res.status(500).send('Error al guardar comentario.');
    }
    req.session.agregado = true;
    res.redirect('/admin/agregarciudadano');
  });
});


// =============================
// ELIMINAR COMENTARIO CIUDADANO
// =============================
app.post('/admin/agregarciudadano/eliminar/:id', (req, res) => {
  const { id } = req.params;

  db.query('SELECT foto FROM comentariociudadanos WHERE id = ?', [id], (err, rows) => {
    if (err || rows.length === 0) {
      console.error('❌ Error al obtener comentario ciudadano:', err);
      return res.status(500).send('Error al eliminar comentario.');
    }

    const foto = rows[0].foto;
    if (foto) {
      const rutaFoto = path.join(__dirname, 'public', foto);
      if (fs.existsSync(rutaFoto)) fs.unlinkSync(rutaFoto);
    }

    db.query('DELETE FROM comentariociudadanos WHERE id = ?', [id], (err2) => {
      if (err2) {
        console.error('❌ Error al eliminar comentario ciudadano:', err2);
        return res.status(500).send('Error al eliminar comentario.');
      }

      req.session.eliminado = true;
      res.redirect('/admin/agregarciudadano');
    });
  });
});



// =====================
// BANDEJA DE MENSAJES (USUARIO)
// =====================
// Eliminar toda la conversación de un usuario (versión usuario normal)
app.post('/mensajes/archivar-todo', requireAuth, (req, res) => {
  const usuarioId = req.session.user.id;

  // 1. Marcar como eliminado por el usuario
  db.query(
    'UPDATE mensajes SET eliminado_por_usuario = 1 WHERE usuario_id = ?',
    [usuarioId],
    (err) => {
      if (err) {
        console.error('DB error eliminar usuario', err);
        return res.status(500).send('Error al eliminar conversación');
      }

      // 2. Si admin también ya eliminó, limpiar
      db.query(
        'DELETE FROM mensajes WHERE usuario_id = ? AND eliminado_por_admin = 1 AND eliminado_por_usuario = 1',
        [usuarioId],
        (err2) => {
          if (err2) {
            console.error('DB error limpieza usuario', err2);
          }
          res.redirect('/mensajes'); // vuelve a la bandeja limpia
        }
      );
    }
  );
});



// Ver bandeja (con filtros opcionales ?f=favoritos|respondidos|enviados)
app.get('/mensajes', requireAuth, (req, res) => {
  const usuarioId = req.session.user.id;
  const f = (req.query.f || '').toLowerCase();
  contarVisita("mensajes");

  // Siempre incluir los mensajes del usuario + mensajes del admin hacia él
  let where = '(usuario_id=? OR (usuario_id=? AND enviado_por="admin"))';
  const params = [usuarioId, usuarioId];

  if (f === 'favoritos') {
    where += ' AND favorito=1';
  } else if (f === 'respondidos') {
    where += ' AND estado="respondido"';
  } else if (f === 'enviados') {
    where += ' AND estado IN ("enviado","leido")';
  }

  db.query(
  `SELECT * 
   FROM mensajes 
   WHERE ${where} AND eliminado_por_usuario=0
   ORDER BY fecha DESC`,
  params,
  (err, rows) => {
    if (err) {
      console.error('DB error GET /mensajes', err);
      return res.status(500).send('Error interno');
    }

    res.render('mensajes', { mensajes: rows });
  }
);
});

// Enviar mensaje
app.post('/mensajes', requireAuth, (req, res) => {
  const usuarioId = req.session.user.id;
  const { mensaje } = req.body;

  db.query(
    'INSERT INTO mensajes (usuario_id, mensaje, estado, enviado_por) VALUES (?, ?, "enviado", "usuario")',
    [usuarioId, mensaje],
    (err) => {
      if (err) {
        console.error('DB error POST /mensajes', err);
        return res.status(500).send('Error interno');
      }
      res.redirect('/mensajes');
    }
  );
});

// Editar mensaje (solo si no tiene respuesta)
app.post('/mensajes/:id/editar', requireAuth, (req, res) => {
  const usuarioId = req.session.user.id;
  const { id } = req.params;
  const { mensaje } = req.body;

  db.query(
  `UPDATE mensajes
   SET mensaje=? 
   WHERE id=? AND usuario_id=? AND estado="enviado"`,
  [mensaje, id, usuarioId],
  (err, result) => {
    if (err) {
      console.error('DB error editar', err);
      return res.status(500).json({ ok: false });
    }
    res.json({ ok: result.affectedRows > 0 });
  }
);
});

// Eliminar mensaje (usuario lo oculta solo en su vista)
app.post('/mensajes/:id/eliminar', requireAuth, (req, res) => {
  const usuarioId = req.session.user.id;
  const { id } = req.params;

  db.query(
    'UPDATE mensajes SET eliminado_por_usuario=1 WHERE id=? AND usuario_id=? AND estado="enviado"',
    [id, usuarioId],
    (err, result) => {
      if (err) {
        console.error('DB error eliminar usuario', err);
        return res.status(500).json({ ok: false });
      }

      // ✅ limpieza si admin también lo eliminó
      db.query(
        'DELETE FROM mensajes WHERE id=? AND eliminado_por_usuario=1 AND eliminado_por_admin=1',
        [id],
        () => {}
      );

      res.json({ ok: result.affectedRows > 0 });
    }
  );
});


// Reaccionar (guarda 1 reacción del usuario)
app.post('/mensajes/:id/reaccion', requireAuth, (req, res) => {
  const usuarioId = req.session.user.id;
  const { id } = req.params;
  const { reaccion } = req.body; // '👍' | '❤️' | '😂' | '🎖️' | null para quitar

  db.query(
    `UPDATE mensajes SET reaccion=? WHERE id=? AND usuario_id=?`,
    [reaccion || null, id, usuarioId],
    (err, result) => {
      if (err) {
        console.error('DB error reaccion', err);
        return res.status(500).json({ ok: false });
      }
      res.json({ ok: result.affectedRows > 0 });
    }
  );
});

// Favorito (toggle)
app.post('/mensajes/:id/favorito', requireAuth, (req, res) => {
  const usuarioId = req.session.user.id;
  const { id } = req.params;
  const { valor } = req.body; // '1' o '0'

  db.query(
    'UPDATE mensajes SET favorito=? WHERE id=? AND usuario_id=?',
    [valor === '1' ? 1 : 0, id, usuarioId],
    (err, result) => {
      if (err) {
        console.error('DB error favorito', err);
        return res.status(500).json({ ok: false });
      }
      res.json({ ok: result.affectedRows > 0 });
    }
  );
});

// Polling simple: saber si hay nuevas respuestas del admin (para toast/sonido)
app.get('/mensajes/check', requireAuth, (req, res) => {
  const usuarioId = req.session.user.id;
  const desde = req.query.desde ? new Date(Number(req.query.desde)) : new Date(0);

  db.query(
    `SELECT COUNT(*) AS c 
     FROM mensajes 
     WHERE usuario_id=? AND respuesta IS NOT NULL 
       AND actualizado_en IS NOT NULL AND actualizado_en > ?`,
    [usuarioId, desde],
    (err, rows) => {
      if (err) return res.json({ n: 0, now: Date.now() });
      res.json({ n: rows[0].c || 0, now: Date.now() });
    }
  );
});

// Eliminar toda la conversación de un usuario (versión usuario normal)
app.post('/mensajes/archivar-todo', requireAuth, (req, res) => {
  const usuarioId = req.session.user.id;

  // 1. Marcar como eliminado por el usuario
  db.query(
    'UPDATE mensajes SET eliminado_por_usuario = 1 WHERE usuario_id=?',
    [usuarioId],
    (err) => {
      if (err) {
        console.error('DB error eliminar usuario', err);
        return res.status(500).send('Error al eliminar conversación');
      }

      // 2. Limpiar mensajes si ambos eliminaron
      db.query(
        'DELETE FROM mensajes WHERE usuario_id=? AND eliminado_por_admin=1 AND eliminado_por_usuario=1',
        [usuarioId],
        (err2) => {
          if (err2) {
            console.error('DB error limpieza usuario', err2);
          }
          res.redirect('/mensajes'); // ✅ vuelve a la bandeja ya limpia
        }
      );
    }
  );
});


// =====================
// BANDEJA ADMIN (MENSAJES)
// =====================

// Vista principal de la bandeja de mensajes del admin
app.get('/admin/mensajes', requireAdmin, (req, res) => {
  // Lista de usuarios con total de mensajes (no archivados)
  db.query(
  `SELECT u.id, u.nombre, u.apellido,
        SUM(CASE WHEN m.estado='enviado' AND m.eliminado_por_admin=0 THEN 1 ELSE 0 END) AS pendientes
   FROM usuarios u
   LEFT JOIN mensajes m ON u.id = m.usuario_id
   WHERE u.rol <> 'admin'
   GROUP BY u.id, u.nombre, u.apellido
   ORDER BY pendientes DESC`,
  (err, usuarios) => {
    if (err) {
      console.error('DB error usuarios admin list', err);
      return res.status(500).send('Error interno');
    }



      // Estadísticas globales
db.query(
  `SELECT 
     SUM(CASE WHEN estado IN ('enviado','leido') AND eliminado_por_admin=0 THEN 1 ELSE 0 END) AS pendientes,
     SUM(CASE WHEN estado='respondido' AND eliminado_por_admin=0 THEN 1 ELSE 0 END) AS respondidos,
     SUM(CASE WHEN eliminado_por_admin=1 THEN 1 ELSE 0 END) AS archivados
   FROM mensajes`,
  (err2, statsRes) => {
    if (err2) {
      console.error('DB error stats admin list', err2);
      return res.status(500).send('Error interno');
    }

    const stats = statsRes[0] || { pendientes: 0, respondidos: 0, archivados: 0 };

    res.render('admin_mensajes', { usuarios, stats });
  }
);

    }
  );
});

// Cargar conversación de un usuario
app.get('/admin/mensajes/conversacion/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.query(
    `SELECT m.*, u.nombre, u.apellido 
     FROM mensajes m 
     JOIN usuarios u ON u.id = m.usuario_id
     WHERE u.id=? AND m.eliminado_por_admin=0
     ORDER BY m.fecha ASC`,
    [id],
    (err, mensajes) => {
      if (err) {
        console.error('DB error admin conversacion', err);
        return res.status(500).send('Error interno');
      }
      res.render('partials/conversacion_admin', { mensajes, usuarioId: id, layout: false });
    }
  );
});


// Responder mensaje
app.post('/admin/mensajes/responder/:id', requireAdmin, upload.single("imagen"), (req, res) => {
  const { id } = req.params;
  const { respuesta } = req.body;
  const imagen = req.file ? '/uploads/' + req.file.filename : null;

  // buscar usuario del mensaje original
  db.query('SELECT usuario_id FROM mensajes WHERE id=?', [id], (err, rows) => {
    if (err || !rows.length) {
      console.error('DB error responder', err);
      return res.status(500).send('Error interno');
    }

    const usuarioId = rows[0].usuario_id;

    // insertar como NUEVO mensaje
    db.query(
      'INSERT INTO mensajes (usuario_id, mensaje, imagen, estado, enviado_por) VALUES (?, ?, ?, "respondido", "admin")',
      [usuarioId, respuesta, imagen],
      (err2) => {
        if (err2) {
          console.error('DB error insertar respuesta', err2);
          return res.status(500).send('Error interno');
        }

        // marcar el original como leído/respondido
        db.query('UPDATE mensajes SET estado="respondido" WHERE id=?', [id]);

        res.redirect('back');
      }
    );
  });
});

// Editar respuesta
app.post('/admin/mensajes/editar/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { respuesta } = req.body;

  db.query(
    'UPDATE mensajes SET respuesta=?, actualizado_en=NOW() WHERE id=?',
    [respuesta, id],
    (err) => {
      if (err) return res.status(500).json({ ok: false });
      res.json({ ok: true });
    }
  );
});

// Eliminar respuesta
app.post('/admin/mensajes/eliminar/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  db.query(
    'DELETE FROM mensajes WHERE id=? AND enviado_por="admin"',
    [id],
    (err, result) => {
      if (err) return res.status(500).json({ ok: false });
      res.json({ ok: result.affectedRows > 0 });
    }
  );
});


// Eliminar conversación completa (admin solo marca como eliminado)
app.post('/admin/mensajes/archivar/:usuarioId', requireAdmin, (req, res) => {
  const { usuarioId } = req.params;

  // 1. Marcar mensajes como eliminados por el admin
  db.query(
    'UPDATE mensajes SET eliminado_por_admin = 1 WHERE usuario_id = ?',
    [usuarioId],
    (err) => {
      if (err) {
        console.error('DB error al archivar admin', err);
        return res.status(500).json({ ok: false });
      }

      // 2. Si el usuario también eliminó, limpiar de verdad
      db.query(
        'DELETE FROM mensajes WHERE usuario_id = ? AND eliminado_por_admin = 1 AND eliminado_por_usuario = 1',
        [usuarioId],
        (err2) => {
          if (err2) {
            console.error('DB error limpieza mensajes', err2);
            return res.status(500).json({ ok: false });
          }
          res.json({ ok: true });
        }
      );
    }
  );
});




// Reaccionar (admin reacciona a mensaje de usuario)
app.post('/admin/mensajes/reaccion/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { reaccion } = req.body; // '👍' | '❤️' | '😂' | '🎖️'

  db.query(
    `UPDATE mensajes SET reaccion=? WHERE id=? AND enviado_por="usuario"`,
    [reaccion || null, id],
    (err, result) => {
      if (err) {
        console.error('DB error reaccion admin', err);
        return res.status(500).json({ ok: false });
      }
      res.json({ ok: result.affectedRows > 0 });
    }
  );
});

// Reacciones (ADMIN reacciona a mensajes de usuario)
async function handleReaction(id, emoji){
  const res = await fetch(`/admin/mensajes/reaccion/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reaccion: emoji })
  }).then(r => r.json()).catch(() => ({ ok:false }));

  if(res.ok){
    const target = document.getElementById(`reaccion-destacada-${id}`);
    if(target) target.innerHTML = emoji;
  } else {
    Swal.fire({
      title:'Ups',
      text:'No se pudo registrar la reacción',
      icon:'error',
      confirmButtonText:'Entendido'
    });
  }
}


// ================================
// Enviar mensaje global a todos los usuarios
// ================================
app.post('/admin/mensajes/global', requireAdmin, upload.single("imagen"), (req, res) => {
  const { mensaje } = req.body;
  const imagen = req.file ? '/uploads/' + req.file.filename : null;

  // 1. Obtener todos los usuarios con correo registrado
  db.query('SELECT id, email FROM usuarios WHERE rol <> "admin"', async (err, usuarios) => {
    if (err) {
      console.error('DB error usuarios para mensaje global', err);
      return res.status(500).send('Error interno');
    }

    if (!usuarios.length) {
      return res.redirect('/admin/mensajes'); // No hay usuarios
    }

    // 2. Insertar un mensaje en la bandeja de cada usuario
    const values = usuarios.map(u => [u.id, mensaje, imagen, "respondido", "admin"]);
    db.query(
      'INSERT INTO mensajes (usuario_id, mensaje, imagen, estado, enviado_por) VALUES ?',
      [values],
      async (err2) => {
        if (err2) {
          console.error('DB error insertar global', err2);
          return res.status(500).send('Error interno');
        }

        // 3. Configuración de Nodemailer
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });

        // 4. Enviar correo a cada usuario
        const enlaceBandeja = `${process.env.BASE_URL}/mensajes`;

        for (const u of usuarios) {
          try {
            await transporter.sendMail({
              from: `"Justito Informa" <${process.env.EMAIL_USER}>`,
              to: u.email,
              subject: "¡Atención! Lo que necesitas saber está aquí 💌",
              html: `
                <div style="font-family: Arial, sans-serif; color:#333; max-width:600px; margin:auto; padding:20px; border:1px solid #ddd; border-radius:10px;">
                  <h2 style="color:#1a73e8;">📢 Nuevo Mensaje Importante 🥳</h2>
                  <p>${mensaje}</p>
                  <p>
                    <a href="${enlaceBandeja}" style="display:inline-block; background:#1a73e8; color:#fff; padding:12px 20px; text-decoration:none; border-radius:6px;">
                      👉 Ver mensaje en la plataforma
                    </a>
                  </p>
                  <hr>
                  <small>Este correo fue enviado automáticamente por <b>Justito Informa</b>.</small>
                </div>
              `
            });
          } catch (error) {
            console.error(`❌ Error enviando correo a ${u.email}`, error);
          }
        }

        res.redirect('/admin/mensajes'); // ✅ volver a la bandeja admin
      }
    );
  });
});


// =====================
// LISTA DE USUARIOS (SOLO ADMIN)
// =====================
app.get('/admin/usuarios', requireAdmin, (req, res) => {
  db.query("SELECT id, nombre, apellido, email, rol FROM usuarios ORDER BY id DESC", (err, usuarios) => {
    if (err) {
      console.error('DB error lista usuarios', err);
      return res.status(500).send('Error al obtener usuarios.');
    }
    res.render('usuarios_admin', {
      title: 'Lista de Usuarios',
      user: req.session.user,
      usuarios
    });
  });
});

// Ruta para guardar resultados de juegos
app.post('/guardar-resultado', (req, res) => {
  const { juego, puntaje, tiempo } = req.body;
  const usuarioId = req.session.user?.id; // 👈 ahora sí toma el id correcto

  if (!usuarioId) {
    return res.json({ ok: false, error: 'Usuario no autenticado' });
  }

  const sql = 'INSERT INTO resultados (usuario_id, juego, puntaje, tiempo, fecha) VALUES (?, ?, ?, ?, NOW())';
  db.query(sql, [usuarioId, juego, puntaje, tiempo], (err, result) => {
    if (err) {
      console.error("Error al guardar resultado:", err);
      return res.json({ ok: false });
    }
    res.json({ ok: true });
  });
});

// =====================
// LISTA DE RESULTADOS (RANKING GENERAL)
// =====================
app.get('/admin/resultados', requireAdmin, (req, res) => {
  const sql = `
    SELECT 
      u.id,
      u.nombre,
      u.apellido,
      SUM(r.puntaje) AS total_puntaje,
      SUM(r.tiempo_segundos) AS total_tiempo
    FROM resultados_juegos r
    JOIN usuarios u ON r.usuario_id = u.id
    GROUP BY u.id, u.nombre, u.apellido
    ORDER BY total_puntaje DESC, total_tiempo ASC;
  `;

  db.query(sql, (err, ranking) => {
    if (err) {
      console.error("❌ Error obteniendo ranking:", err);
      return res.status(500).send("Error al cargar resultados.");
    }

    console.log("✅ Ranking generado:", ranking.length, "usuarios encontrados.");

    res.render('resultados', {
      title: 'Resultados',
      user: req.session.user,
      ranking
    });
  });
});


// ==========================
// Función para contar visitas
// ==========================
function contarVisita(nombreVista) {
  const sql = `
    INSERT INTO visitas (vista, contador)
    VALUES (?, 1)
    ON DUPLICATE KEY UPDATE contador = contador + 1
  `;
  db.query(sql, [nombreVista], (err) => {
    if (err) console.error("Error al contar visita en " + nombreVista, err);
  });
}


// =====================
// MINIGAME (Ranking + contador)
// =====================
app.get('/minigame', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  // contar visita de esta vista
  contarVisita("minigame");

  const sql = `
    SELECT u.id, u.nombre, u.apellido, r.juego, r.puntaje, r.tiempo, r.fecha
    FROM resultados r
    JOIN usuarios u ON r.usuario_id = u.id
    ORDER BY u.id, r.fecha DESC
  `;
  db.query(sql, (err, rows) => {
    if (err) {
      console.error("Error obteniendo resultados:", err);
      return res.status(500).send("Error al cargar resultados.");
    }

    // Agrupar resultados por usuario
    const usuariosMap = {};
    rows.forEach(r => {
      if (!usuariosMap[r.id]) {
        usuariosMap[r.id] = {
          id: r.id,
          nombre: r.nombre,
          apellido: r.apellido,
          juegos: [],
          total_puntaje: 0,
          total_tiempo: 0
        };
      }
      usuariosMap[r.id].juegos.push(r);
      usuariosMap[r.id].total_puntaje += r.puntaje;
      usuariosMap[r.id].total_tiempo += r.tiempo;
    });

    // Ordenar ranking
    const ranking = Object.values(usuariosMap).sort((a, b) => {
      if (b.total_puntaje === a.total_puntaje) {
        return a.total_tiempo - b.total_tiempo; // desempate por tiempo
      }
      return b.total_puntaje - a.total_puntaje;
    });

    res.render('minigame', {
      title: 'Minijuegos',
      user: req.session.user,
      ranking
    });
  });
});


// =========================
// PANEL ADMIN: CONTADOR DE VISITAS
// =========================
app.get('/admin/contador_vistas', requireAdmin, (req, res) => {
  // Mapeo de vistas → nombre visible + orden
  const nombresBonitos = {
    "dashboard": { nombre: "Página principal", orden: 1 },
    "mensajes": { nombre: "Bandeja de mensajes", orden: 2 },
    "historia": { nombre: "Historia de la Brigada", orden: 3 },
    "proyeccion-social": { nombre: "Actividades de proyección social", orden: 4 },
    "gestion-riesgo": { nombre: "Actividades de gestión de riesgo", orden: 5 },
    "actos-civicos": { nombre: "Actividades de actos cívicos", orden: 6 },
    "medio-ambiente": { nombre: "Actividades de medio ambiente", orden: 7 },
    "minigame": { nombre: "Minijuegos", orden: 8 },
    "assistant": { nombre: "Asistente virtual", orden: 9 },
    "requisitos": { nombre: "Información para prestar servicio militar", orden: 10 }
  };

  db.query("SELECT * FROM visitas", (err, rows) => {
    if (err) {
      console.error("Error obteniendo visitas:", err);
      return res.status(500).send("Error al cargar visitas");
    }

    // Transformar y ordenar resultados
    const visitas = rows
      .map(v => ({
        ...v,
        nombre: nombresBonitos[v.vista]?.nombre || v.vista,
        orden: nombresBonitos[v.vista]?.orden || 999
      }))
      .sort((a, b) => a.orden - b.orden);

    res.render('contador_vistas', {
      title: 'Contador de Visitas',
      user: req.session.user,
      visitas
    });
  });
});

app.post('/admin/eliminar-multiple', (req, res) => {
  let ids = req.body.ids || req.body['ids[]'];

  // Asegurar que sea siempre array
  if (!ids) return res.redirect('/admin/publicar');
  if (!Array.isArray(ids)) ids = [ids];

  const sql = "DELETE FROM publicaciones WHERE id IN (?)";
  db.query(sql, [ids], (err) => {
    if (err) {
      console.error("Error eliminando múltiples:", err);
      return res.status(500).send("Error al eliminar publicaciones.");
    }
    res.redirect('/admin/publicar');
  });
});


// ARRANQUE DEL SERVIDOR
// -----------------------------
const PORT = process.env.PORT || 3000; // 👈 usa 3000, Nginx redirige desde 80
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
});


