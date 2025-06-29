const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// PostgreSQL connection pool
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'user',
  host: process.env.POSTGRES_HOST || 'db', // 'db' is the service name in docker-compose
  database: process.env.POSTGRES_DB || 'cars_db',
  password: process.env.POSTGRES_PASSWORD || 'password',
  port: 5432,
});

// Create 'cars' table if it doesn't exist
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
  pool.query(`
    CREATE TABLE IF NOT EXISTS cars (
      id SERIAL PRIMARY KEY,
      brand VARCHAR(255) NOT NULL,
      model VARCHAR(255) NOT NULL,
      year INTEGER NOT NULL,
      image_url TEXT
    );
  `).then(() => console.log('Cars table ensured.')).catch(err => console.error('Error ensuring table:', err));
});

// Middleware for parsing JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'frontend' directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Multer storage for handling file uploads (in-memory for this example, then convert to base64)
const storage = multer.memoryStorage(); // Store image in memory
const upload = multer({ storage: storage });

// API Endpoints

// Get all cars
app.get('/api/cars', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cars ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching cars:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get car by ID
app.get('/api/cars/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM cars WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Car not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching car:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Add a new car
app.post('/api/cars', upload.single('image'), async (req, res) => {
  const { brand, model, year } = req.body;
  let imageUrl = null;

  if (req.file) {
    // Convert image to base64
    imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  }

  if (!imageUrl) {
    return res.status(400).json({ error: 'Image is required for new car entry.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO cars (brand, model, year, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [brand, model, year, imageUrl]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding car:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update an existing car
app.put('/api/cars/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { brand, model, year } = req.body;
  let imageUrl = null;

  try {
    // Get existing car data to preserve image if not updated
    const existingCar = await pool.query('SELECT image_url FROM cars WHERE id = $1', [id]);
    if (existingCar.rows.length === 0) {
      return res.status(404).json({ error: 'Car not found' });
    }
    imageUrl = existingCar.rows[0].image_url;

    if (req.file) {
      // New image uploaded, convert to base64
      imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const result = await pool.query(
      'UPDATE cars SET brand = $1, model = $2, year = $3, image_url = $4 WHERE id = $5 RETURNING *',
      [brand, model, year, imageUrl, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating car:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete a car
app.delete('/api/cars/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM cars WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Car not found' });
    }
    res.json({ message: 'Car deleted successfully' });
  } catch (err) {
    console.error('Error deleting car:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});
