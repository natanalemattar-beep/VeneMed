const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'database.db');
const TOKEN_SECRET = 'veneMedSecret2026';

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) return console.error('Error al conectar DB:', err.message);
  console.log('Conectado a SQLite');
});

db.run(`CREATE TABLE IF NOT EXISTS pacientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  cedula TEXT UNIQUE NOT NULL,
  fecha_nacimiento TEXT,
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  historial_medico TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS recetas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL,
  medicamento TEXT NOT NULL,
  dosis TEXT NOT NULL,
  frecuencia TEXT NOT NULL,
  duracion TEXT,
  fecha_emision DATETIME DEFAULT CURRENT_TIMESTAMP,
  doctor TEXT,
  notas TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE
)`);

function generarToken() {
  return crypto.randomBytes(20).toString('hex');
}

let tokenValido = null;

function authMiddleware(req, res, next) {
  if (!tokenValido) return res.status(401).json({ error: 'No hay sesión activa. Use POST /auth/login' });
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${tokenValido}`) {
    return res.status(401).json({ error: 'Token inválido o ausente' });
  }
  next();
}

app.post('/auth/login', (req, res) => {
  const { usuario, clave } = req.body;
  if (usuario === 'admin' && clave === 'admin123') {
    tokenValido = generarToken();
    return res.json({ token: tokenValido, mensaje: 'Autenticación exitosa' });
  }
  res.status(401).json({ error: 'Credenciales inválidas' });
});

app.post('/auth/logout', (req, res) => {
  tokenValido = null;
  res.json({ mensaje: 'Sesión cerrada' });
});

app.get('/pacientes', authMiddleware, (req, res) => {
  db.all('SELECT * FROM pacientes ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/pacientes/:id', authMiddleware, (req, res) => {
  db.get('SELECT * FROM pacientes WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json(row);
  });
});

app.post('/pacientes', authMiddleware, (req, res) => {
  const { nombre, apellido, cedula, fecha_nacimiento, direccion, telefono, email, historial_medico } = req.body;
  if (!nombre || !apellido || !cedula) {
    return res.status(400).json({ error: 'nombre, apellido y cedula son obligatorios' });
  }
  db.run(
    `INSERT INTO pacientes (nombre, apellido, cedula, fecha_nacimiento, direccion, telefono, email, historial_medico)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [nombre, apellido, cedula, fecha_nacimiento || null, direccion || null, telefono || null, email || null, historial_medico || null],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, mensaje: 'Paciente creado' });
    }
  );
});

app.put('/pacientes/:id', authMiddleware, (req, res) => {
  const { nombre, apellido, cedula, fecha_nacimiento, direccion, telefono, email, historial_medico } = req.body;
  db.run(
    `UPDATE pacientes SET nombre=?, apellido=?, cedula=?, fecha_nacimiento=?, direccion=?, telefono=?, email=?, historial_medico=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [nombre, apellido, cedula, fecha_nacimiento, direccion, telefono, email, historial_medico, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
      res.json({ mensaje: 'Paciente actualizado' });
    }
  );
});

app.delete('/pacientes/:id', authMiddleware, (req, res) => {
  db.run('DELETE FROM pacientes WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json({ mensaje: 'Paciente eliminado' });
  });
});

app.get('/pacientes/:id/recetas', authMiddleware, (req, res) => {
  db.all('SELECT * FROM recetas WHERE paciente_id = ? ORDER BY fecha_emision DESC', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/recetas', authMiddleware, (req, res) => {
  const { paciente_id, medicamento, dosis, frecuencia, duracion, doctor, notas } = req.body;
  if (!paciente_id || !medicamento || !dosis || !frecuencia) {
    return res.status(400).json({ error: 'paciente_id, medicamento, dosis y frecuencia son obligatorios' });
  }
  db.get('SELECT id FROM pacientes WHERE id = ?', [paciente_id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Paciente no encontrado' });
    db.run(
      `INSERT INTO recetas (paciente_id, medicamento, dosis, frecuencia, duracion, doctor, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [paciente_id, medicamento, dosis, frecuencia, duracion || null, doctor || null, notas || null],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, mensaje: 'Receta creada' });
      }
    );
  });
});

app.put('/recetas/:id', authMiddleware, (req, res) => {
  const { medicamento, dosis, frecuencia, duracion, doctor, notas } = req.body;
  db.run(
    `UPDATE recetas SET medicamento=?, dosis=?, frecuencia=?, duracion=?, doctor=?, notas=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [medicamento, dosis, frecuencia, duracion, doctor, notas, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Receta no encontrada' });
      res.json({ mensaje: 'Receta actualizada' });
    }
  );
});

app.delete('/recetas/:id', authMiddleware, (req, res) => {
  db.run('DELETE FROM recetas WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Receta no encontrada' });
    res.json({ mensaje: 'Receta eliminada' });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`VeneMed corriendo en http://localhost:${PORT}`);
});
