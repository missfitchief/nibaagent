/**
 * Public legal documents (Privacy Policy, Terms of Service, User Data Deletion).
 * Stored as structured content so all three render through one shell and stay
 * consistent. Placeholders in ALL CAPS brackets are intentional — the operator
 * fills their legal entity + jurisdiction before relying on these for review.
 */
export type Block = { h: string } | { p: string } | { ul: string[] };

export interface LegalDoc {
  slug: "privacy-policy" | "terms-of-service" | "user-data-deletion";
  title: string;
  metaTitle: string;
  description: string;
  updated: string;
  body: Block[];
}

const UPDATED = "2026-07-09";
const CONTACT: Block[] = [
  { p: "NibaChat Agent" },
  { p: "Email: support@nibachat.app" },
  { p: "Legal entity: Aladdin21" },
  { p: "Jurisdiction: [INSERT JURISDICTION]" }
];

export const PRIVACY: LegalDoc = {
  slug: "privacy-policy",
  title: "Privacy Policy",
  metaTitle: "Privacy Policy | NibaChat Agent",
  description: "Privacy Policy for NibaChat Agent, including how we collect, use, store, and delete data.",
  updated: UPDATED,
  body: [
    { p: "NibaChat Agent (“NibaChat”, “we”, “us”, or “our”) provides AI-powered customer support and messaging automation tools for businesses using channels such as websites, Facebook, Instagram, and other supported platforms." },
    { p: "This Privacy Policy explains how we collect, use, store, and protect information when you use NibaChat Agent." },

    { h: "1. Information We Collect" },
    { p: "We may collect the following types of information:" },
    { p: "Account Information:" },
    { ul: ["name", "email address", "password authentication data", "business name", "business website", "user role and permissions"] },
    { p: "Business Configuration Data:" },
    { ul: ["bot settings", "knowledge base content", "product information", "FAQs", "website URLs", "uploaded text files", "old chat examples provided by the business", "integration settings"] },
    { p: "Messaging and Customer Data: When a business connects Facebook, Instagram, or another supported messaging channel, we may process:" },
    { ul: ["customer messages", "sender or platform user IDs", "conversation history", "message timestamps", "attachments or image references where supported", "handoff and support status"] },
    { p: "Integration Data: Depending on the features used, we may process:" },
    { ul: ["Facebook Page ID", "Instagram Business Account ID", "Page access tokens", "webhook events", "Telegram bot token and chat ID", "OpenAI or other AI provider API keys", "related integration metadata"] },
    { p: "Technical Data:" },
    { ul: ["IP address", "browser type", "device information", "logs", "error reports", "usage analytics", "security events"] },

    { h: "2. How We Use Information" },
    { p: "We use information to:" },
    { ul: ["provide and operate the NibaChat Agent service", "generate AI-assisted replies for connected businesses", "manage customer conversations", "maintain business knowledge bases and product catalogs", "connect and operate Facebook, Instagram, Telegram, and other integrations", "improve bot accuracy and service reliability", "provide analytics and usage reporting", "prevent abuse, fraud, and unauthorized access", "comply with legal and platform requirements"] },

    { h: "3. Facebook and Instagram Data" },
    { p: "If a business connects Facebook or Instagram, NibaChat Agent may receive data through Meta APIs and webhooks." },
    { p: "We use this data only to:" },
    { ul: ["receive and process customer messages", "generate or assist replies", "manage conversations and handoffs", "display message history to authorized business users", "support the connected business account"] },
    { p: "We do not sell Facebook or Instagram user data." },
    { p: "We do not use Facebook or Instagram user data for unrelated advertising." },
    { p: "We do not share Facebook or Instagram user data with third parties except where necessary to provide the service, comply with law, or operate required infrastructure." },

    { h: "4. AI Processing" },
    { p: "NibaChat Agent may use AI providers such as OpenAI or other configured providers to generate responses." },
    { p: "Only the information necessary to generate a relevant response may be sent to the configured AI provider." },
    { p: "Businesses are responsible for ensuring that the data they upload or connect to NibaChat Agent is lawful and appropriate for AI processing." },

    { h: "5. Data Storage and Security" },
    { p: "We use reasonable technical and organizational measures to protect data, including:" },
    { ul: ["encrypted storage for sensitive tokens and API keys", "access controls", "business-level tenant isolation", "authentication and authorization checks", "audit logs where appropriate"] },
    { p: "No system is completely secure, but we work to protect information from unauthorized access, misuse, loss, or disclosure." },

    { h: "6. Data Sharing" },
    { p: "We may share data with:" },
    { ul: ["infrastructure providers", "database and hosting providers", "AI processing providers", "messaging and integration platforms such as Meta, Telegram, or supported APIs", "legal authorities if required by law"] },
    { p: "We do not sell personal data." },

    { h: "7. Business Customer Responsibility" },
    { p: "Businesses using NibaChat Agent are responsible for:" },
    { ul: ["informing their own customers that automated or AI-assisted messaging may be used", "ensuring they have the right to process customer messages", "keeping their uploaded knowledge, products, and policies accurate", "responding to customer privacy requests where applicable"] },

    { h: "8. Data Retention" },
    { p: "We retain data for as long as needed to provide the service, comply with legal obligations, resolve disputes, maintain security, and operate business features." },
    { p: "Businesses may request deletion of their account or business data by contacting us." },

    { h: "9. User Data Deletion" },
    { p: "Users may request deletion of their data by visiting: https://nibaagent.vercel.app/user-data-deletion" },
    { p: "or by contacting: support@nibachat.app" },
    { p: "For Facebook/Instagram related data, users may also remove the app connection through their Facebook settings. We will process deletion requests in accordance with applicable laws and platform requirements." },

    { h: "10. Your Rights" },
    { p: "Depending on your location, you may have rights to:" },
    { ul: ["access your personal data", "correct inaccurate data", "request deletion", "object to processing", "restrict processing", "request data portability", "withdraw consent where processing is based on consent"] },
    { p: "To exercise these rights, contact us at support@nibachat.app." },

    { h: "11. Children" },
    { p: "NibaChat Agent is intended for business use and is not directed to children. We do not knowingly collect personal information from children." },

    { h: "12. International Transfers" },
    { p: "Data may be processed in countries other than your own, depending on our hosting providers, infrastructure, and AI providers." },

    { h: "13. Changes to This Policy" },
    { p: "We may update this Privacy Policy from time to time. The updated version will be posted on this page with a new “Last updated” date." },

    { h: "14. Contact" },
    { p: "For privacy questions or deletion requests, contact:" },
    ...CONTACT
  ]
};

