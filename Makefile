APP := build/Namaz.app
INSTALLED := /Applications/Namaz.app

.DEFAULT_GOAL := help
.PHONY: help build start stop restart install uninstall dist test status logs clean

help: ## Show these commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  make %-10s %s\n", $$1, $$2}'

build: ## Build build/Namaz.app
	scripts/build-app.sh release

start: build ## Build and open the app
	open $(APP)

stop: ## Quit the app
	-pkill -x Namaz

restart: stop start ## Quit, rebuild and reopen

install: build ## Copy the app to /Applications and open it from there
	-pkill -x Namaz
	rm -rf $(INSTALLED)
	cp -R $(APP) $(INSTALLED)
	open $(INSTALLED)

uninstall: stop ## Remove the app from /Applications
	rm -rf $(INSTALLED)

dist: build ## Make build/Namaz-<version>.dmg for sharing
	scripts/make-dmg.sh

# Without Xcode, SwiftPM intermittently fails to find Swift Testing's macro plugin, so name it.
TESTING_PLUGINS := $(shell dirname "$$(xcrun --find swift)")/../lib/swift/host/plugins/testing

test: ## Run the tests (one suite: make test FILTER=FormattingTests)
	swift test $(if $(FILTER),--filter $(FILTER)) $(if $(wildcard $(TESTING_PLUGINS)),-Xswiftc -plugin-path -Xswiftc $(TESTING_PLUGINS))

status: ## Say whether the app is running
	@pgrep -x Namaz > /dev/null && echo "Namaz is running" || echo "Namaz is not running"

logs: ## Follow the app's log
	log stream --info --predicate 'subsystem == "com.personal.namaz"'

clean: ## Delete build output
	rm -rf .build build
