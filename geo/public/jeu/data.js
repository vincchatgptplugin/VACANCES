function shuffleData(array) {
  for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

const proposition3 = shuffleData(["Réunion par les États généraux et déception rapide au niveau des réformes","La salle de réunion de la nouvelle Assemblée générale est fermée","Les parisiens « asphyxiés » par le chômage et des troupes militaires","Abolition des privilèges des droits féodaux et de la dîme","L’Assemblée nationale constituante vote la Déclaration des droits de l’Homme et du Citoyen","Le roi refuse de signer tous les textes législatifs","Finalement la constitution est adoptée","À la faveur de la nuit Louis XVI déguisé en valet quitte Paris avec sa famille","Mais il est finalement arrêté à Varennes",])

const images = [
  {
    "name": "TOTO",
    "file": "TOTO.png",
    "words": [
      {
        "word": "Depressed",
        "coordinates": {
          "left": "7px",
          "top": "6px",
          "width": "70px",
          "height": "29px"
        }
      },
      {
        "word": "Desperate",
        "coordinates": {
          "left": "2px",
          "top": "54px",
          "width": "74px",
          "height": "19px"
        }
      },
      {
        "word": "Dejected",
        "coordinates": {
          "left": "10px",
          "top": "87px",
          "width": "60px",
          "height": "25px"
        }
      },
      {
        "word": "Heavy",
        "coordinates": {
          "left": "9px",
          "top": "128px",
          "width": "46px",
          "height": "21px"
        }
      },
      {
        "word": "Crushed",
        "coordinates": {
          "left": "7px",
          "top": "168px",
          "width": "61px",
          "height": "22px"
        }
      },
      {
        "word": "Disgusted",
        "coordinates": {
          "left": "7px",
          "top": "208px",
          "width": "71px",
          "height": "25px"
        }
      },
      {
        "word": "Upset",
        "coordinates": {
          "left": "10px",
          "top": "246px",
          "width": "41px",
          "height": "23px"
        }
      },
      {
        "word": "Sorrowful",
        "coordinates": {
          "left": "7px",
          "top": "290px",
          "width": "68px",
          "height": "21px"
        }
      },
      {
        "word": "Weepy",
        "coordinates": {
          "left": "5px",
          "top": "327px",
          "width": "62px",
          "height": "23px"
        }
      },
      {
        "word": "Frustrated",
        "coordinates": {
          "left": "6px",
          "top": "362px",
          "width": "74px",
          "height": "29px"
        }
      }
    ]
  }
]