export const TERMS: LegalDoc = {
  slug: "terms-of-service",
  title: "Terms of Service",
  metaTitle: "Terms of Service | NibaChat Agent",
  description: "Terms of Service for using NibaChat Agent.",
  updated: UPDATED,
  body: [
    { p: "These Terms of Service (“Terms”) govern your access to and use of NibaChat Agent (“NibaChat”, “we”, “us”, or “our”)." },
    { p: "By using NibaChat Agent, you agree to these Terms." },

    { h: "1. Service Description" },
    { p: "NibaChat Agent is a SaaS platform that helps businesses automate and manage customer conversations using AI-assisted replies, business knowledge bases, product catalogs, Facebook/Instagram integrations, Telegram notifications, and related tools." },

    { h: "2. Eligibility" },
    { p: "You may use NibaChat Agent only if you are legally able to enter into a binding agreement and use the service in compliance with applicable laws." },
    { p: "If you use NibaChat Agent on behalf of a business, you confirm that you are authorized to bind that business to these Terms." },

    { h: "3. Accounts" },
    { p: "You are responsible for:" },
    { ul: ["maintaining the confidentiality of your login credentials", "all activity under your account", "ensuring your business information is accurate", "limiting access to authorized users only"] },
    { p: "You must notify us if you suspect unauthorized access." },

    { h: "4. Business Data" },
    { p: "You retain ownership of the business data you upload or connect to NibaChat Agent, including products, FAQs, policies, website content, and customer conversation data." },
    { p: "You grant us the limited right to process this data only as needed to provide and improve the service." },

    { h: "5. Customer Messages and AI Responses" },
    { p: "NibaChat Agent may generate AI-assisted replies based on your business settings, products, and knowledge base." },
    { p: "You are responsible for:" },
    { ul: ["reviewing your bot configuration", "ensuring your policies and product data are accurate", "monitoring AI replies where appropriate", "handling customer support, refunds, complaints, and legal obligations"] },
    { p: "AI-generated output may be inaccurate or incomplete. You should not rely on it for legal, medical, financial, or other high-risk decisions." },

    { h: "6. Integrations" },
    { p: "NibaChat Agent may integrate with third-party services, including Meta platforms, Telegram, OpenAI, and other providers." },
    { p: "Your use of these integrations may also be subject to the third party’s terms and policies." },
    { p: "We are not responsible for outages, API changes, restrictions, or actions by third-party platforms." },

    { h: "7. Acceptable Use" },
    { p: "You agree not to use NibaChat Agent to:" },
    { ul: ["violate laws or regulations", "send spam or unauthorized messages", "impersonate others", "mislead customers", "collect sensitive data without proper authorization", "upload illegal or harmful content", "interfere with the security or operation of the service", "reverse engineer or abuse the platform"] },

    { h: "8. Payments and Plans" },
    { p: "If paid plans are offered, billing terms, pricing, limits, and renewal details will be shown at the time of purchase or in your account." },
    { p: "Failure to pay may result in suspension or termination of access." },

    { h: "9. Suspension and Termination" },
    { p: "We may suspend or terminate access if:" },
    { ul: ["you violate these Terms", "your use creates risk to the platform or other users", "required third-party access is revoked", "payment is not made where applicable", "we are required to do so by law or platform rules"] },
    { p: "You may stop using the service at any time." },

    { h: "10. Data Deletion" },
    { p: "You may request deletion of your account or business data by contacting support@nibachat.app or visiting: https://nibaagent.vercel.app/user-data-deletion" },
    { p: "Some data may be retained where required for security, legal compliance, dispute resolution, or legitimate business records." },

    { h: "11. Service Availability" },
    { p: "We aim to provide reliable service, but we do not guarantee uninterrupted access. The service may be unavailable due to maintenance, outages, third-party API issues, or other causes." },

    { h: "12. Disclaimer" },
    { p: "NibaChat Agent is provided “as is” and “as available”. To the maximum extent permitted by law, we disclaim warranties of merchantability, fitness for a particular purpose, and non-infringement." },

    { h: "13. Limitation of Liability" },
    { p: "To the maximum extent permitted by law, NibaChat Agent and its operators will not be liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, revenue, data, goodwill, or business opportunities." },

    { h: "14. Changes to the Service or Terms" },
    { p: "We may update the service or these Terms from time to time. Updated Terms will be posted on this page with a new “Last updated” date." },

    { h: "15. Governing Law" },
    { p: "These Terms are governed by the laws of [INSERT JURISDICTION], unless mandatory local law requires otherwise." },

    { h: "16. Contact" },
    ...CONTACT
  ]
};

