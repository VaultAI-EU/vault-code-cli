/**
 * VaultAI Branding Constants
 *
 * Ce fichier centralise tous les éléments de branding VaultAI
 * pour faciliter le rebranding et éviter les hardcoded strings
 */

export const VAULTAI_BRANDING = {
  // Identité
  name: "VaultAI Code CLI",
  shortName: "VaultAI",
  publisher: "VaultAI",
  version: "1.0.0",

  // URLs
  homepage: "https://vaultai.eu",
  docs: "https://docs.vaultai.eu/code-cli",
  github: "https://github.com/VaultAI-EU/vault-code-cli",

  // Support
  bugs: "https://github.com/VaultAI-EU/vault-code-cli/issues",
  email: "support@vaultai.eu",

  // Description
  displayName: "VaultAI Code CLI - On-premise AI Code Assistant",
  description:
    "Assistant de code IA on-premise pour entreprises avec souveraineté des données",
  tagline: "Code faster with AI, keep your data sovereign",

  // Couleurs (pour themes)
  colors: {
    primary: "#0066FF", // Bleu VaultAI
    secondary: "#00CCAA", // Accent
    background: "#1E1E1E", // Dark theme
  },

  // API par défaut
  defaultApiBase: "https://api.vaultai.local/v1",
  defaultProvider: "vaultai",
} as const

export type VaultAIBranding = typeof VAULTAI_BRANDING
