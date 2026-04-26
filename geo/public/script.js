/****************************************************
 * script.js
 ****************************************************/

//
// ---------- Éléments Étape 1
//
const step1 = document.getElementById('step1');
const imageSelect = document.getElementById('imageSelect');
const titleInput = document.getElementById('titleInput');
const wordsInput = document.getElementById('wordsInput');
const btnNext1 = document.getElementById('btnNext1');

//
// ---------- Éléments Étape 2
//
const step2 = document.getElementById('step2');
const imageWrapper = document.getElementById('imageWrapper');
const pannableImage = document.getElementById('pannableImage');
const btnLockPosition = document.getElementById('btnLockPosition');

//
// ---------- Éléments Étape 3
//
const step3 = document.getElementById('step3');
const currentWordDisplay = document.getElementById('currentWordDisplay');
const btnAnnuler = document.getElementById('btnAnnuler');
const imageWrapper3 = document.getElementById('imageWrapper3');
const selectableImage = document.getElementById('selectableImage');
const mask = document.getElementById('mask');

//
// ---------- Éléments Étape 4
//
const step4 = document.getElementById('step4');
const summaryPre = document.getElementById('summaryPre');
const btnSendToServer = document.getElementById('btnSendToServer');
const serverResponse = document.getElementById('serverResponse');

//
// ---------- Variables globales
//
let chosenFile = '';
let titleValue = '';
let wordArray = [];

// Étape 2 (pan + clamp)
let offsetX = 0, offsetY = 0;
let isDragging = false;
let startX = 0, startY = 0;
let containerWidth = 1000;
let containerHeight = 500;
let imageWidth = 0;
let imageHeight = 0;

// Étape 3 (séquentiel)
let selectedZones = [];
let currentWordIndex = 0;

// Dessin rectangle
let drawing = false;
let startRectX = 0;
let startRectY = 0;

/******************************************************
 * Au chargement, récupérer la liste des images
 ******************************************************/
window.addEventListener('DOMContentLoaded', () => {
  fetch('/list-images')
    .then(res => res.json())
    .then(files => {
      files.forEach(file => {
        const opt = document.createElement('option');
        opt.value = file;
        opt.textContent = file;
        imageSelect.appendChild(opt);
      });
    })
    .catch(err => console.error('Erreur /list-images :', err));
});

/******************************************************
 * ÉTAPE 1 -> Étape 2
 ******************************************************/
btnNext1.addEventListener('click', () => {
  chosenFile = imageSelect.value;
  titleValue = titleInput.value.trim();
  const rawWords = wordsInput.value.trim();

  if (!chosenFile || !titleValue || !rawWords) {
    alert('Veuillez remplir tous les champs (image, titre, mots).');
    return;
  }
  wordArray = rawWords.split(',').map(w => w.trim()).filter(Boolean);
  if (wordArray.length === 0) {
    alert('Liste de mots invalide ?');
    return;
  }

  step1.style.display = 'none';
  step2.style.display = 'block';

  // Charger l'image
  pannableImage.src = `/images/${chosenFile}`;
  offsetX = 0;
  offsetY = 0;
  pannableImage.style.transform = 'translate(0px, 0px)';

  // Désactiver drag natif
  pannableImage.addEventListener('dragstart', e => e.preventDefault());

  pannableImage.addEventListener('load', () => {
    imageWidth = pannableImage.clientWidth;
    imageHeight = pannableImage.clientHeight;
    containerWidth = imageWrapper.clientWidth;   // 1000
    containerHeight = imageWrapper.clientHeight; // 500
  });

  activatePan();
});

/******************************************************
 * ÉTAPE 2 : Pan + Clamp
 ******************************************************/
function activatePan() {
  pannableImage.addEventListener('mousedown', panDown);
  document.addEventListener('mousemove', panMove);
  document.addEventListener('mouseup', panUp);
}
function deactivatePan() {
  pannableImage.removeEventListener('mousedown', panDown);
  document.removeEventListener('mousemove', panMove);
  document.removeEventListener('mouseup', panUp);
}

