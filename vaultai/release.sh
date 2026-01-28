#!/bin/bash
# VaultAI Code CLI - Release preparation script
# Creates tar.gz archives for GitHub releases

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/packages/opencode/dist"
RELEASE_DIR="$ROOT_DIR/releases"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Preparing VaultAI Code CLI releases...${NC}"

# Create release directory
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# Check if dist exists
if [ ! -d "$DIST_DIR" ]; then
    echo "Building binaries first..."
    cd "$ROOT_DIR/packages/opencode"
    bun run build
fi

# Package each platform
for platform_dir in "$DIST_DIR"/opencode-*; do
    if [ -d "$platform_dir" ]; then
        platform_name=$(basename "$platform_dir")
        echo -e "Packaging ${GREEN}$platform_name${NC}..."
        
        # Rename binary from opencode to vault-code
        if [ -f "$platform_dir/bin/opencode" ]; then
            cp "$platform_dir/bin/opencode" "$platform_dir/bin/vault-code"
        elif [ -f "$platform_dir/bin/opencode.exe" ]; then
            cp "$platform_dir/bin/opencode.exe" "$platform_dir/bin/vault-code.exe"
        fi
        
        # Create tar.gz
        tar -czf "$RELEASE_DIR/$platform_name.tar.gz" -C "$DIST_DIR" "$platform_name"
        
        # Create zip for Windows
        if [[ "$platform_name" == *"windows"* ]]; then
            cd "$DIST_DIR"
            zip -rq "$RELEASE_DIR/$platform_name.zip" "$platform_name"
            cd -
        fi
    fi
done

# Calculate checksums
echo ""
echo -e "${BLUE}Calculating checksums...${NC}"
cd "$RELEASE_DIR"
shasum -a 256 *.tar.gz *.zip 2>/dev/null > checksums.txt || shasum -a 256 *.tar.gz > checksums.txt

echo ""
echo -e "${GREEN}Release files created in: $RELEASE_DIR${NC}"
echo ""
ls -lh "$RELEASE_DIR"
echo ""
echo "Checksums:"
cat checksums.txt
echo ""
echo "To create a GitHub release:"
echo "  gh release create v1.0.0 releases/* --title 'VaultAI Code CLI v1.0.0' --notes 'Initial release'"
