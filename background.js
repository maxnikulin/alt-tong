/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/* Copyright (C) 2017 Max Nikulin */

'use strict';

var AltTong = (function() {
	var currentMenu = new Map();
	var currentValue = null;
	const logPrefix = 'AltTong';

	// currentValue is implicit parameter
	const interceptor = {
		current: null,

		headerRewriter({ requestHeaders }) {
			if (currentValue == null)
				return;
			for (let header of requestHeaders) {
				if (header.name.toLowerCase() === 'accept-language') {
					header.value = currentValue.value;
					break;
				}
			}
			return { requestHeaders };
		},

		off() {
			if (this.current != null) {
				chrome.webRequest.onBeforeSendHeaders.removeListener(this.current);
				this.current = null;
			}
			return;
		},

		on() {
			if (this.current == null) {
				this.current = this.headerRewriter;
				chrome.webRequest.onBeforeSendHeaders.addListener(
					this.current,
					{ urls: [ 'http://*/*', 'https://*/*' ] },
					[ 'blocking', 'requestHeaders' ]
				);
			}
		}
	};

	// currentValue is an implicit parameter
	const contextMenus = ((interceptor) => {
		const contexts = [ "tab" ];
		const CMIID_DEFAULT = 'cmiid-default';
		const CMIID_CHECKBOX = 'cmiid-checkbox';
		const CMIID_OPTIONS = 'cmiid-options';
		function getCheckboxWorkaroundMessage(checked, settingTitle) {
			const msg = checked
				? chrome.i18n.getMessage("menuCheckboxDisable")
				: chrome.i18n.getMessage("menuCheckboxActivate");
			return `Alt Tong: ${msg} ${settingTitle || ""}`;
		}
		return {
			listener: null,

			configListener({menuItemId}) {
				if (menuItemId === CMIID_OPTIONS) {
					chrome.runtime.openOptionsPage();
				} else {
					console.error(`${logPrefix}: options: unknown context menu item id '${menuItemId}'`);
					interceptor.off();
				}
			},

			checkBoxListener({menuItemId, /* useless */ checked}) {
				if (CMIID_CHECKBOX != menuItemId) { // assert
					console.error(`${logPrefix}: checkbox: context menu item id '${menuItemId}' != '${CMIID_CHECKBOX}'`);
				}

				const menuValue = currentMenu.get(menuItemId);
				checked = !(menuValue && currentValue === menuValue); // next state
				chrome.contextMenus.update(menuItemId, {
					title: getCheckboxWorkaroundMessage(checked,
						menuValue && (menuValue.title || menuValue.value))
				});
				currentValue = null;
				if (!checked) {
					interceptor.off();
					return;
				}

				if (!menuValue) {
					console.error(`${logPrefix}: checkbox: unknown context menu item id '${menuItemId}'`);
					interceptor.off();
					return;
				}

				currentValue = menuValue;
				interceptor.on();
			},

			arrayListener({menuItemId}) {
				currentValue = null;
				if (menuItemId === CMIID_DEFAULT) {
					interceptor.off();
					return;
				}

				if (!currentMenu.has(menuItemId)) {
					console.error(`${logPrefix}: array: unknown context menu item id '${menuItemId}'`);
					interceptor.off();
					return;
				}

				currentValue = currentMenu.get(menuItemId);
				interceptor.on();
			},

			setListener(newListener) {
				if (newListener === this.listener) {
					return;
				}
				if (this.listener != null) {
					chrome.contextMenus.onClicked.removeListener(this.listener);
				}
				if (newListener != null) {
					this.listener = newListener;
					chrome.contextMenus.onClicked.addListener(this.listener);
				} else {
					console.error(`${logPrefix}: setListener(null)`);
					interceptor.off();
				}
			},

			createConfig(isDefault) {
				const prefix = isDefault ? '(!) ' : '';
				chrome.contextMenus.create({
					title: prefix + chrome.i18n.getMessage("contextMenuOptionsItem"),
					id: CMIID_OPTIONS,
					contexts
				});

				interceptor.off();
				this.setListener(this.configListener);
			},

			createCheckBox({checked, title}) {
				// Due to addon icon and item checkbox were overlapped on linux,
				// item with checkbox always go to submenu since ff 55.
				// https://bugzilla.mozilla.org/show_bug.cgi?id=1351418
				// Bug 1351418 "Single context menu item of checkbox
				// "breaks the context menu layout"
				// https://dxr.mozilla.org/mozilla-central/source/browser/components/extensions/ext-menus.js#144
				//
				// Workaround with suppressing of "16" and "32" icons by empty string in manifest.json
				// is not necessary any more.
				//
				// I am strongly against checkbox in submenu, so the only way
				// is to simulate checkbox behavior by changing menu item label.
				// otherwise the icon will be overlapped with checkbox.
				const id = CMIID_CHECKBOX;
				const result = chrome.contextMenus.create({
					title: getCheckboxWorkaroundMessage(checked, title),
					id,
					contexts,
					type: "normal"//, // Do not use "checkbox", see comments above
					// checked
				}, () => this.checkBoxListener({ menuItemId: id, checked }));

				this.setListener(this.checkBoxListener);
				return result;
			},

			createRadioItem({id, checked, title}) {
				return chrome.contextMenus.create(
					{
						title,
						id,
						contexts,
						type: "radio",
						checked
					},
					() => {
						if (checked) {
							this.checkBoxListener({ menuItemId: id, checked });
						}
					}
				);
			},

			createDefaultItem(checked) {
				const result = this.createRadioItem({
					id: CMIID_DEFAULT,
					checked,
					title: chrome.i18n.getMessage("menuDefault")
				});

				this.setListener(this.arrayListener);
				return result;
			}
		};
	})(interceptor);



	function updateContextMenu(newItems, defaultLangs) {
		let removed = browser.contextMenus.removeAll();
		currentMenu.clear();

		if (newItems == null || !(newItems.length > 0)) {
			const isDefault = (newItems != null
					&& newItems.length === 1 && newItems[0].value === defaultLangs);
			removed.then(() => contextMenus.createConfig(isDefault));
			return false;
		}

		const nonDefaultChecked = (currentValue != null) && (
			newItems.length === 1 || newItems.some(item => currentValue.value === item.value)
		);

		if (newItems.length === 1) {
			removed.then(() => {
				const item = newItems[0];
				currentValue = item;
				const id = contextMenus.createCheckBox({
					title: item.title || item.value,
					checked: nonDefaultChecked
				});
				currentMenu.set(id, item);
			});
		} else {
			// Not available trough options.html
			// May be tested from debugger
			// AltTong.configure({optionList: [ {value: "fr", title: "Fr"}, {value: "de", title: "De"} ] })

			// FIXME If newItems is string
			removed.then(() => {
				contextMenus.createDefaultItem(!nonDefaultChecked);
				newItems.forEach((item, index) => {
					if (item.value == null || item.value === '') {
						console.error(`${logPrefix}: empty value in updateContextMenu`);;
						return;
					}
					const id = "at-i" + (index + 1);
					const checked = nonDefaultChecked
						&& currentValue && item.value === currentValue.value;
					currentMenu.set(id, item);
					contextMenus.createRadioItem({
						title: item.title || item.value, // FIXME til , or ;
						id,
						checked
					});
				});
			});
		}
		return true;
	}

	const OPT_STORAGE_OPTION_LIST = "optionList";
	function getOptions() {
		return browser.storage.local.get(OPT_STORAGE_OPTION_LIST);
	}
	function saveOptions(options) {
		return browser.storage.local.set({
			[OPT_STORAGE_OPTION_LIST]: options[OPT_STORAGE_OPTION_LIST]
		});
	}
	function configure(options) {
		if (options != null) {
			return saveOptions(options)
				.then(() => doConfigure(options));
		} else {
			return getOptions().then(options => configure(options));
		}
	}
	function doConfigure(options) {
		return getAcceptLanguages()
			.then(
				langs => updateContextMenu(options.optionList, langs),
				() => updateContextMenu(options.optionList, null)
			).then(null, (e) => { console.error('Alt-Tong: doConfigure', e); });
	}

	function getAcceptLanguages() {
		// browser.i18n.getAcceptLanguages() returns array of language codes,
		// not a header content, so sniff for the actual value.
		return new Promise((resolve, reject) => {
			try {
				const testURL = 'http://localhost/';
				function extractAcceptLanguages({requestHeaders}) {
					var isFakeRequest = false;
					var acceptLanguage;
					for (let header of requestHeaders) {
						if (header.name.toLowerCase() === 'accept-language') {
							acceptLanguage = header.value;
						} else if (header.name.toLowerCase() === 'x-alttong-sniff-header') {
							isFakeRequest = true;
						}
						if (isFakeRequest && acceptLanguage != null) {
							break;
						}
					}
					if (isFakeRequest) {
						chrome.webRequest.onBeforeSendHeaders.removeListener(extractAcceptLanguages);
						resolve(acceptLanguage);
						return { cancel: true, requestHeaders };
					} else {
						return { requestHeaders };
					}
				}
				var fakeRequest = new XMLHttpRequest();
				fakeRequest.addEventListener('load', () => reject(new Error('Failed to catch test XHR')));
				fakeRequest.open('HEAD', testURL);
				fakeRequest.setRequestHeader('X-AltTong-Sniff-Header', 'Accept-Languages');

				const origReject = reject;
				reject = reason => {
					console.error(reason);
					chrome.webRequest.onBeforeSendHeaders.removeListener(extractAcceptLanguages);
					origReject(reason);
				};
				chrome.webRequest.onBeforeSendHeaders.addListener(
					extractAcceptLanguages,
					{ urls: [ testURL ] },
					[ 'blocking', 'requestHeaders' ]
				);
				// For some reason synchronous call of send() results in not caught request.
				// Zero timeout does not work during first loading of this extension.
				// Reload extension works even with zero timeout.
				setTimeout(() => fakeRequest.send(), 20);
			} catch (e) {
				reject(e);
			}
		});
	}

	return { configure, getOptions, getAcceptLanguages, OPT_STORAGE_OPTION_LIST };
})();

AltTong.configure();
