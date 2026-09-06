# Mes Courses — PWA

Application web mobile-first pour gérer ses courses et son historique d'achats.
Fonctionne 100 % hors-ligne, sans compte, avec sauvegarde locale (IndexedDB).

## Utilisation immédiate (test rapide)

Aucune installation n'est nécessaire : c'est du HTML/CSS/JS pur, sans étape de build.

1. Ouvrez un terminal dans ce dossier.
2. Lancez un petit serveur local, par exemple :
   ```
   python3 -m http.server 8080
   ```
3. Ouvrez `http://localhost:8080` sur votre ordinateur pour tester rapidement.

## Installer sur iPhone (PWA)

Pour que "Sur l'écran d'accueil" et le mode hors-ligne fonctionnent pleinement,
l'application doit être servie en **HTTPS** (ou via `localhost`, qui est
considéré comme sécurisé par Safari).

Options simples et gratuites pour héberger ces fichiers en HTTPS :
- Netlify, Vercel ou GitHub Pages : glissez-déposez le dossier (ou connectez le repo Git).
- N'importe quel hébergement statique de votre choix.

Ensuite, sur l'iPhone :
1. Ouvrez le site dans **Safari**.
2. Appuyez sur le bouton de partage (carré avec flèche vers le haut).
3. Choisissez **« Sur l'écran d'accueil »**.
4. L'application s'ouvre ensuite en plein écran, comme une app native.

## Structure du projet

```
index.html          Écran unique (SPA) + squelette de l'interface
styles.css           Système de design (tokens, composants, animations)
manifest.json        Manifeste PWA (icônes, couleurs, mode plein écran)
sw.js                Service worker (cache hors-ligne de l'app)
js/db.js             Couche IndexedDB (articles, catégories, historique, etc.)
js/app.js            Routage entre écrans + rendu Accueil/Liste/Historique/Paramètres
js/itemModal.js       Formulaire d'ajout / édition d'un article
js/shoppingMode.js    Écran plein écran "mode courses"
js/confirm.js         Boîte de dialogue de confirmation réutilisable
js/helpers.js         Fonctions utilitaires (dates, prix, DOM...)
icons/                Icônes PWA (générées, fond vert émeraude)
```

## Ce qui est déjà fonctionnel

- Ajout ultra-rapide d'un article (nom seul) + formulaire complet optionnel
  (catégorie, quantité, unité, priorité, notes, prix).
- Suggestions automatiques basées sur les articles déjà utilisés.
- Catégories par défaut + création de catégories personnalisées.
- Mode courses : cases à cocher, barre de progression, section "Achetés".
- Fin de courses avec confirmation, sauvegarde automatique dans l'historique
  (date, heure, articles achetés **et** non achetés).
- Historique consultable, avec détail, prix/totaux si renseignés, et
  "Racheter cette liste" pour tout remettre dans la liste active.
- Articles habituels mémorisés automatiquement, ajout en un clic.
- Export / import complet des données en JSON (sauvegarde manuelle).
- Fonctionnement 100 % hors-ligne après le premier chargement (service worker).

## Architecture prévue pour plus tard (déjà en place dans les données)

- **Stock de la maison** : chaque article a déjà les champs `stockCurrent` /
  `stockMin` / `stockEnabled` en base. Il suffira d'activer la fonctionnalité
  dans les paramètres et d'ajouter la logique de réapprovisionnement
  automatique.
- **Rappels/notifications** : un emplacement est prévu dans les paramètres ;
  il ne reste qu'à brancher l'API Notifications / Web Push.
- **Synchronisation cloud** : toute la couche de données est isolée dans
  `js/db.js`, ce qui permet d'ajouter une synchronisation ultérieure sans
  toucher à l'interface.
