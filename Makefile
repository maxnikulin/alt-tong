
ifeq ($(TMPDIR),)
BUILDDIR = /tmp
else
BUILDDIR = $(TMPDIR)
endif

XPI_NAME = alt-tong-desktop@maxnikulin.github.io.xpi
XPI_FILE = $(BUILDDIR)/$(XPI_NAME)
ZIP = 7z

SOURCES += manifest.json background.js LICENSE
SOURCES += _locales/ru/messages.json _locales/en/messages.json
SOURCES += icons/alt-tong-48.png icons/alt-tong-96.png icons/transparent.png
SOURCES += options.html options.css options.js
SOURCES += hi18n.js

$(XPI_FILE): $(SOURCES)
	$(RM) $@
	$(ZIP) a $@ -tzip $^

clean:
	$(RM) $(XPI_FILE)

