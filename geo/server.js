/*******************************************************
 * server.js
 *******************************************************/
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

// Servir le dossier public
app.use(express.static(path.join(__dirname, 'public')));

// Servir le dossier images à l'URL /images
app.use('/images', express.static(path.join(__dirname, 'images')));

// Route pour récupérer la liste des images
app.get('/list-images', (req, res) => {
  const imagesFolder = path.join(__dirname, 'images');
  fs.readdir(imagesFolder, (err, files) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    // Filtrer seulement les extensions qui nous intéressent
    const imageFiles = files.filter(file =>
      file.toLowerCase().endsWith('.png') ||
      file.toLowerCase().endsWith('.jpg') ||
      file.toLowerCase().endsWith('.jpeg') ||
      file.toLowerCase().endsWith('.gif')
    );
    res.json(imageFiles);
  });
});

// Route pour récupérer les données du fichier data-sample.json
app.get('/api/data-samples', (req, res) => {
  const filePath = path.join(__dirname, 'data-samples.json');

  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, 'utf8');
    res.json(JSON.parse(data));
  } else {
    res.status(404).json({ error: 'Fichier data-sample.json introuvable' });
  }
});

app.post('/api/new-sample', express.json(), (req, res) => {
  const data = req.body;

  if (!data || !data.title || !data.zones) {
    return res.status(400).json({ error: 'Données invalides ou incomplètes.' });
  }

  // Chemin du fichier de sauvegarde
  const filePath = path.join(__dirname, 'data-samples.json');

  // Lire le fichier existant ou initialiser une liste vide
  let samples = [];
  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    samples = JSON.parse(fileContent);
  }

  // Ajouter les nouvelles données
  samples.push(data);

  // Écrire dans le fichier
  fs.writeFileSync(filePath, JSON.stringify(samples, null, 2), 'utf8');

  console.log('Données sauvegardées :', data);
  res.status(200).json({ success: true, message: 'Données enregistrées avec succès.' });
});

// (EXEMPLE) Si vous avez besoin de routes pour sauvegarder data.json, 
// vous pouvez les ajouter ici : POST /images, PUT /images/:index, etc.

// Démarrage du serveur
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
  console.log(`Serveur démarré sur http://localhost:${PORT}/jeu/jeu.html`);
});

