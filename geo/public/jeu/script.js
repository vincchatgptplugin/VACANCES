/****************************************************
 * script.js : Jeu de devinettes (images + objets)
 ****************************************************/

// Variables globales
let selectedTime = 0;
let score = 0;
let selectedImage = null; // Image choisie
let selectedObjects = []; // Objets sélectionnés dans l'image
let allZones = []; // Toutes les zones (rectangles) des objets sélectionnés
let timer;
let timeRemaining = 0;
let currentZone = null; // Zone actuelle en cours de traitement
let allData = []; // Toutes les données (chargées dynamiquement)

// DOM Elements
const imageSelectionContainer = document.getElementById('image-selection');
const gameContainer = document.getElementById('game-container');
const imageElement = document.getElementById('image');
const mask = document.getElementById('mask');
const buttonsContainer = document.getElementById('buttons-container');
const scoreElement = document.getElementById('score');
const timerElement = document.getElementById('timer');
const replayContainer = document.getElementById('replay-container');

// Charger les données depuis le backend
fetch('/api/data-samples')
  .then(res => {
    if (!res.ok) throw new Error('Erreur lors du chargement des données');
    return res.json();
  })
  .then(data => {
    allData = data; // Stocker les données
    console.log('Données chargées :', allData);
  })
  .catch(err => {
    console.error('Erreur :', err.message);
    alert('Impossible de charger les données du jeu.');
  });

// Fonction pour démarrer le jeu
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#time-selection .button').forEach(button => {
    button.addEventListener('click', () => {
      const time = parseInt(button.dataset.time, 10);
      showImageSelection(time);
    });
  });

  document.getElementById('replay-button').addEventListener('click', restartGame);
});

// Étape 1 : Sélection de l'image
function showImageSelection(time) {
  selectedTime = time;
  timeRemaining = selectedTime * 60;

  document.getElementById('time-selection').style.display = 'none';
  imageSelectionContainer.style.display = 'flex';
  imageSelectionContainer.innerHTML = ''; // Réinitialiser

  const images = Array.from(new Set(allData.map(item => item.file))); // Images uniques

  images.forEach(imageFile => {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('button');
    button.innerText = imageFile.replace('.png', ''); // Sans extension
    button.onclick = () => handleImageSelection(imageFile);
    imageSelectionContainer.appendChild(button);
  });
}

// Gérer la sélection d'une image
function handleImageSelection(imageFile) {
  selectedImage = imageFile;

  selectedObjects = allData.filter(item => item.file === selectedImage);
  console.log('Objets pour l\'image sélectionnée :', selectedObjects);

  imageSelectionContainer.style.display = 'none';
  showObjectSelection();
}

// Étape 2 : Sélection des objets
function showObjectSelection() {
  imageSelectionContainer.style.display = 'flex';
  imageSelectionContainer.innerHTML = ''; // Réinitialiser

  const form = document.createElement('form');
  selectedObjects.forEach(item => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `checkbox-${item.title}`;
    checkbox.value = item.title;
    checkbox.name = 'selectedObjects';

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.innerText = item.title;

    const wrapper = document.createElement('div');
    wrapper.appendChild(checkbox);
    wrapper.appendChild(label);

    form.appendChild(wrapper);
  });

  const submitButton = document.createElement('button');
  submitButton.type = 'button';
  submitButton.innerText = 'Valider';
  submitButton.classList.add('button');
  submitButton.addEventListener('click', handleObjectSelection);

  imageSelectionContainer.appendChild(form);
  imageSelectionContainer.appendChild(submitButton);
}

// Gérer la sélection des objets
function handleObjectSelection() {
  const selectedTitles = Array.from(
    document.querySelectorAll('input[name="selectedObjects"]:checked')
  ).map(checkbox => checkbox.value);

  if (selectedTitles.length === 0) {
    alert('Veuillez sélectionner au moins un objet.');
    return;
  }

  allZones = selectedObjects
    .filter(obj => selectedTitles.includes(obj.title))
    .flatMap(obj => obj.zones.map(zone => ({ ...zone, offset: obj.offset, file: obj.file })));

  console.log('Zones sélectionnées :', allZones);

  imageSelectionContainer.style.display = 'none';
  startGame();
}

