# CustomGoogleFormsDisplay

Affichez et analysez facilement les résultats d'un formulaire Google Forms exporté (CSV + structure JSON) avec des graphiques et une interface moderne.

## Prérequis
- Node.js (v14 ou plus recommandé)
- Un export CSV des réponses Google Forms
- Un fichier JSON décrivant la structure des questions (voir exemple ci-dessous)

## Installation

1. Clonez ou téléchargez ce dépôt.
2. Installez les dépendances :
   ```sh
   npm install
   ```

## Lancement

```sh
node app.js
```

L'application sera accessible sur [http://localhost:3000](http://localhost:3000)

## Utilisation

1. Rendez-vous sur la page `/config` (redirection automatique depuis la racine).
2. Importez votre fichier CSV de réponses et votre fichier JSON de structure de questions, ou indiquez leur chemin local.
3. Choisissez une couleur de thème si souhaité.
4. Cliquez sur "Valider" pour afficher les résultats.

## Format du fichier JSON attendu

Le fichier JSON doit être un tableau d'objets, chaque objet représentant une question :

```json
[
  {
    "number": 1,
    "question": "Quel est votre fruit préféré ?",
    "choices": ["Pomme", "Banane", "Orange", "Autre"],
    "multiple": false
  },
  {
    "number": 2,
    "question": "Quelles langues parlez-vous ?",
    "choices": ["Français", "Anglais", "Espagnol", "Autre"],
    "multiple": true
  },
  {
    "number": 3,
    "question": "Date de naissance"
  }
]
```
- `number` : (optionnel) numéro de la question
- `question` : texte de la question
- `choices` : (optionnel) tableau de choix possibles
- `multiple` : (optionnel) true si cases à cocher, false si bouton radio

## Fonctionnalités
- Prise en charge des questions à choix unique, multiple, dates, texte libre
- Graphiques automatiques (camembert, barres, etc.)
- Anonymisation de l'ordre des réponses

## Astuces
- Le CSV doit être exporté depuis Google Forms (séparateur virgule ou point-virgule)
- Le JSON peut être généré à la main ou via un script selon la structure de votre formulaire