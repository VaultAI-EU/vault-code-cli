#!/bin/bash
# VaultAI Code CLI - Script d'installation
# Usage: curl -fsSL https://vaultai.eu/install-cli | bash

set -e

REPO="VaultAI-EU/vault-code-cli"
BINARY_NAME="vault-code"
INSTALL_DIR="${VAULTAI_INSTALL_DIR:-${XDG_BIN_DIR:-$HOME/.local/bin}}"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════╗"
echo "║     VaultAI Code CLI Installer        ║"
echo "║   On-premise AI Code Assistant        ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Détection de l'OS et de l'architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
    x86_64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo -e "${RED}Architecture non supportée: $ARCH${NC}"; exit 1 ;;
esac

case "$OS" in
    darwin) PLATFORM="darwin-$ARCH" ;;
    linux) PLATFORM="linux-$ARCH" ;;
    *) echo -e "${RED}OS non supporté: $OS${NC}"; exit 1 ;;
esac

echo "Plateforme détectée: $PLATFORM"

# Créer le dossier d'installation
mkdir -p "$INSTALL_DIR"

# Télécharger la dernière release
echo "Téléchargement de la dernière version..."
LATEST_RELEASE=$(curl -sL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST_RELEASE" ]; then
    echo -e "${RED}Impossible de trouver la dernière release${NC}"
    echo "Utilisation de la méthode alternative (npm)..."
    
    # Fallback: installer via npm/bun
    if command -v bun &> /dev/null; then
        bun install -g @vaultai/code-cli
    elif command -v npm &> /dev/null; then
        npm install -g @vaultai/code-cli
    else
        echo -e "${RED}Ni bun ni npm n'est installé. Veuillez installer l'un des deux.${NC}"
        exit 1
    fi
else
    DOWNLOAD_URL="https://github.com/$REPO/releases/download/$LATEST_RELEASE/vault-code-$PLATFORM"
    
    echo "Téléchargement depuis: $DOWNLOAD_URL"
    curl -sL "$DOWNLOAD_URL" -o "$INSTALL_DIR/$BINARY_NAME"
    chmod +x "$INSTALL_DIR/$BINARY_NAME"
fi

# Vérifier l'installation
if command -v "$INSTALL_DIR/$BINARY_NAME" &> /dev/null || [ -f "$INSTALL_DIR/$BINARY_NAME" ]; then
    echo -e "${GREEN}✓ Installation réussie!${NC}"
    echo ""
    echo "VaultAI Code CLI a été installé dans: $INSTALL_DIR/$BINARY_NAME"
    echo ""
    
    # Vérifier si le PATH inclut le dossier d'installation
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        echo -e "${BLUE}Pour utiliser vault-code, ajoutez ceci à votre ~/.bashrc ou ~/.zshrc:${NC}"
        echo ""
        echo "  export PATH=\"\$PATH:$INSTALL_DIR\""
        echo ""
    fi
    
    echo "Pour commencer:"
    echo ""
    echo "  1. Configurez votre clé API VaultAI:"
    echo "     export VAULTAI_API_KEY=\"votre-cle-api\""
    echo ""
    echo "  2. Lancez VaultAI Code CLI:"
    echo "     vault-code"
    echo ""
    echo "Documentation: https://docs.vaultai.eu/code-cli"
else
    echo -e "${RED}✗ L'installation a échoué${NC}"
    exit 1
fi
