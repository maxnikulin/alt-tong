/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/* Copyright (C) 2017 Max Nikulin */

/* It is impossible to define locale-dependent options page in manifest.
 * "preprocess": "localize"
 * is necessary for options_ui.page in
 * toolkit/components/extensions/schemas/manifest.json
 */

'use strict';

function hi18n(doc) {
	const ATTR_NAME = 'data-i18n';
	for (let e of doc.querySelectorAll(`[${ATTR_NAME}]`)) {
		const key = e.getAttribute(ATTR_NAME);
		const value = chrome.i18n.getMessage(key);
		if (value != null && value != "") {
			e.innerHTML = value; // add-on's _locales/*/messages.json files are a trusted source for HTML.
		}
	}
}
