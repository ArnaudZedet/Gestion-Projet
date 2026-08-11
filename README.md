# Gestion des tâches — guide de démarrage

Ce projet transforme le prototype en vraie application web : authentification
individuelle par email et mot de passe, données stockées
dans une vraie base (Supabase / Postgres), site accessible par une URL.

Suivez les étapes dans l'ordre. Comptez 30 à 45 minutes la première fois.

## 1. Créer le projet Supabase (base de données + comptes)

1. Allez sur https://supabase.com → **Start your project** → connectez-vous avec GitHub ou un email.
2. **New project** → donnez un nom (ex. `referent-cabinet`), un mot de passe de base de données (gardez-le de côté), choisissez une région **proche de vous** (ex. `eu-west` / Paris ou Francfort si disponible).
3. Attendez ~2 minutes que le projet soit prêt.

## 2. Créer les tables de données

1. Dans le menu de gauche : **SQL Editor** → **New query**.
2. Ouvrez le fichier `supabase/schema.sql` de ce projet, copiez tout son contenu, collez-le dans l'éditeur.
3. Cliquez **Run**. Vous devez voir "Success".

**Si vous aviez déjà une version antérieure de l'application en service**
(avec l'ancienne table unique `app_data`), vos données actuelles ne sont pas
perdues — récupérez-les :

4. **New query** à nouveau, ouvrez `supabase/migrate_from_app_data.sql`,
   copiez-collez tout son contenu, **Run**.
5. Vérifiez rapidement dans **Table Editor** que vos tâches/projets/personnes
   sont bien là. L'ancienne table est renommée `app_data_old` (gardée en
   sécurité, vous pourrez la supprimer plus tard une fois sûr que tout est bon).

Si c'est une toute première installation, ignorez cette sous-étape.

## 3. Passer les comptes en mode "invitation uniquement"

Pour que seules les personnes que vous invitez puissent se connecter (et pas
n'importe qui sur internet) :

1. Menu **Authentication** → **Providers** → **Email**.
2. Désactivez **"Allow new users to sign up"** (ou "Enable email signup" selon la version).
3. Sauvegardez.

## 3bis. Le premier email d'invitation contient un lien d'activation

L'application utilise maintenant une connexion classique **email + mot de
passe**. Le modèle d'email **Invite user** (Authentication → Emails → Invite
user) doit contenir le lien d'activation par défaut de Supabase :

```html
<p>Cliquez ici pour activer votre compte : {{ .ConfirmationURL }}</p>
```

C'est le modèle par défaut de Supabase — en principe vous n'avez rien à
changer ici. En cliquant sur ce lien, la personne arrive directement sur
l'écran "Choisissez votre mot de passe" de l'application, une seule fois.
Ensuite, elle se connecte normalement avec son email et ce mot de passe.

Le modèle **Reset Password** (utilisé par "Mot de passe oublié ?") fonctionne
aussi par défaut, sans réglage supplémentaire.

## 4. Inviter votre équipe

1. Menu **Authentication** → **Users** → **Invite user**.
2. Entrez l'email de chaque collaborateur (à commencer par le vôtre).
3. Chacun recevra un email avec un lien pour activer son compte et choisir son mot de passe.

> Astuce : invitez d'abord **votre propre email** — la première fois que vous
> vous connectez, l'application vous crée automatiquement comme "Manager".
> Vous pourrez ensuite renommer votre fiche et ajouter vos collègues
> directement dans l'appli (onglet "Équipe & référents"), avec leur email,
> **qui doit être exactement le même** que celui invité ici.

## 5. Récupérer les clés de connexion

1. Menu **Project Settings** (⚙️) → **API**.
2. Notez deux valeurs : **Project URL** et **anon public key**.

## 6. Mettre le code sur GitHub

1. Créez un compte sur https://github.com si besoin.
2. Créez un nouveau dépôt (repository), par exemple `referent-app`, **vide** (sans README).
3. Sur votre ordinateur, dans le dossier de ce projet :
   ```bash
   git init
   git add .
   git commit -m "Première version"
   git branch -M main
   git remote add origin https://github.com/VOTRE-COMPTE/referent-app.git
   git push -u origin main
   ```

## 7. Déployer sur Vercel

1. Allez sur https://vercel.com → connectez-vous avec votre compte GitHub.
2. **Add New** → **Project** → sélectionnez le dépôt `referent-app`.
3. Dans **Environment Variables**, ajoutez :
   - `VITE_SUPABASE_URL` → collez le Project URL noté à l'étape 5
   - `VITE_SUPABASE_ANON_KEY` → collez la anon public key
4. Cliquez **Deploy**. Après ~1 minute, Vercel vous donne une URL du type
   `https://referent-app-xxxx.vercel.app` — c'est l'adresse de votre application.

## 8. Premier lancement

1. Ouvrez l'URL Vercel, entrez votre email et le mot de passe choisi lors de l'activation.
2. Vous êtes connecté et reconnu comme Manager.
3. Allez dans **Équipe & référents**, renommez votre fiche, ajoutez vos collègues
   (avec le même email que celui que vous inviterez à l'étape 4 pour chacun d'eux).
4. Invitez-les (étape 4), donnez-leur l'URL Vercel.

## Tester en local avant de déployer (optionnel)

```bash
npm install
cp .env.example .env      # puis remplissez avec vos vraies clés Supabase
npm run dev
```

## Limites connues de cette V1 — à garder en tête

- **Sécurité des données** : la base autorise actuellement toute personne
  *invitée et connectée* à lire/écrire l'ensemble des données (les
  restrictions Manager/Référent/Autre sont appliquées côté interface, pas
  encore au niveau de la base). Pour un usage avec des données sensibles,
  une évolution des règles Postgres (RLS) par rôle est recommandée avant un
  déploiement à grande échelle.
- **RGPD / hébergement de données de santé** : ce projet ne stocke pas de
  données patients, seulement des tâches/plannings d'équipe. Si vous deviez
  un jour y faire transiter des données de santé, vérifiez au préalable les
  exigences d'hébergement (HDS en France) — Supabase standard n'est pas
  certifié hébergeur de données de santé.
- **Sauvegardes** : Supabase conserve vos données, mais pensez à vérifier le
  plan de sauvegarde inclus dans votre offre (gratuite vs payante).
- **Écritures concurrentes** : depuis la version avec une table par type
  d'objet (members/projects/tasks/appointments/external_contacts/task_requests),
  chaque tâche, projet, etc. s'enregistre individuellement — deux personnes
  qui modifient deux éléments différents en même temps ne s'écrasent plus.
  Il reste un cas limite non géré : si deux personnes modifient *exactement
  la même* tâche au même instant, la dernière sauvegarde l'emporte sur l'autre.
