const express = require('express');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const session = require('express-session');
const multer = require('multer');

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configuration de la session
app.use(session({
  secret: 'valo-secret',
  resave: false,
  saveUninitialized: true
}));

// Dossier temporaire pour les uploads
const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
const upload = multer({ dest: tmpDir });
const uploadFields = upload.fields([
  { name: 'csvFile', maxCount: 1 },
  { name: 'jsonFile', maxCount: 1 }
]);

// Parse CSV
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        // Mélange aléatoirement les réponses pour anonymiser l'ordre
        for (let i = results.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [results[i], results[j]] = [results[j], results[i]];
        }
        resolve(results);
      })
      .on('error', reject);
  });
}

// Helper pour lire le JSON
function parseJSON(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) return reject(err);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Détection intelligente du type de question à partir du JSON ET des réponses
function detectTypeSmart(q, values) {
  // Prend en compte le JSON d'abord
  if (q) {
    if (Array.isArray(q.choices) && q.multiple === true) return 'multiple';
    if (Array.isArray(q.choices) && q.multiple === false) return 'single';
  }
  // Sinon, on analyse les réponses
  if (values && values.every(v => /\d{4}-\d{2}-\d{2}/.test(v))) return 'date';
  return 'text';
}

// Fonction utilitaire pour normaliser les questions (enlève espaces, accents, casse, ponctuation)
function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}

// Fonction utilitaire pour extraire le numéro de question d'une clé ou d'un objet question
function extractNumber(str) {
  const m = (str && str.match(/\b(\d{1,3})\b/));
  return m ? parseInt(m[1], 10) : null;
}

// Nettoyage du dossier tmp à la fermeture de l'application
function clearTmpDir() {
  if (fs.existsSync(tmpDir)) {
    fs.readdirSync(tmpDir).forEach(file => {
      const filePath = path.join(tmpDir, file);
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Erreur lors de la suppression du fichier temporaire:', filePath, err);
      }
    });
  }
}

process.on('SIGINT', () => {
  clearTmpDir();
  process.exit();
});
process.on('SIGTERM', () => {
  clearTmpDir();
  process.exit();
});

// Redirige la racine vers la page de configuration
app.get('/', (req, res) => {
  res.redirect('/config');
});

// Page de configuration (GET)
app.get('/config', (req, res) => {
  // Réinitialise les chemins de fichiers à chaque accès à la config
  req.session.csvPath = '';
  req.session.jsonPath = '';
  res.render('config', {
    csvPath: '',
    jsonPath: '',
    themeColor: req.session.themeColor || '#4285F4'
  });
});

// Traitement du formulaire de configuration (POST)
app.post('/config', uploadFields, async (req, res) => {
  try {
    // Gestion des fichiers uploadés ou chemins
    let csvPath = req.body.csvPath || (req.files['csvFile'] ? req.files['csvFile'][0].path : '');
    let jsonPath = req.body.jsonPath || (req.files['jsonFile'] ? req.files['jsonFile'][0].path : '');
    if (!csvPath || !jsonPath) {
      return res.status(400).send('CSV et JSON requis');
    }
    req.session.csvPath = csvPath;
    req.session.jsonPath = jsonPath;
    req.session.themeColor = req.body.themeColor || '#4285F4';
    res.redirect('/index');
  } catch (err) {
    res.status(500).send('Erreur lors du chargement des fichiers : ' + err.message);
  }
});

