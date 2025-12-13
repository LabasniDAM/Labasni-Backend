# Styleto Backend API

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11.x-red)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8.x-brightgreen)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)

A comprehensive backend API for **Styleto**, a fashion e-commerce platform powered by AI/ML. Built with NestJS, MongoDB, and integrated with various third-party services for authentication, payments, image processing, and AI-powered recommendations.

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Running the Application](#-running-the-application)
- [API Documentation](#-api-documentation)
- [Project Structure](#-project-structure)
- [Key Modules](#-key-modules)
- [Third-Party Integrations](#-third-party-integrations)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Contributing](#-contributing)

---

## ✨ Features

### 🔐 Authentication & Authorization
- **Multi-provider authentication**: Email/Password, Google OAuth, Apple Sign-In
- **JWT-based authentication** with refresh token support
- **Password reset** via OTP (email/SMS)
- **Email verification** system
- **Role-based access control** (RBAC)

### 👕 Clothes Management
- **AI-powered clothing detection** from images
- **Clothing categorization** (Top, Bottom, Dress, Shoes, Accessory, Jacket)
- **Style and season classification**
- **Color detection** using AI models
- **User wardrobe management**

### 🎨 Outfit Recommendations
- **AI-powered outfit suggestions** based on user preferences
- **Style-based recommendations** (Casual, Formal, Sporty, etc.)
- **Weather-aware suggestions** (temperature-based)
- **Location-based recommendations** (city-specific)
- **Personalized outfit generation**

### 🛍️ E-Commerce & Marketplace
- **Store management** for sellers
- **Product listing** with images, sizes, and prices
- **Shopping cart** functionality
- **Order management** system
- **Transaction tracking**

### 💬 Real-Time Chat
- **WebSocket-based messaging** using Socket.IO
- **Real-time conversations** between buyers and sellers
- **Typing indicators**
- **Message history** persistence
- **AI-powered chat analysis**

### 💳 Payment Integration
- **Stripe payment processing**
- **Subscription management** (Free, Premium, Pro Seller)
- **Webhook handling** for payment events
- **Balance top-up** system
- **Transaction history**

### 👤 User Management
- **User profiles** with avatars
- **3D avatar creation** and management
- **User preferences** tracking
- **Usage statistics** and analytics
- **Subscription management**

### 🤖 AI/ML Services
- **Clothing detection** using custom ML models
- **Outfit recommendation engine**
- **Virtual Try-On (VTO)** service
- **Style analysis** and classification
- **Background removal** for images

---

## 🛠 Tech Stack

### Core Framework
- **NestJS 11.x** - Progressive Node.js framework
- **TypeScript 5.7** - Type-safe JavaScript
- **Express 5.x** - Web application framework

### Database
- **MongoDB 8.x** - NoSQL database
- **Mongoose 8.x** - MongoDB object modeling

### Authentication & Security
- **Passport.js** - Authentication middleware
- **JWT** - JSON Web Tokens
- **bcryptjs** - Password hashing
- **class-validator** - DTO validation

### Real-Time Communication
- **Socket.IO 4.x** - WebSocket library
- **@nestjs/websockets** - WebSocket support for NestJS

### Payment Processing
- **Stripe 20.x** - Payment gateway
- **Webhook handling** for payment events

### Image Processing
- **Cloudinary 2.x** - Cloud-based image management
- **Multer 2.x** - File upload handling

### AI/ML Integration
- **Python services** for ML models
- **TensorFlow.js** - Machine learning in Node.js
- **Custom ML models** for clothing detection and recommendations

### Email & SMS
- **Nodemailer** - Email sending
- **Brevo (Sendinblue)** - Email service
- **Twilio** - SMS service for OTP

### API Documentation
- **Swagger/OpenAPI** - API documentation
- **@nestjs/swagger** - Swagger integration

### Other Services
- **Axios** - HTTP client
- **Node-cron** - Scheduled tasks
- **Joi** - Schema validation

---

## 🏗 Architecture

The application follows a **modular architecture** with clear separation of concerns:

```
src/
├── auth/              # Authentication & authorization
├── user/              # User management
├── clothes/           # Clothing management & detection
├── outfits/           # Outfit recommendations
├── store/             # Marketplace & e-commerce
├── cart/              # Shopping cart
├── orders/            # Order management
├── chat/              # Real-time messaging
├── subscriptions/     # Subscription management
├── avatars/           # 3D avatar management
├── recommendations/   # AI recommendations
├── ai-engine/         # AI/ML services
├── cloudinary/        # Image processing
├── mail/              # Email services
└── common/            # Shared utilities
```

### Design Patterns
- **Module-based architecture** - Each feature is a self-contained module
- **Repository pattern** - Data access abstraction
- **Service layer** - Business logic separation
- **DTO pattern** - Data transfer objects for validation
- **Guard pattern** - Route protection
- **Strategy pattern** - Multiple authentication strategies

---

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **MongoDB** >= 6.0 (local or cloud instance)
- **Python 3.x** (for AI/ML services)
- **Git**

### Optional but Recommended
- **Docker** (for containerized deployment)
- **MongoDB Compass** (database GUI)
- **Postman** or **Insomnia** (API testing)

---

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Labasni-Backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install Python dependencies** (for AI services)
   ```bash
   npm run python:install
   ```

4. **Set up environment variables** (see [Configuration](#-configuration))

5. **Start MongoDB** (if running locally)
   ```bash
   mongod
   ```

---

## ⚙️ Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb://localhost:27017/styleto
MONGODB_TEST_URI=mongodb://localhost:27017/styleto-test

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRATION=7d
JWT_REFRESH_SECRET=your-refresh-token-secret
JWT_REFRESH_EXPIRATION=30d

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Apple OAuth
APPLE_CLIENT_ID=your-apple-client-id
APPLE_TEAM_ID=your-apple-team-id
APPLE_KEY_ID=your-apple-key-id
APPLE_PRIVATE_KEY=your-apple-private-key

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# Stripe
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-publishable-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret

# Email Service (Brevo/Sendinblue)
BREVO_API_KEY=your-brevo-api-key
EMAIL_FROM=noreply@styleto.com

# Twilio (SMS)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# AI/ML Services
AI_SERVICE_URL=http://localhost:5001
VTO_SERVICE_URL=http://localhost:5002
```

### Environment Variables by Service

#### MongoDB
- `MONGODB_URI`: Connection string for MongoDB database

#### JWT
- `JWT_SECRET`: Secret key for signing JWT tokens
- `JWT_EXPIRATION`: Token expiration time (e.g., "7d", "24h")
- `JWT_REFRESH_SECRET`: Secret for refresh tokens
- `JWT_REFRESH_EXPIRATION`: Refresh token expiration

#### OAuth Providers
- Configure Google and Apple OAuth credentials in their respective developer consoles

#### Cloudinary
- Sign up at [cloudinary.com](https://cloudinary.com) and get your credentials

#### Stripe
- Get API keys from [stripe.com](https://stripe.com) dashboard

#### Email/SMS
- Configure Brevo and Twilio accounts

---

## 🏃 Running the Application

### Development Mode
```bash
npm run start:dev
```
The application will start on `http://localhost:3000` with hot-reload enabled.

### Production Mode
```bash
npm run build
npm run start:prod
```

### Debug Mode
```bash
npm run start:debug
```

### Running with Docker
```bash
docker-compose up -d
```

---

## 📚 API Documentation

Once the application is running, access the Swagger documentation at:

```
http://localhost:3000/docs
```

The Swagger UI provides:
- Interactive API documentation
- Request/response schemas
- Authentication testing
- Endpoint testing directly from the browser

### API Endpoints Overview

#### Authentication
- `POST /auth/signup` - User registration
- `POST /auth/signin` - User login
- `POST /auth/google` - Google OAuth
- `POST /auth/apple` - Apple Sign-In
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password
- `POST /auth/verify-email` - Verify email address
- `POST /auth/verify-otp` - Verify OTP code

#### Clothes
- `GET /clothes` - Get user's clothes
- `POST /clothes` - Add new clothing item
- `POST /clothes/detect` - AI clothing detection
- `PUT /clothes/:id` - Update clothing item
- `DELETE /clothes/:id` - Delete clothing item

#### Outfits
- `GET /outfits` - Get user's outfits
- `POST /outfits` - Create new outfit
- `POST /outfits/recommend` - Get AI recommendations
- `PUT /outfits/:id` - Update outfit
- `DELETE /outfits/:id` - Delete outfit

#### Store
- `GET /store` - Get store items
- `POST /store` - Create store item
- `PUT /store/:id` - Update store item
- `DELETE /store/:id` - Delete store item

#### Cart & Orders
- `GET /cart` - Get user's cart
- `POST /cart` - Add item to cart
- `DELETE /cart/:id` - Remove item from cart
- `POST /orders` - Create order
- `GET /orders` - Get user's orders

#### Chat
- `GET /chat/conversations` - Get conversations
- `GET /chat/messages/:conversationId` - Get messages
- `POST /chat/messages` - Send message
- WebSocket: `/chat` namespace for real-time messaging

#### Subscriptions
- `GET /subscriptions/my` - Get user's subscription
- `POST /subscriptions/purchase` - Purchase subscription
- `POST /subscriptions/cancel` - Cancel subscription
- `POST /webhooks/stripe` - Stripe webhook handler

---

## 📁 Project Structure

```
src/
├── ai-engine/              # AI/ML engine services
│   ├── ai-engine.module.ts
│   ├── ai-engine.service.ts
│   └── live.gateway.ts
├── auth/                   # Authentication module
│   ├── dto/                # Data transfer objects
│   ├── guards/             # Route guards
│   ├── strategies/         # Passport strategies
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   └── auth.module.ts
├── avatars/                # Avatar management
├── cart/                   # Shopping cart
├── chat/                   # Real-time chat
│   ├── dto/
│   ├── chat.gateway.ts     # WebSocket gateway
│   ├── chat.service.ts
│   └── chat.controller.ts
├── clothes/                # Clothing management
│   ├── dto/
│   ├── services/
│   └── detect.controller.ts
├── cloudinary/             # Image processing
├── common/                 # Shared utilities
│   ├── decorators/
│   └── middleware/
├── mail/                   # Email services
├── orders/                 # Order management
├── outfits/                # Outfit recommendations
├── recommendations/        # AI recommendations
├── store/                  # Marketplace
├── subscriptions/          # Subscription management
├── user/                   # User management
├── app.module.ts           # Root module
├── app.controller.ts
└── main.ts                 # Application entry point
```

---

## 🔑 Key Modules

### Authentication Module
Handles all authentication and authorization:
- Email/password authentication
- OAuth (Google, Apple)
- JWT token generation and validation
- Password reset flow
- Email verification

### Clothes Module
Manages user's wardrobe:
- Clothing CRUD operations
- AI-powered detection from images
- Categorization and tagging
- Style and season classification

### Outfits Module
Outfit management and recommendations:
- Outfit creation and management
- AI-powered recommendations
- Style-based suggestions
- Weather-aware recommendations

### Store Module
Marketplace functionality:
- Product listing
- Store management
- Product search and filtering
- Seller tools

### Chat Module
Real-time messaging:
- WebSocket-based communication
- Conversation management
- Message history
- Typing indicators

### Subscriptions Module
Subscription management:
- Plan management (Free, Premium, Pro)
- Stripe integration
- Usage tracking
- Webhook handling

---

## 🔌 Third-Party Integrations

### Stripe
- Payment processing
- Subscription management
- Webhook handling for payment events

### Cloudinary
- Image upload and storage
- Image transformations
- CDN delivery

### Google OAuth
- Google Sign-In integration
- User profile retrieval

### Apple Sign-In
- Apple authentication
- Privacy-focused login

### Twilio
- SMS OTP delivery
- Phone number verification

### Brevo (Sendinblue)
- Transactional emails
- Email templates
- Email delivery tracking

### AI/ML Services
- Custom Python services for:
  - Clothing detection
  - Outfit recommendations
  - Virtual Try-On (VTO)
  - Style analysis

---

## 🧪 Testing

### Unit Tests
```bash
npm run test
```

### E2E Tests
```bash
npm run test:e2e
```

### Test Coverage
```bash
npm run test:cov
```

### Python Services Testing
```bash
npm run test:python
npm run test:recommender
```

---

## 🚢 Deployment

### Environment Setup
1. Set all required environment variables
2. Configure MongoDB connection
3. Set up third-party service credentials

### Build for Production
```bash
npm run build
```

### Docker Deployment
```bash
docker build -t styleto-backend .
docker run -p 3000:3000 --env-file .env styleto-backend
```

### Render.com Deployment
The project includes `render.yaml` for easy deployment on Render.com.

### Health Checks
- Health endpoint: `GET /health`
- Swagger docs: `GET /docs`

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style
- Follow TypeScript best practices
- Use ESLint and Prettier
- Write unit tests for new features
- Update documentation

---

## 📝 License

This project is licensed under the MIT License.

---

## 📞 Support

For support, email support@styleto.com or open an issue in the repository.

---

## 🙏 Acknowledgments

- NestJS team for the amazing framework
- MongoDB for the database solution
- All third-party service providers
- The open-source community

---

**Built with ❤️ for Styleto**

