Labasni Backend API

v1.0.0 – Core Authentication & Email Verification

Backend REST API pour l'application mobile Labasni – Recommandations de style basées sur l'IA.
Développé avec NestJS, MongoDB, JWT, et validation stricte.

Fonctionnalités (v1.0.0)
Fonctionnalité    Description
Inscription sécurisée    Validation complète : nom complet (2 mots), email, mot de passe fort, téléphone
Vérification email    Code PIN envoyé par email (6 chiffres, expiration 10 min)
Connexion JWT    Token sécurisé avec expiration
Mot de passe fort    6+ caractères, 1 majuscule, 1 caractère spécial
Hachage bcrypt    Sécurité des mots de passe
Réinitialisation mot de passe    OTP SMS via Twilio + token temporaire
Validation backend    class-validator + messages d’erreur claires
Gestion images    Upload sur Cloudinary pour avatar utilisateur
Stack technique
Langage        : TypeScript
Framework      : NestJS (v11.x)
Database       : MongoDB (Mongoose)
Auth           : JWT + Passport
Email          : @nestjs-modules/mailer (SMTP Gmail)
SMS/OTP        : Twilio
Upload fichiers: Cloudinary
Validation     : class-validator + class-transformer
Hachage        : bcryptjs
Testing        : Jest
Logging        : NestJS Logger

Packages installés
NestJS Core

@nestjs/common, @nestjs/core, @nestjs/mongoose, @nestjs/config

@nestjs/platform-express (gestion multipart/form-data)

Sécurité et Auth

@nestjs/jwt, passport, passport-jwt, passport-local

bcryptjs

jsonwebtoken, jwk-to-pem

Validation et DTOs

class-validator, class-transformer

Email & SMS

@nestjs-modules/mailer, nodemailer

twilio

Upload et Stockage

cloudinary, multer, multer-storage-cloudinary

Autres utilitaires

rxjs, crypto, uuid, dotenv

Installation et configuration

Cloner le dépôt :

git clone https://github.com/LabasniDAM/Labasni-Backend.git
cd Labasni-Backend


Installer les dépendances :

npm install


Configurer les variables d’environnement .env :

MONGO_URI=<ton_mongodb_uri>
JWT_SECRET=<secret_jwt>
MAIL_USER=<email@gmail.com>
MAIL_PASS=<motdepasse>
CLOUDINARY_CLOUD_NAME=<cloud_name>
CLOUDINARY_API_KEY=<api_key>
CLOUDINARY_API_SECRET=<api_secret>
TWILIO_ACCOUNT_SID=<sid>
TWILIO_AUTH_TOKEN=<auth_token>
TWILIO_PHONE_NUMBER=<numéro>


Lancer le serveur en développement :

npm run start:dev

Endpoints principaux
Auth
Méthode    Route    Description
POST    /auth/signup    Inscription utilisateur
POST    /auth/verify-email    Vérifier email avec code PIN
POST    /auth/signin    Connexion avec JWT
PATCH    /auth/profile    Mettre à jour profil (texte + image)
DELETE    /auth/profile    Supprimer compte
POST    /auth/forgot-password    Demande OTP SMS
POST    /auth/verify-otp    Vérifier OTP
POST    /auth/reset-password    Réinitialiser mot de passe
Sécurité

JWT avec expiration configurable

Password hashing via bcryptjs

Validation stricte côté backend

Vérification OTP pour réinitialisation mot de passe

Upload images sécurisées via Cloudinary

Contributions

Forker le dépôt

Créer une branche : feature/ma-feature

Committer vos changements

Ouvrir un Pull Request

Licence

MIT License – voir fichier LICENSE.
