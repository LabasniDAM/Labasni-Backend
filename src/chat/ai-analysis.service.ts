import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ExtractedInfo {
  phoneNumbers?: string[];
  addresses?: string[];
  emails?: string[];
  urls?: string[];
  socialMedia?: string[];
  externalContacts?: string[];
  profanity?: string[];
  obfuscatedContacts?: string[];
}

export interface ModerationResult {
  isAllowed: boolean;
  violations: string[];
  extractedInfo: ExtractedInfo;
  maskedContent?: string;
}

@Injectable()
export class AiAnalysisService {
  private readonly logger = new Logger(AiAnalysisService.name);
  private genAI: GoogleGenerativeAI | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get('GEMINI_API_KEY');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.logger.log('✅ Gemini AI initialized');
    } else {
      this.logger.warn('⚠️ GEMINI_API_KEY not configured, will use regex fallback');
    }
  }

  /**
   * 🚨 MAIN MODERATION FUNCTION - Blocks only links (URLs) and badwords (profanity)
   * Everything else is allowed
   */
  async moderateMessage(content: string, hasCompletedPurchase: boolean = false): Promise<ModerationResult> {
    const extractedInfo = await this.analyzeMessage(content);
    const violations: string[] = [];

    // ✨ NOUVELLE RÈGLE : Bloquer uniquement les liens (URLs) et les gros mots (badwords)
    // Tout le reste est autorisé (numéros de téléphone, adresses, emails, réseaux sociaux, etc.)
    // Suppression de la condition hasCompletedPurchase car on autorise tout sauf URLs et profanity
    
    // Check for external URLs (always blocked)
    if (extractedInfo.urls && extractedInfo.urls.length > 0) {
      violations.push('Les liens (URLs) ne sont pas autorisés');
    }

    // Check for profanity (always blocked)
    if (extractedInfo.profanity && extractedInfo.profanity.length > 0) {
      violations.push('Les gros mots et le langage offensant ne sont pas autorisés');
    }

    // Everything else is allowed (phone numbers, addresses, emails, social media, etc.)
    // Ancien code désactivé - tout est autorisé sauf URLs et profanity
    /*
      // Check for phone numbers (any format)
      if (extractedInfo.phoneNumbers && extractedInfo.phoneNumbers.length > 0) {
        violations.push('Phone numbers are not allowed before completing a purchase');
      }

      // Check for requests for contact info
      if (extractedInfo.externalContacts && extractedInfo.externalContacts.length > 0) {
        violations.push('Requesting contact information is not allowed before completing a purchase');
      }

      // Check for obfuscated contacts (written numbers, etc.)
      if (extractedInfo.obfuscatedContacts && extractedInfo.obfuscatedContacts.length > 0) {
        violations.push('Obfuscated contact information is not allowed');
      }

      // Check for addresses
      if (extractedInfo.addresses && extractedInfo.addresses.length > 0) {
        violations.push('Physical addresses are not allowed before completing a purchase');
      }

      // Check for emails
      if (extractedInfo.emails && extractedInfo.emails.length > 0) {
        violations.push('Email addresses are not allowed before completing a purchase');
      }

      // Check for external URLs
      if (extractedInfo.urls && extractedInfo.urls.length > 0) {
        violations.push('External links are not allowed before completing a purchase');
      }

      // Check for social media handles
      if (extractedInfo.socialMedia && extractedInfo.socialMedia.length > 0) {
        violations.push('Social media handles are not allowed before completing a purchase');
      }
    }
    */

    return {
      isAllowed: violations.length === 0,
      violations,
      extractedInfo,
      maskedContent: violations.length > 0 ? this.maskSensitiveInfo(content, extractedInfo) : undefined
    };
  }

  /**
   * Analyze message with Gemini AI to extract structured information
   */
  async analyzeMessage(content: string): Promise<ExtractedInfo> {
    if (!this.genAI) {
      this.logger.debug('Gemini not available, using regex fallback');
      return this.extractInfoWithRegex(content);
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      
      const prompt = `Tu es un système de modération SIMPLE pour un chat de marketplace.
Ton objectif : DÉTECTER UNIQUEMENT les liens (URLs) et les gros mots (badwords).

RÈGLES SIMPLES :

1. LIENS (URLs) → Détecter TOUS les liens :
   - URLs complètes : "https://example.com", "http://site.tn", "www.example.com"
   - URLs courtes : "bit.ly/xxx", "t.co/xxx", "tinyurl.com/xxx"
   - Liens avec protocole : "https://", "http://", "ftp://"
   - Liens sans protocole mais avec domaine : "example.com/page", "site.tn/article"
   - Liens de réseaux sociaux : "instagram.com/xxx", "facebook.com/xxx", "twitter.com/xxx", "t.me/xxx", "wa.me/xxx"
   - Toute URL, même partielle ou obfusquée

2. GROS MOTS / INSULTES / HARCELLEMENT → TOUTES les langues :
   Tu DOIS détecter tout langage vulgaire, sexuel, insultant, menace, harcèlement, même censuré, même avec émoticônes.
   Exemples en tunisien : kahba/ka7ba/9ahba/9a7ba, zebi/zbi/zeb, kess/kiss/kes, omek/ommak/emmek, khra/5ra/khra, 7mar/7mar, etc. + toutes les variantes avec chiffres.
   Exemples en français : putain, fils de pute, enculé, salope, connard, merde (dans un contexte insultant), etc.
   Exemples en anglais : fuck, motherfucker, bitch, asshole, shit (dans un contexte insultant), etc.
   Exemples en autres langues : hijo de puta (espagnol), figlio di puttana (italien), sharmouta (arabe), etc.
   → Si tu as le moindre doute → flag.

IMPORTANT : TOUT LE RESTE EST AUTORISÉ :
- Numéros de téléphone → AUTORISÉ
- Adresses → AUTORISÉ
- Emails → AUTORISÉ
- Réseaux sociaux (mentions sans liens) → AUTORISÉ
- Contacts externes → AUTORISÉ
- Rencontres physiques → AUTORISÉ
- Tout autre contenu → AUTORISÉ

SORTIE JSON OBLIGATOIRE (exactement ce format, rien d'autre, pas de markdown) :

{
  "urls": ["https://example.com", "www.site.tn", "t.me/username"],
  "profanity": ["gros mot détecté", "insulte détectée"]
}

Note : Les autres champs (phoneNumbers, addresses, emails, socialMedia, externalContacts, obfuscatedContacts) ne sont plus nécessaires car ils sont maintenant autorisés.

MESSAGE À ANALYSER :
"${content.replace(/"/g, '\\"')}"
`;
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text().trim();

      // Clean markdown if present
      let jsonText = text;
      if (text.startsWith('```json')) {
        jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      } else if (text.startsWith('```')) {
        jsonText = text.replace(/```\n?/g, '').trim();
      }

      // Parse JSON
      const extracted = JSON.parse(jsonText) as ExtractedInfo;

      // Filter empty arrays
      const filtered: ExtractedInfo = {};
      if (extracted.phoneNumbers?.length) filtered.phoneNumbers = extracted.phoneNumbers;
      if (extracted.addresses?.length) filtered.addresses = extracted.addresses;
      if (extracted.emails?.length) filtered.emails = extracted.emails;
      if (extracted.urls?.length) filtered.urls = extracted.urls;
      if (extracted.socialMedia?.length) filtered.socialMedia = extracted.socialMedia;
      if (extracted.externalContacts?.length) filtered.externalContacts = extracted.externalContacts;
      if (extracted.profanity?.length) filtered.profanity = extracted.profanity;
      if (extracted.obfuscatedContacts?.length) filtered.obfuscatedContacts = extracted.obfuscatedContacts;

      this.logger.debug(`Extracted info: ${JSON.stringify(filtered)}`);
      return filtered;

    } catch (error) {
      this.logger.error('Error analyzing message with Gemini:', error);
      // Fallback to regex
      return this.extractInfoWithRegex(content);
    }
  }

  /**
   * Enhanced regex-based extraction (fallback)
   */
  extractInfoWithRegex(content: string): ExtractedInfo {
    const info: ExtractedInfo = {};
    const lowerContent = content.toLowerCase();

    // 1. Phone numbers (various formats)
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;
    const phoneMatches = content.match(phoneRegex);
    if (phoneMatches?.length) {
      info.phoneNumbers = phoneMatches.filter(phone => phone.replace(/\D/g, '').length >= 8);
    }

    // 2. Written numbers (English/French)
    const writtenNumberPatterns = [
      /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten)/gi,
      /\b(zéro|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)\s+(zéro|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)/gi,
    ];
    const obfuscated: string[] = [];
    writtenNumberPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) obfuscated.push(...matches);
    });
    if (obfuscated.length) info.obfuscatedContacts = obfuscated;

    // 3. Email addresses
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailMatches = content.match(emailRegex);
    if (emailMatches?.length) info.emails = emailMatches;

    // 4. URLs
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urlMatches = content.match(urlRegex);
    if (urlMatches?.length) info.urls = urlMatches;

    // 5. Social media handles
    const socialRegex = /@[\w.]+|(?:instagram|facebook|snapchat|telegram|whatsapp|twitter)[\s:]+[\w.]+/gi;
    const socialMatches = content.match(socialRegex);
    if (socialMatches?.length) info.socialMedia = socialMatches;

    // 6. Requests for contact
    const contactRequestPatterns = [
      /\b(give|send|share|what'?s|whats)\s+(me\s+)?(your|ton|ta)\s+(number|phone|contact|numéro|téléphone)/gi,
      /\b(call|text|message|appelle|contacte)[\s-]+(me|moi)/gi,
      /\b(how|comment)\s+(can\s+)?(i|je)\s+(reach|contact|joindre)/gi,
    ];
    const externalContacts: string[] = [];
    contactRequestPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        const matches = content.match(pattern);
        if (matches) externalContacts.push(...matches);
      }
    });
    if (externalContacts.length) info.externalContacts = externalContacts;

    // 7. Addresses
    const addresses: string[] = [];
    const addressKeywords = /\b(rue|avenue|boulevard|street|road|drive|place|square|meet\s+at|near|behind|chez)\b/gi;
    if (addressKeywords.test(content)) {
      const sentences = content.split(/[.!?,\n]\s+/);
      const addressSentences = sentences.filter(s => addressKeywords.test(s));
      if (addressSentences.length) addresses.push(...addressSentences.map(s => s.trim()));
    }
    
    const numberAddressPattern = /\b\d{1,5}\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]{2,30}\b/gi;
    const numberAddressMatches = content.match(numberAddressPattern);
    if (numberAddressMatches) {
      addresses.push(...numberAddressMatches);
    }
    if (addresses.length) info.addresses = [...new Set(addresses)];

    // 8. Profanity (basic detection - Gemini is better for this)
    const profanityPatterns = [
      /\b(fuck|shit|bitch|ass|damn|bastard|cunt|dick)\w*/gi,
      /\b(merde|putain|connard|salaud|enculé|fils de pute)\w*/gi,
      /\b(f\*+k|sh\*+t|b\*+ch|a\*+)\w*/gi,
    ];
    const profanity: string[] = [];
    profanityPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) profanity.push(...matches);
    });
    if (profanity.length) info.profanity = [...new Set(profanity)];

    return info;
  }

  /**
   * Mask sensitive information in content
   */
  maskSensitiveInfo(content: string, extractedInfo: ExtractedInfo): string {
    let maskedContent = content;

    // Helper function to safely mask
    const maskItem = (item: string, maxLength: number = 20) => {
      const escapedItem = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      maskedContent = maskedContent.replace(
        new RegExp(escapedItem, 'gi'),
        '*'.repeat(Math.min(item.length, maxLength))
      );
    };

    // Mask all detected information
    extractedInfo.phoneNumbers?.forEach(phone => maskItem(phone));
    extractedInfo.emails?.forEach(email => maskItem(email));
    extractedInfo.urls?.forEach(url => maskItem(url, 30));
    extractedInfo.addresses?.forEach(addr => maskItem(addr, 30));
    extractedInfo.socialMedia?.forEach(social => maskItem(social));
    extractedInfo.externalContacts?.forEach(contact => maskItem(contact, 25));
    extractedInfo.profanity?.forEach(word => maskItem(word, 10));
    extractedInfo.obfuscatedContacts?.forEach(obf => maskItem(obf, 25));

    return maskedContent;
  }
}