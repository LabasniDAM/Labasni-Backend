import { Injectable } from "@nestjs/common";
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;

  constructor() {
    // Initialise Resend avec la clé API depuis les variables d'environnement
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  /**
   * Envoie un code de vérification par email
   */
  async sendVerificationCode(email: string, code: string) {
    try {
      const { data, error } = await this.resend.emails.send({
        from: 'Labasni <onboarding@resend.dev>', // Email de test gratuit Resend
        to: email,
        subject: 'Votre code de vérification',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body {
                  font-family: Arial, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 20px;
                }
                .container {
                  background-color: #f9f9f9;
                  border-radius: 10px;
                  padding: 30px;
                  text-align: center;
                }
                .code {
                  background-color: #007bff;
                  color: white;
                  font-size: 32px;
                  font-weight: bold;
                  padding: 15px 30px;
                  border-radius: 8px;
                  letter-spacing: 8px;
                  display: inline-block;
                  margin: 20px 0;
                }
                .footer {
                  margin-top: 30px;
                  font-size: 12px;
                  color: #666;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h2>Code de vérification</h2>
                <p>Voici votre code de vérification pour créer votre compte Labasni :</p>
                <div class="code">${code}</div>
                <p>Ce code est valide pendant 10 minutes.</p>
                <div class="footer">
                  <p>Si vous n'avez pas demandé ce code, ignorez cet email.</p>
                </div>
              </div>
            </body>
          </html>
        `,
      });

      if (error) {
        console.error('❌ Erreur Resend:', error);
        throw new Error(`Échec envoi email: ${error.message}`);
      }

      console.log('✅ Email envoyé avec succès:', data);
      return data;
      
    } catch (error) {
      console.error('❌ Échec envoi email:', error);
      throw error;
    }
  }
}