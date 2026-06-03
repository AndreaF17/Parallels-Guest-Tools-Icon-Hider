UUID        := parallels-guest-tools-icon@local
FILES       := metadata.json extension.js
INSTALL_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
ZIP         := $(UUID).zip

.PHONY: build install enable disable uninstall reinstall clean

build: $(ZIP)

$(ZIP): $(FILES)
	rm -f $(ZIP)
	zip -j $(ZIP) $(FILES)

install:
	mkdir -p $(INSTALL_DIR)
	cp $(FILES) $(INSTALL_DIR)/
	@echo ">> Installed to $(INSTALL_DIR)"
	@echo ">> Log out and back in (Wayland), then: make enable"

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

# Re-copy files into an existing install (handy after editing extension.js).
reinstall: install

uninstall:
	-gnome-extensions disable $(UUID) 2>/dev/null
	rm -rf $(INSTALL_DIR)
	@echo ">> Removed $(INSTALL_DIR)"

clean:
	rm -f $(ZIP)
