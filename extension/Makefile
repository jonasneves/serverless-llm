.PHONY: build install install-native uninstall-native clean help dev

# Stable extension ID (derived from key in manifest.json)
EXT_ID := $(shell cat .extension-id 2>/dev/null || echo "")

# Detect OS for install scripts
UNAME := $(shell uname -s)
ifeq ($(UNAME),Darwin)
	INSTALL_SCRIPT := native-host/install-macos.sh
	UNINSTALL_SCRIPT := native-host/uninstall-macos.sh
else
	INSTALL_SCRIPT := native-host/install-linux.sh
	UNINSTALL_SCRIPT := native-host/uninstall-linux.sh
endif

help:
	@echo "shipctl Chrome Extension"
	@echo ""
	@echo "Build:"
	@echo "  make build           Build extension (outputs to dist/)"
	@echo "  make dev             Start development server"
	@echo "  make clean           Remove built files and node_modules"
	@echo ""
	@echo "Native Messaging (for local backend control):"
	@echo "  make install-native          Install native host (Chrome)"
	@echo "  make install-native BROWSER=arc      Install for Arc"
	@echo "  make install-native BROWSER=brave    Install for Brave"
	@echo "  make uninstall-native        Remove native host"
	@echo ""
	@echo "After building, load in Chrome:"
	@echo "  chrome://extensions -> Load unpacked -> extension/dist/"
	@echo ""
	@echo "Extension ID: $(EXT_ID)"

build:
	@echo "Building extension..."
	npm install
	npm run build
	@echo ""
	@echo "✓ Extension built to dist/"
	@echo "Load in Chrome: chrome://extensions -> Load unpacked -> extension/dist/"
	@echo ""
	@echo "Extension ID: $(EXT_ID)"

dev:
	npm install
	npm run dev

install: build

install-native:
ifndef BROWSER
	@./$(INSTALL_SCRIPT)
else
	@./$(INSTALL_SCRIPT) "$(EXT_ID)" $(BROWSER)
endif

uninstall-native:
ifndef BROWSER
	@./$(UNINSTALL_SCRIPT)
else
	@./$(UNINSTALL_SCRIPT) $(BROWSER)
endif

clean:
	rm -rf dist node_modules
