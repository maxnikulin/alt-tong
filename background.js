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
			for (let header of requestHeaders) {
				if (header.name.toLowerCase() === 'accept-language') {
					header.value = currentValue;
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

			checkBoxListener({menuItemId, checked}) {
				if (CMIID_CHECKBOX != menuItemId) { // assert
					console.error(`${logPrefix}: checkbox: context menu item id '${menuItemId}' != '${CMIID_CHECKBOX}'`);
				}

				currentValue = null;
				if (!checked) {
					interceptor.off();
					return;
				}

				if (!currentMenu.has(menuItemId)) {
					console.error(`${logPrefix}: checkbox: unknown context menu item id '${menuItemId}'`);
					interceptor.off();
					return;
				}

				currentValue = currentMenu.get(menuItemId);
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
				// Suppress "16" and "32" icons by empty string in manifest.json,
				// otherwise the icon will be overlapped with checkbox.
				const id = CMIID_CHECKBOX;
				const result = chrome.contextMenus.create({
					title: `Alt Tong: ${title}`,
					id,
					contexts,
					type: "checkbox",
					checked
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
			const isDefault = (newItems.length === 1 && newItems[0].value === defaultLangs);
			removed.then(() => contextMenus.createConfig(isDefault));
			return false;
		}

		const nonDefaultChecked = (currentValue != null) && (
			newItems.length === 1 || newItems.some(item => currentValue === item.value)
		);

		if (newItems.length === 1) {
			removed.then(() => {
				const item = newItems[0];
				currentValue = item.value;
				const id = contextMenus.createCheckBox({
					title: item.title || item.value,
					checked: nonDefaultChecked
				});
				currentMenu.set(id, item.value);
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
					const checked = nonDefaultChecked && item.value === currentValue;
					currentMenu.set(id, item.value);
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
			.then(langs => updateContextMenu(options.optionList, langs));
	}

	function getAcceptLanguages() {
		// browser.i18n.getAcceptLanguages() returns array of language codes,
		// not a header content, so sniff for the actual value.
		return new Promise((resolve, reject) => {
			try {
				//const testURL = 'https://addons.mozilla.org/';
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
						// TODO Find origin of error "Unknown listener at ... path=webRequest.onBeforeSendHeaders listenerId=..."
						chrome.webRequest.onBeforeSendHeaders.removeListener(extractAcceptLanguages);
						resolve(acceptLanguage);
						return { cancel: true, requestHeaders };
					} else {
						return { requestHeaders };
					}
				}
				var fakeRequest = new XMLHttpRequest();
				fakeRequest.addEventListener('load', () => console.error('request not catched'));
				fakeRequest.open('HEAD', testURL);
				fakeRequest.setRequestHeader('X-AltTong-Sniff-Header', 'Accept-Languages');

				chrome.webRequest.onBeforeSendHeaders.addListener(
					extractAcceptLanguages,
					{ urls: [ testURL ] },
					[ 'blocking', 'requestHeaders' ]
				);
				// For some reason synchronous call of send() results in not catched request
				setTimeout(() => fakeRequest.send(), 0);
			} catch (e) {
				reject(e);
			}
		});
	}

	return { configure, getOptions, getAcceptLanguages, OPT_STORAGE_OPTION_LIST };
})();

AltTong.configure();
