# Labasni Backend API
**v1.0.0** – *Core Authentication & Email Verification*

[![Node.js](https://img.shields.io/badge/Node.js-18.x-green)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-v11.x-red)](https://nestjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-v6.x-green)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)

Backend REST API pour l'application mobile **Labasni** – Recommandations de style basées sur l'IA.  
Développé avec **NestJS**, **MongoDB**, **JWT**, et validation stricte.

---

## 🚀 Fonctionnalités

- **Inscription sécurisée** : validation complète (nom complet de 2 mots, email, mot de passe fort, téléphone)  
- **Vérification email** : code PIN envoyé par email (6 chiffres, expiration 10 min)  
- **Connexion JWT** : token sécurisé avec expiration configurable  
- **Mot de passe fort** : 6+ caractères, 1 majuscule, 1 caractère spécial  
- **Hachage bcrypt** : sécurité des mots de passe  
- **Réinitialisation mot de passe** : OTP SMS via Twilio + token temporaire  
- **Validation backend** : `class-validator` + messages d’erreur clairs  
- **Gestion images** : upload sur Cloudinary pour avatar utilisateur  

---

## 🛠 Stack technique

- **Langage**        : TypeScript  
- **Framework**      : NestJS (v11.x)  
- **Database**       : MongoDB (Mongoose)  
- **Auth**           : JWT + Passport  
- **Email**          : @nestjs-modules/mailer (SMTP Gmail)  
- **SMS/OTP**        : Twilio  
- **Upload fichiers**: Cloudinary  
- **Validation**     : class-validator + class-transformer  
- **Hachage**        : bcryptjs  
- **Testing**        : Jest  
- **Logging**        : NestJS Logger  

---

## 📦 Packages installés

**NestJS Core**  
- `@nestjs/common`, `@nestjs/core`, `@nestjs/mongoose`, `@nestjs/config`  
- `@nestjs/platform-express` (multipart/form-data)  

**Sécurité & Auth**  
- `@nestjs/jwt`, `passport`, `passport-jwt`, `passport-local`  
- `bcryptjs`  
- `jsonwebtoken`, `jwk-to-pem`  

**Validation & DTOs**  
- `class-validator`, `class-transformer`  

**Email & SMS**  
- `@nestjs-modules/mailer`, `nodemailer`  
- `twilio`  

**Upload & Stockage**  
- `cloudinary`, `multer`, `multer-storage-cloudinary`  

**Utilitaires**  
- `rxjs`, `crypto`, `uuid`, `dotenv`  

---

## ⚡ Installation et configuration

1. **Cloner le dépôt :**  
```bash
git clone https://github.com/LabasniDAM/Labasni-Backend.git
cd Labasni-Backend

