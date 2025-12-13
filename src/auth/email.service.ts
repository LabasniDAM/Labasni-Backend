import { Injectable } from "@nestjs/common";
import * as brevo from '@getbrevo/brevo';

@Injectable()
export class EmailService {
  private apiInstance: brevo.TransactionalEmailsApi;

  constructor() {
    // Initialise Brevo avec la clé API depuis les variables d'environnement
    this.apiInstance = new brevo.TransactionalEmailsApi();
    // Configuration de l'API key pour Brevo (format: api-key dans le header)
    this.apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY || '');
  }

  /**
   * Envoie un email avec HTML personnalisé
   */
  async sendEmail(to: string, subject: string, html: string, text?: string) {
    try {
      // Extraire le nom et l'email depuis EMAIL_FROM ou utiliser les valeurs par défaut
      const fromEmail = process.env.EMAIL_FROM || 'Labasni <noreply@labasni.com>';
      const fromMatch = fromEmail.match(/^(.+?)\s*<(.+?)>$/);
      const senderName = fromMatch ? fromMatch[1].trim().replace(/"/g, '') : 'Labasni';
      let senderEmail = fromMatch ? fromMatch[2].trim() : (process.env.EMAIL_FROM_ADDRESS || 'noreply@labasni.com');
      
      // ⚠️ IMPORTANT: Si l'adresse n'est pas vérifiée dans Brevo, l'email ne sera pas envoyé
      // Pour les tests, vous pouvez utiliser votre email Brevo vérifié
      // Dans le dashboard Brevo: Settings → Senders & IP → Vérifier votre adresse

      const sendSmtpEmail = new brevo.SendSmtpEmail();
      sendSmtpEmail.subject = subject;
      sendSmtpEmail.htmlContent = html;
      sendSmtpEmail.textContent = text || html.replace(/<[^>]*>/g, '');
      sendSmtpEmail.sender = { name: senderName, email: senderEmail };
      sendSmtpEmail.to = [{ email: to }];

      console.log('═══════════════════════════════════════════════════════════');
      console.log('📧 [Brevo] Envoi d\'email en cours...');
      console.log(`   De: ${senderName} <${senderEmail}>`);
      console.log(`   À: ${to}`);
      console.log(`   Sujet: ${subject}`);
      console.log('═══════════════════════════════════════════════════════════');

      const data = await this.apiInstance.sendTransacEmail(sendSmtpEmail);

      // Extraire le messageId de la réponse
      const messageId = (data as any)?.body?.messageId || (data as any)?.messageId || 'N/A';
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ [Brevo] Email accepté par l\'API');
      console.log(`   Message ID: ${messageId}`);
      console.log(`   Status: ${(data as any)?.response?.statusCode || 'N/A'}`);
      console.log('═══════════════════════════════════════════════════════════');
      console.log('📌 IMPORTANT - Brevo peut envoyer à N\'IMPORTE QUELLE adresse email');
      console.log('   Le problème vient probablement de l\'adresse d\'expéditeur non vérifiée');
      console.log('');
      console.log('🔧 SOLUTION - Vérifier l\'adresse d\'expéditeur dans Brevo:');
      console.log('   1. Allez sur https://app.brevo.com/');
      console.log('   2. Settings → Senders & IP (ou Paramètres → Expéditeurs)');
      console.log('   3. Ajoutez/vérifiez l\'adresse: ' + senderEmail);
      console.log('   4. Cliquez sur "Verify" et confirmez via l\'email reçu');
      console.log('');
      console.log('📊 Pour vérifier le statut de livraison:');
      console.log('   Statistics → Transactional emails → Cherchez le Message ID ci-dessus');
      console.log('═══════════════════════════════════════════════════════════');
      
      return data;
      
    } catch (error: any) {
      console.error('❌ Erreur Brevo:', error);
      const errorMessage = error?.response?.body?.message || error?.message || 'Erreur inconnue';
      throw new Error(`Échec envoi email: ${errorMessage}`);
    }
  }

  /**
   * Envoie un code de vérification par email (méthode de compatibilité)
   */
  async sendVerificationCode(email: string, code: string) {
    const html = `
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
    `;
    
    return this.sendEmail(email, 'Votre code de vérification', html);
  }
}
