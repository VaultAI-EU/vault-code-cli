# VaultAI Code CLI

Assistant de code IA en ligne de commande avec souveraineté des données.

Fork de [OpenCode](https://github.com/anomalyco/opencode) adapté pour les instances VaultAI on-premise.

## Installation

```bash
# Installation rapide
curl -fsSL https://vaultai.eu/install-cli | bash

# Ou via npm
npm install -g @vaultai/code-cli

# Ou via Homebrew (macOS/Linux)
brew install vaultai-eu/tap/vault-code-cli
```

## Configuration

### 1. Définir votre clé API VaultAI

```bash
export VAULTAI_API_KEY="votre-cle-api"
```

Ou via la commande d'authentification :

```bash
vault-code auth login vaultai
```

### 2. Configurer l'URL de votre instance (optionnel)

Par défaut, l'outil pointe vers `https://api.vaultai.local/v1`.

Pour changer l'URL, créez un fichier `.opencode/opencode.jsonc` dans votre projet :

```jsonc
{
  "provider": {
    "vaultai": {
      "api": "https://votre-instance-vaultai.com/v1",
    },
  },
}
```

## Utilisation

### Mode TUI (Terminal User Interface)

```bash
# Lancer le TUI dans le dossier courant
vault-code

# Lancer dans un dossier spécifique
vault-code /chemin/vers/projet
```

### Mode Run (non-interactif)

```bash
# Exécuter une commande directement
vault-code run "Explique ce que fait ce code"

# Avec un modèle spécifique
vault-code run -m vaultai/gpt-4 "Refactore cette fonction"

# Continuer la dernière session
vault-code run -c "Continue avec la tâche précédente"
```

### Commandes utiles

```bash
# Voir les modèles disponibles
vault-code models

# Voir les statistiques d'utilisation
vault-code stats

# Gérer l'authentification
vault-code auth

# Mettre à jour
vault-code upgrade
```

## Providers supportés

VaultAI Code CLI supporte tous les providers d'OpenCode :

- **VaultAI On-Premise** (par défaut)
- OpenAI
- Anthropic (Claude)
- Google (Gemini)
- Azure OpenAI
- AWS Bedrock
- Et plus...

## Différences avec OpenCode

| Fonctionnalité      | VaultAI Code CLI     | OpenCode     |
| ------------------- | -------------------- | ------------ |
| Provider par défaut | VaultAI On-Premise   | OpenCode Zen |
| Télémétrie          | Désactivée           | Activée      |
| Focus               | Souveraineté données | Grand public |

## Développement

```bash
# Cloner le repo
git clone https://github.com/VaultAI-EU/vault-code-cli.git
cd vault-code-cli

# Installer les dépendances
bun install

# Lancer en mode dev
bun run dev
```

## Licence

MIT - Basé sur [OpenCode](https://github.com/anomalyco/opencode) par Anomaly.

## Support

- Issues : https://github.com/VaultAI-EU/vault-code-cli/issues
- Email : support@vaultai.eu
- Documentation : https://docs.vaultai.eu/code-cli
