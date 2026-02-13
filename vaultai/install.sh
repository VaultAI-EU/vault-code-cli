#!/bin/bash
# VaultAI Code CLI - Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/VaultAI-EU/vault-code-cli/main/vaultai/install.sh | bash
#    or: curl -fsSL https://get.vaultai.eu | bash

set -e

REPO="VaultAI-EU/vault-code-cli"
BINARY_NAME="vault-code"
INSTALL_DIR="${VAULTAI_INSTALL_DIR:-${HOME}/.vaultai/bin}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

print_banner() {
    echo -e "${BLUE}${BOLD}"
    cat << 'EOF'
 █   █ █▀▀█ █  █ █    ▀█▀   █▀▀█ ▀█▀
 █   █ █▄▄█ █  █ █     █    █▄▄█  █
  █▄█  █  █ █▄▄█ █▄▄▄ ▄█▄   █  █ ▄█▄
                CODE CLI
EOF
    echo -e "${NC}"
    echo -e "${BLUE}On-premise AI Code Assistant${NC}"
    echo -e "${BLUE}Powered by OpenCode${NC}"
    echo ""
}

detect_platform() {
    local os arch libc=""
    
    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    arch=$(uname -m)
    
    case "$arch" in
        x86_64|amd64) arch="x64" ;;
        aarch64|arm64) arch="arm64" ;;
        *) echo -e "${RED}Unsupported architecture: $arch${NC}"; exit 1 ;;
    esac
    
    case "$os" in
        darwin) 
            PLATFORM="opencode-darwin-$arch"
            ;;
        linux)
            # Detect musl vs glibc
            if ldd --version 2>&1 | grep -q musl; then
                libc="-musl"
            fi
            PLATFORM="opencode-linux-$arch$libc"
            ;;
        mingw*|msys*|cygwin*)
            PLATFORM="opencode-windows-x64"
            BINARY_NAME="vault-code.exe"
            ;;
        *) 
            echo -e "${RED}Unsupported OS: $os${NC}"
            exit 1 
            ;;
    esac
    
    echo -e "Platform detected: ${GREEN}$PLATFORM${NC}"
}

get_latest_release() {
    echo "Fetching latest release..."
    LATEST_RELEASE=$(curl -sL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
    
    if [ -z "$LATEST_RELEASE" ]; then
        # Fallback to dev branch if no releases yet
        echo -e "${YELLOW}No release found, using dev branch...${NC}"
        LATEST_RELEASE="dev"
    fi
    
    echo -e "Version: ${GREEN}$LATEST_RELEASE${NC}"
}

download_binary() {
    mkdir -p "$INSTALL_DIR"
    
    if [ "$LATEST_RELEASE" = "dev" ]; then
        echo -e "${YELLOW}Dev builds not available for direct download.${NC}"
        echo -e "Please build from source or wait for a release."
        echo ""
        echo "To build from source:"
        echo "  git clone https://github.com/$REPO.git"
        echo "  cd vault-code-cli/packages/opencode"
        echo "  bun install && bun run build --single"
        exit 1
    fi
    
    local tmp_dir=$(mktemp -d)
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    
    # Linux uses .tar.gz, macOS/Windows use .zip
    if [ "$os" = "linux" ]; then
        local download_url="https://github.com/$REPO/releases/download/$LATEST_RELEASE/$PLATFORM.tar.gz"
        echo "Downloading from: $download_url"
        curl -fSL "$download_url" -o "$tmp_dir/archive.tar.gz"
        if [ $? -ne 0 ]; then
            echo -e "${RED}Download failed${NC}"
            rm -rf "$tmp_dir"
            exit 1
        fi
        tar -xzf "$tmp_dir/archive.tar.gz" -C "$tmp_dir"
    else
        local download_url="https://github.com/$REPO/releases/download/$LATEST_RELEASE/$PLATFORM.zip"
        echo "Downloading from: $download_url"
        curl -fSL "$download_url" -o "$tmp_dir/archive.zip"
        if [ $? -ne 0 ]; then
            echo -e "${RED}Download failed${NC}"
            rm -rf "$tmp_dir"
            exit 1
        fi
        unzip -q "$tmp_dir/archive.zip" -d "$tmp_dir"
    fi
    
    # Binary is at root of archive as "opencode"
    mv "$tmp_dir/opencode" "$INSTALL_DIR/$BINARY_NAME"
    chmod +x "$INSTALL_DIR/$BINARY_NAME"
    
    rm -rf "$tmp_dir"
}

setup_path() {
    local shell_rc=""
    local shell_name=$(basename "$SHELL")
    
    case "$shell_name" in
        bash) shell_rc="$HOME/.bashrc" ;;
        zsh) shell_rc="$HOME/.zshrc" ;;
        fish) shell_rc="$HOME/.config/fish/config.fish" ;;
        *) shell_rc="$HOME/.profile" ;;
    esac
    
    # Check if already in PATH
    if [[ ":$PATH:" == *":$INSTALL_DIR:"* ]]; then
        return
    fi
    
    echo ""
    echo -e "${YELLOW}To add vault-code to your PATH, run:${NC}"
    echo ""
    
    if [ "$shell_name" = "fish" ]; then
        echo "  fish_add_path $INSTALL_DIR"
    else
        echo "  echo 'export PATH=\"\$PATH:$INSTALL_DIR\"' >> $shell_rc"
        echo "  source $shell_rc"
    fi
    
    # Offer to do it automatically
    echo ""
    read -p "Add to PATH automatically? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        if [ "$shell_name" = "fish" ]; then
            fish -c "fish_add_path $INSTALL_DIR" 2>/dev/null || true
        else
            echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$shell_rc"
        fi
        echo -e "${GREEN}✓ PATH updated. Please restart your terminal or run: source $shell_rc${NC}"
    fi
}

verify_installation() {
    if [ -f "$INSTALL_DIR/$BINARY_NAME" ]; then
        echo ""
        echo -e "${GREEN}${BOLD}✓ Installation successful!${NC}"
        echo ""
        echo -e "VaultAI Code CLI installed to: ${BLUE}$INSTALL_DIR/$BINARY_NAME${NC}"
        
        # Try to get version
        local version=$("$INSTALL_DIR/$BINARY_NAME" --version 2>/dev/null || echo "unknown")
        echo -e "Version: ${GREEN}$version${NC}"
        
        setup_path
        
        echo ""
        echo -e "${BOLD}Quick Start:${NC}"
        echo ""
        echo "  1. Launch VaultAI Code CLI:"
        echo "     ${GREEN}vault-code${NC}"
        echo ""
        echo "  2. Connect to your VaultAI instance:"
        echo "     ${GREEN}/vaultai${NC} (in the TUI)"
        echo ""
        echo "  Documentation: https://docs.vaultai.eu/code-cli"
        echo ""
    else
        echo -e "${RED}✗ Installation failed${NC}"
        exit 1
    fi
}

main() {
    print_banner
    detect_platform
    get_latest_release
    download_binary
    verify_installation
}

main "$@"