export const DATA_DELETION: LegalDoc = {
  slug: "user-data-deletion",
  title: "User Data Deletion",
  metaTitle: "User Data Deletion | NibaChat Agent",
  description: "Instructions for requesting deletion of user data from NibaChat Agent.",
  updated: UPDATED,
  body: [
    { p: "NibaChat Agent respects user privacy and provides a way to request deletion of personal data." },
    { p: "If you want your data deleted from NibaChat Agent, you can follow the steps below." },

    { h: "1. Delete Data Connected Through Facebook or Instagram" },
    { p: "If you interacted with a business that uses NibaChat Agent through Facebook or Instagram, you can request deletion of your data by contacting us at: support@nibachat.app" },
    { p: "Please include:" },
    { ul: ["your name, if available", "the Facebook Page or Instagram account you contacted", "the approximate date of the conversation", "your Facebook or Instagram username or profile link, if available", "a clear request to delete your data"] },
    { p: "We will use this information only to locate and delete the relevant data." },

    { h: "2. Delete a Business Account" },
    { p: "If you are a business user of NibaChat Agent and want to delete your business account, contact: support@nibachat.app" },
    { p: "Please include:" },
    { ul: ["your account email", "business name", "request to delete the account and associated business data"] },

    { h: "3. What Data May Be Deleted" },
    { p: "Depending on your relationship with NibaChat Agent, deletion may include:" },
    { ul: ["customer conversation records", "platform user IDs", "message history", "business account data", "uploaded knowledge base content", "product catalog data", "integration metadata", "logs linked to your account where deletion is legally and technically possible"] },

    { h: "4. What Data May Be Retained" },
    { p: "Some data may be retained if necessary for:" },
    { ul: ["legal compliance", "fraud prevention", "security logs", "dispute resolution", "billing records", "backup integrity for a limited period"] },

    { h: "5. Facebook/Instagram App Removal" },
    { p: "You can also remove an app connected to your Facebook account through your Facebook account settings." },
    { p: "After removing the app, you may request deletion of related data by contacting: support@nibachat.app" },

    { h: "6. Processing Time" },
    { p: "We will process valid deletion requests within a reasonable period and in accordance with applicable law and platform requirements." },

    { h: "7. Contact" },
    { p: "For data deletion requests, contact:" },
    ...CONTACT
  ]
};

export const LEGAL_DOCS = { "privacy-policy": PRIVACY, "terms-of-service": TERMS, "user-data-deletion": DATA_DELETION };
