import 'express';
import 'multer';

declare module 'express-serve-static-core' {
  interface Request {
    user?: any; // ou ton type User si tu en as un
  }
}