function panDown(e) {
  isDragging = true;
  pannableImage.style.cursor = 'grabbing';
  startX = e.clientX - offsetX;
  startY = e.clientY - offsetY;
}
function panMove(e) {
  if (!isDragging) return;

  offsetX = e.clientX - startX;
  offsetY = e.clientY - startY;

  // clamp X
  if (imageWidth > containerWidth) {
    offsetX = Math.min(offsetX, 0);
    offsetX = Math.max(offsetX, containerWidth - imageWidth);
  } else {
    offsetX = 0;
  }

  // clamp Y
  if (imageHeight > containerHeight) {
    offsetY = Math.min(offsetY, 0);
    offsetY = Math.max(offsetY, containerHeight - imageHeight);
  } else {
    offsetY = 0;
  }

  pannableImage.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
}
function panUp() {
  isDragging = false;
  pannableImage.style.cursor = 'grab';
}

btnLockPosition.addEventListener('click', () => {
  // Verrouiller
  deactivatePan();

  step2.style.display = 'none';
  step3.style.display = 'block';

  // Sélection image
  selectableImage.src = `/images/${chosenFile}`;
  // Même translation
  selectableImage.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  selectableImage.addEventListener('dragstart', e => e.preventDefault());

  // Init
  selectedZones = [];
  currentWordIndex = 0;
  loadCurrentWord(); // premier mot
});

/******************************************************
 * ÉTAPE 3 : Sélection séquentielle
 ******************************************************/
function loadCurrentWord() {
  if (currentWordIndex < wordArray.length) {
    currentWordDisplay.textContent = `Mot à sélectionner : ${wordArray[currentWordIndex]}`;
    btnAnnuler.style.display = currentWordIndex > 0 ? 'inline-block' : 'none';
  } else {
    // Tous les mots finis => Étape 4
    step3.style.display = 'none';
    step4.style.display = 'block';

    const finalData = {
      title: titleValue,
      file: chosenFile,
      offset: { x: offsetX, y: offsetY },
      zones: selectedZones
    };
    summaryPre.textContent = JSON.stringify(finalData, null, 2);
  }
}

// Annuler
btnAnnuler.addEventListener('click', () => {
  if (currentWordIndex <= 0) return;
  // Supprimer le dernier rectangle
  selectedZones.pop();
  // Reculer
  currentWordIndex--;
  loadCurrentWord();
});

// Dessin de rectangle via getBoundingClientRect
imageWrapper3.addEventListener('mousedown', (e) => {
  if (currentWordIndex >= wordArray.length) return; // plus de mots
  drawing = true;

  const rect = imageWrapper3.getBoundingClientRect();
  startRectX = e.clientX - rect.left;
  startRectY = e.clientY - rect.top;

  mask.style.display = 'block';
  mask.style.left = startRectX + 'px';
  mask.style.top = startRectY + 'px';
  mask.style.width = '0px';
  mask.style.height = '0px';
});

imageWrapper3.addEventListener('mousemove', (e) => {
  if (!drawing) return;
  const rect = imageWrapper3.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const dx = mouseX - startRectX;
  const dy = mouseY - startRectY;
  mask.style.left = (dx < 0 ? mouseX : startRectX) + 'px';
  mask.style.top = (dy < 0 ? mouseY : startRectY) + 'px';
  mask.style.width = Math.abs(dx) + 'px';
  mask.style.height = Math.abs(dy) + 'px';
});

imageWrapper3.addEventListener('mouseup', () => {
  if (!drawing) return;
  drawing = false;

  const left = parseInt(mask.style.left);
  const top = parseInt(mask.style.top);
  const w = parseInt(mask.style.width);
  const h = parseInt(mask.style.height);

  // Enregistrer la zone
  selectedZones.push({
    word: wordArray[currentWordIndex],
    coordinates: {
      left: left + 'px',
      top: top + 'px',
      width: w + 'px',
      height: h + 'px'
    }
  });

  // Cacher le masque
  mask.style.display = 'none';

  // Passer au mot suivant
  currentWordIndex++;
  loadCurrentWord();
});

/******************************************************
 * ÉTAPE 4 : Envoi
 ******************************************************/
btnSendToServer.addEventListener('click', () => {
  const dataToSend = summaryPre.textContent; // le JSON déjà stringifié

  // Exemple de requête POST
  fetch('/api/new-sample', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: dataToSend
  })
  .then(res => res.json())
  .then(resp => {
    serverResponse.textContent = 'Réponse du serveur : ' + JSON.stringify(resp);
  })
  .catch(err => {
    serverResponse.textContent = 'Erreur : ' + err.message;
  });
});
