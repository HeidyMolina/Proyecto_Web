// routes/juegos.js
const express = require('express');
const router = express.Router();

router.get('/carrera-requisitos', (req, res) => {
  res.render('carrera_requisitos', {
    title: '', // ← Esto previene el error en layout.ejs
    user: req.session.user // ← Opcional si usas sesión en el navbar
  });
});

// Nueva ruta: Quiz del Reglamento
router.get('/reglamento-quiz', (req, res) => {
  res.render('reglamento_quiz', {
    title: '',           // evita error en layout.ejs
    user: req.session?.user || null
  });
});

// Nueva ruta: Quiz Entrenamiento Físico
router.get('/entrenamiento-quiz', (req, res) => {
  res.render('entrenamiento_quiz', {
    title: 'Quiz Entrenamiento Físico',
    user: req.session?.user || null
  });
});

// Nueva ruta: Quiz Sanidad y Primeros Auxilios
router.get('/quiz_sanidad', (req, res) => {
  res.render('quiz_sanidad', {
    title: 'Quiz Sanidad y Primeros Auxilios',
    user: req.session?.user || null
  });
});


// Nueva ruta: Memoria
router.get('/memoria', (req, res) => {
  res.render('memoria', {
    title: 'Juego de Memoria',
    user: req.session?.user || null
  });
});


// Nueva ruta: Quiz Mapas
router.get('/quiz_mapas', (req, res) => {
  res.render('quiz_mapas', {
    title: 'Quiz de Mapas',
    user: req.session?.user || null
  });
});


// Nueva ruta: Quiz de Camuflaje
router.get('/quiz_camuflaje', (req, res) => {
  res.render('quiz_camuflaje', {
    title: 'Quiz de Camuflaje',
    user: req.session?.user || null
  });
});

// Nueva ruta: Quiz de Derechos
router.get('/quiz_derechos', (req, res) => {
  res.render('quiz_derechos', {
    title: 'Quiz de Derechos',
    user: req.session?.user || null
  });
});

// Nueva ruta: Quiz de Valores
router.get('/quiz_valores', (req, res) => {
  res.render('quiz_valores', {
    title: 'Quiz de Valores',
    user: req.session?.user || null
  });
});

// Nueva ruta: Quiz de Grados Militares
router.get('/quiz_grados', (req, res) => {
  res.render('quiz_grados', {
    title: 'Quiz de Grados Militares',
    user: req.session?.user || null
  });
});



module.exports = router;