// Page d'affichage des résultats
app.get('/index', async (req, res) => {
  try {
    const csvPath = req.session.csvPath;
    const jsonPath = req.session.jsonPath;
    const themeColor = req.session.themeColor || '#4285F4';
    if (!csvPath || !jsonPath) {
      return res.redirect('/config');
    }
    // Extraction des questions
    const questions = await parseJSON(jsonPath);
    // Extraction des réponses
    const responses = await parseCSV(csvPath);
    // Préparation des résultats pour la vue
    const results = [];
    const chartDataList = [];
    // Création d'une map par numéro de question
    const questionNumMap = {};
    questions.forEach(q => {
      if (q.number != null) questionNumMap[q.number] = q;
    });
    // Création d'une map normalisée pour fallback
    const questionMap = {};
    questions.forEach(q => {
      questionMap[normalize(q.question)] = q;
    });
    // Pour chaque colonne/question du CSV (hors horodatage)
    const keys = Object.keys(responses[0] || {}).filter(k => !/^horodat(age|eur|or)/i.test(k));
    keys.forEach((key, idx) => {
      let q = null;
      // Essaye d'abord par numéro
      const num = extractNumber(key);
      if (num && questionNumMap[num]) {
        q = questionNumMap[num];
      } else {
        // Sinon fallback sur le texte
        q = questionMap[normalize(key)] || null;
      }
      let values = responses.map(r => r[key]).filter(v => v && v.trim() !== '');
      // Shuffle les réponses pour cette question
      for (let i = values.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [values[i], values[j]] = [values[j], values[i]];
      }
      let type = detectTypeSmart(q, values);
      // Si le JSON contient un type de graphique forcé, on l'applique
      let forcedChartType = q && q.chartType ? q.chartType : null;
      // Préparation des données pour le graphique
      let chartData = null;
      if (q && Array.isArray(q.choices)) {
        // Détection séquence numérique logique
        const allNumeric = q.choices.every(c => /^-?\d+(\.\d+)?$/.test(c));
        let sortedChoices = q.choices;
        if (allNumeric) {
          sortedChoices = q.choices.map(Number).sort((a, b) => a - b).map(String);
        }
        if (q.multiple) {
          // Multiple: barres
          const counts = {};
          sortedChoices.forEach(c => counts[c] = 0);
          values.forEach(v => {
            v.split(/[;,]/).map(s => s.trim()).forEach(choice => {
              if (counts.hasOwnProperty(choice)) counts[choice]++;
            });
          });
          chartData = {
            chartType: forcedChartType || (allNumeric ? 'bar-vertical' : 'bar'),
            labels: sortedChoices,
            data: sortedChoices.map(c => counts[c]),
            totalRespondents: values.length
          };
          type = forcedChartType ? 'multiple' : 'multiple';
        } else {
          // Single: camembert ou barres si numérique logique
          const counts = {};
          sortedChoices.forEach(c => counts[c] = 0);
          values.forEach(v => {
            if (counts.hasOwnProperty(v)) counts[v]++;
          });
          chartData = {
            chartType: forcedChartType || (allNumeric ? 'bar-vertical' : 'pie'),
            labels: sortedChoices,
            data: sortedChoices.map(c => counts[c]),
            totalRespondents: values.length
          };
          type = forcedChartType ? 'single' : (allNumeric ? 'single-bar' : 'single');
        }
      } else if (type === 'date') {
        // Regroupe les dates par mois/année et liste les jours
        const dateGroups = {};
        values.forEach(v => {
          // Attend un format AAAA-MM-JJ
          const m = v.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (m) {
            const year = m[1];
            const month = m[2];
            const day = m[3];
            // Format label: "mois année" en français
            const months = [
              '', 'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'
            ];
            const label = `${months[parseInt(month, 10)]} ${year}`;
            if (!dateGroups[label]) dateGroups[label] = [];
            dateGroups[label].push(parseInt(day, 10));
          }
        });
        // Trie les groupes par date réelle
        const dateArr = Object.keys(dateGroups)
          .map(label => {
            // Pour trier, on reconstruit une date fictive au 1er du mois
            const m = label.match(/([a-zéû.]+) (\d{4})/i);
            let sortKey = 0;
            if (m) {
              const months = {
                'janv.': 1, 'févr.': 2, 'mars': 3, 'avr.': 4, 'mai': 5, 'juin': 6, 'juil.': 7, 'août': 8, 'sept.': 9, 'oct.': 10, 'nov.': 11, 'déc.': 12
              };
              sortKey = parseInt(m[2], 10) * 100 + (months[m[1]] || 0);
            }
            return { label, days: dateGroups[label].sort((a,b)=>a-b), sortKey };
          })
          .sort((a, b) => a.sortKey - b.sortKey);
        results.push({ question: key, type: forcedChartType ? forcedChartType : 'date', values: dateArr });
        chartDataList.push(null);
        return;
      } else {
        // Texte libre ou texte à barres si doublons
        // On compte les occurrences de chaque réponse
        const counts = {};
        values.forEach(v => {
          counts[v] = (counts[v] || 0) + 1;
        });
        // Si au moins une réponse apparaît 3 fois ou plus, on affiche un bar chart
        const hasDuplicates = Object.values(counts).some(c => c > 3);
        if (forcedChartType === 'text') {
          chartData = null;
          type = 'text';
        } else if (forcedChartType) {
          chartData = {
            chartType: forcedChartType,
            labels: Object.keys(counts),
            data: Object.values(counts),
            totalRespondents: values.length
          };
          type = forcedChartType;
        } else if (hasDuplicates) {
          chartData = {
            chartType: 'bar-vertical',
            labels: Object.keys(counts),
            data: Object.values(counts),
            totalRespondents: values.length
          };
          type = 'text-bar';
        } else {
          chartData = null;
          type = 'text';
        }
      }
      results.push({ question: key, type, values });
      chartDataList.push(chartData);
    });

    // Suppression des fichiers temporaires après traitement
    const isTmp = (filePath) => filePath && filePath.startsWith(tmpDir);
    try {
      if (isTmp(csvPath) && fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
    } catch (e) {
      console.error('Erreur suppression fichier tmp CSV:', csvPath, e);
    }
    try {
      if (isTmp(jsonPath) && fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    } catch (e) {
      console.error('Erreur suppression fichier tmp JSON:', jsonPath, e);
    }

    res.render('index', { results, chartDataList, themeColor });
  } catch (err) {
    res.status(500).send('Erreur lors de l\'affichage des résultats : ' + err.message);
  }
});

app.listen(port, () => {
  console.log(`App running at http://localhost:${port}`);
});
