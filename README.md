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

## 3bis. Personnaliser les modèles d'email (obligatoire)

⚠️ Contrairement au modèle par défaut de Supabase, **il faut personnaliser
ces deux modèles** — sinon les liens envoyés aux adresses professionnelles
protégées par un antivirus/scanner de messagerie (Outlook Safe Links,
Proofpoint, etc.) risquent d'être "pré-visités" automatiquement par ce
scanner avant que la personne ne clique elle-même, ce qui consomme le lien à
usage unique et le rend mort pour la vraie personne (symptôme : elle
retombe sur l'écran de connexion classique au lieu de "Choisissez votre mot
de passe"). La parade : le lien de l'email n'active plus rien tout seul, il
amène sur un écran "Continuer" dans l'app qui exige un vrai clic humain — un
scanner automatique charge la page mais ne clique jamais sur un bouton.

1. Menu **Authentication** → **Emails** → **Invite user**. Remplacez le
   contenu par :
   ```html
   <p>Cliquez ici pour activer votre compte : {{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=invite</p>
   ```
2. Toujours dans **Emails** → **Reset Password**. Remplacez le contenu par :
   ```html
   <p>Cliquez ici pour réinitialiser votre mot de passe : {{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=recovery</p>
   ```
3. Vérifiez que **Authentication → URL Configuration → Site URL** correspond
   bien à l'URL Vercel de votre application (c'est cette valeur qu'utilise
   `{{ .SiteURL }}` dans les modèles ci-dessus).

En cliquant sur le lien reçu, la personne arrive sur un écran "Continuer" ;
un clic plus tard, elle atterrit sur "Choisissez votre mot de passe", une
seule fois. Ensuite, elle se connecte normalement avec son email et ce mot
de passe.

## 4. Inviter votre équipe

1. Menu **Authentication** → **Users** → **Invite user**.
2. Entrez l'email de chaque collaborateur (à commencer par le vôtre).
3. Chacun recevra un email avec un lien pour activer son compte et choisir son mot de passe.

> Astuce : invitez d'abord **votre propre email**. Après activation, la
> première connexion affichera "Compte non reconnu" tant que votre fiche
> n'existe pas encore dans la table `members` — c'est normal, l'app ne crée
> plus personne automatiquement (voir "Limites connues" plus bas). Créez-vous
> manuellement en une fois via **SQL Editor** :
> ```sql
> insert into members (id, name, role, email, access_level)
> values ('vous', 'Vous (à renommer)', 'Manager', 'votre-email@exemple.fr', 'manager');
> ```
> Rechargez ensuite l'app : vous êtes reconnu comme Manager, et pouvez
> ajouter vos collègues directement dans l'appli (onglet "Équipe &
> référents"), avec leur email, **qui doit être exactement le même** que
> celui invité ici.

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

## 9. Invitations et notifications par email (optionnel mais recommandé)

Deux fonctionnalités serveur ont été ajoutées :

- **Invitation automatique** : dès qu'un manager saisit ou modifie l'email
  d'un collaborateur dans l'onglet "Équipe & référents", l'invitation
  Supabase (email + choix du mot de passe) part automatiquement — plus
  besoin de la refaire à la main dans le dashboard Supabase.
- **Notifications par email** : un collaborateur reçoit un email quand il
  est affecté/retiré d'un projet, quand les dates ou le statut d'un projet
  changent, ou quand une tâche lui est assignée.

Ces deux fonctions vivent dans le dossier `api/` (fonctions serveur Vercel)
et ont besoin de secrets qui ne doivent **jamais** être mis dans le code ni
préfixés par `VITE_` (sinon ils seraient visibles par tout le monde dans le
navigateur). À ajouter dans **Vercel → Project Settings → Environment
Variables** :

1. **`SUPABASE_SERVICE_ROLE_KEY`** — Menu Supabase **Project Settings → API**,
   copiez la clé **`service_role`** (différente de la clé `anon` utilisée
   par ailleurs). Cette clé donne un accès total à la base : ne la partagez
   jamais, ne la mettez jamais côté client.
2. **`RESEND_API_KEY`** — créez un compte gratuit sur https://resend.com,
   **API Keys → Create API Key**.
3. **`RESEND_FROM`** — l'adresse d'expédition, ex.
   `Gestion des tâches <notifications@votre-domaine.fr>`. Pour envoyer à
   toute l'équipe (pas seulement à vous-même en mode test), vérifiez un nom
   de domaine dans Resend (**Domains → Add Domain**, ajout de quelques
   enregistrements DNS chez votre registrar) — sinon Resend n'autorise
   l'envoi qu'à l'adresse email de votre propre compte Resend.
4. **`SITE_URL`** — l'URL Vercel de l'application (ex.
   `https://referent-app-xxxx.vercel.app`), utilisée dans le lien
   d'activation de l'email d'invitation.

Après ajout des variables, redéployez (Vercel le fait automatiquement au
prochain push, ou **Deployments → ⋯ → Redeploy**).

> Ces deux fonctionnalités ne peuvent pas être testées avec `npm run dev`
> (Vite ne sait pas exécuter le dossier `api/`) — il faut soit tester
> directement sur Vercel, soit utiliser `npx vercel dev` en local avec les
> variables d'environnement ci-dessus renseignées dans `.env`.

Si ces secrets ne sont pas configurés, le reste de l'application continue
de fonctionner normalement — seules l'invitation auto et les notifications
échouent silencieusement (ou avec une alerte pour l'invitation, qui vous
invite alors à inviter la personne manuellement depuis Supabase).

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
- **Plus de réamorçage automatique des données de démo** : les toutes
  premières versions de l'app recréaient un jeu de données factice
  (collaborateurs "Thomas Lenoir", "Camille Roussel"..., projets "Départ Dr.
  Mercier"...) dès que la lecture de la table `members` semblait vide au
  chargement — y compris parfois à tort (aléas réseau/RLS), ce qui faisait
  réapparaître des doublons de personnes/projets/tâches de démo au fil du
  temps. Ce comportement a été supprimé : l'app n'insère plus jamais rien
  automatiquement, seul un ajout explicite (par vous, dans l'app ou via SQL)
  crée des données. Voir l'astuce de la section 4 pour créer le tout premier
  compte Manager manuellement.
