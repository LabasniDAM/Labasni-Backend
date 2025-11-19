const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const path = require('path');

const app = express();

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'photo' + ext);
  }
});

const upload = multer({ storage });

app.post('/detect', upload.single('photo'), (req, res) => {
  const ext = path.extname(req.file.originalname);
  const imagePath = path.join(__dirname, 'uploads', 'photo' + ext);

  exec(`python3 detect.py --image "${imagePath}"`, (error, stdout, stderr) => {
    if (error || stderr) {
      console.error('Erreur Python :', stderr || error);
      return res.status(500).json({ error: 'Erreur Python', details: stderr || error.message });
    }

    try {
      const result = JSON.parse(stdout.trim());
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: 'JSON invalide', raw: stdout });
    }
  });
});

app.listen(3000, () => {
  console.log('Backend prêt → http://localhost:3000');
});