// Démarrer le jeu
function startGame() {
  gameContainer.style.display = 'block';
  buttonsContainer.style.display = 'flex';

  loadNextZone();
  startTimer();
}

// Chronomètre
function startTimer() {
  updateTimerDisplay();
  timer = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();
    if (timeRemaining <= 0) {
      endGame();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  timerElement.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Charger une zone aléatoire
function loadNextZone() {
  if (allZones.length === 0) {
    console.log('Aucune zone disponible.');
    return;
  }

  // Sélectionner une zone aléatoire
  currentZone = allZones[Math.floor(Math.random() * allZones.length)];

  // Charger l'image
  imageElement.src = `/images/${currentZone.file}`;
  imageElement.onload = () => {
    // Appliquer la transition sur le repositionnement
    imageElement.style.transform = `translate(${currentZone.offset.x}px, ${currentZone.offset.y}px)`;

    // Récupérer les dimensions réelles de l'image
    const naturalWidth = imageElement.naturalWidth;
    const naturalHeight = imageElement.naturalHeight;
    const displayedWidth = imageElement.clientWidth;
    const displayedHeight = imageElement.clientHeight;

    // Calculer les échelles entre les dimensions naturelles et affichées
    const scaleX = displayedWidth / naturalWidth;
    const scaleY = displayedHeight / naturalHeight;

    // Ajuster les coordonnées du masque
    const left = parseFloat(currentZone.coordinates.left) * scaleX;
    const top = parseFloat(currentZone.coordinates.top) * scaleY;
    const width = parseFloat(currentZone.coordinates.width) * scaleX;
    const height = parseFloat(currentZone.coordinates.height) * scaleY;

    mask.style.left = `${left}px`;
    mask.style.top = `${top}px`;
    mask.style.width = `${width}px`;
    mask.style.height = `${height}px`;
    mask.innerHTML = '<i>Caché</i>';

    generateChoices(currentZone);
  };
}



// Générer les choix
function generateChoices(zone) {
  buttonsContainer.innerHTML = '';

  const correctChoice = zone.word;

  let choices;
  if (Array.isArray(zone.propositions) && zone.propositions.length > 0) {
    // Utiliser strictement les propositions fournies
    const uniq = new Set(zone.propositions.filter(Boolean));
    uniq.add(correctChoice); // garantit que la bonne réponse est présente
    choices = Array.from(uniq);
  } else {
    // Fallback : aléatoire comme avant (5 boutons au total)
    const otherChoices = shuffle(allZones.filter(z => z.word !== correctChoice)).map(z => z.word);
    choices = [...new Set([correctChoice, ...otherChoices])].slice(0, 5);
  }

  shuffle(choices).forEach(label => {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('button');
    button.innerText = label;
    button.addEventListener('click', () => handleChoice(button, label === correctChoice));
    buttonsContainer.appendChild(button);
  });
}


// Gérer un choix
function handleChoice(button, isCorrect) {
  if (isCorrect) {
    button.classList.add('correct');
    score++;
    scoreElement.innerText = score;
    setTimeout(loadNextZone, 1000); // Charger la prochaine zone après 1 seconde
  } else {
    button.classList.add('wrong');

    // Trouver le bouton correspondant à la bonne réponse
    const correctButton = Array.from(buttonsContainer.children).find(btn =>
      btn.innerText === currentZone.word
    );

    if (correctButton) {
      // Afficher le bon bouton en vert
      correctButton.classList.add('correct');

      // Ajouter un événement pour attendre que l'utilisateur clique dessus
      correctButton.addEventListener('click', () => {
        setTimeout(loadNextZone, 1000); // Charger la prochaine zone après 1 seconde
      }, { once: true }); // `once: true` pour que l'événement soit déclenché une seule fois
    }
  }
}


// Terminer le jeu
function endGame() {
  clearInterval(timer);
  gameContainer.style.display = 'none';
  buttonsContainer.style.display = 'none';
  replayContainer.style.display = 'block';
}

// Redémarrer le jeu
function restartGame() {
  score = 0;
  scoreElement.innerText = score;
  replayContainer.style.display = 'none';
  document.getElementById('time-selection').style.display = 'flex';
  imageSelectionContainer.innerHTML = '';
}

// Mélanger un tableau
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
