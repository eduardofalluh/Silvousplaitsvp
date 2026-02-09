# Déploiement sur Netlify

## Option 1 : Déploiement par glisser-déposer (le plus simple)

1. Allez sur [netlify.com](https://www.netlify.com) et connectez-vous (ou créez un compte gratuit)
2. Dans le dashboard Netlify, cliquez sur "Add new site" → "Deploy manually"
3. Glissez-déposez le dossier `silvousplait-landing` entier dans la zone de déploiement
4. Netlify déploiera automatiquement votre site
5. Vous recevrez une URL comme `https://random-name-123.netlify.app`
6. Vous pouvez personnaliser le nom dans "Site settings" → "Change site name"

## Option 2 : Déploiement via Git (recommandé pour les mises à jour)

1. Créez un compte sur [GitHub](https://github.com) si vous n'en avez pas
2. Créez un nouveau repository sur GitHub
3. Dans votre terminal, naviguez vers le dossier du projet :
   ```bash
   cd "/Users/eduar/Documents/Personal projects/silvousplait-landing:"
   ```
4. Initialisez Git et poussez vers GitHub :
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin [URL_DE_VOTRE_REPO_GITHUB]
   git push -u origin main
   ```
5. Sur Netlify, cliquez sur "Add new site" → "Import an existing project"
6. Connectez votre compte GitHub
7. Sélectionnez votre repository
8. Netlify détectera automatiquement les paramètres (pas de build nécessaire)
9. Cliquez sur "Deploy site"

## Configuration EmailJS

⚠️ **Important** : Assurez-vous que votre configuration EmailJS est correcte dans `contact.html` :
- Service ID : `service_vyzrc2p`
- Template ID : `template_uhedeli`
- Public Key : `qKYgMRIeyCUiAPs6Z`
- Email de destination : `spectacles@silvousplaitsvp.com`

## Personnalisation du nom de domaine

1. Dans Netlify, allez dans "Site settings" → "Domain management"
2. Cliquez sur "Add custom domain"
3. Entrez votre domaine (ex: `silvousplaitsvp.com`)
4. Suivez les instructions pour configurer les DNS

## Mises à jour futures

- **Avec Git** : Faites `git push` et Netlify redéploiera automatiquement
- **Sans Git** : Glissez-déposez à nouveau le dossier mis à jour

