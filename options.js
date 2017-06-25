/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/* Copyright (C) 2017 Max Nikulin */

hi18n(window.document);

const AltTong = browser.extension.getBackgroundPage().AltTong;
var form = document.getElementById("alt_tong_form");
var buttonBrowser = document.getElementById("set_to_brwoser_default");
var buttonSubmit = document.getElementById("submit");

function updateEnabled() {
	const input = form.alt_tong_accept_language.value.trim();
	buttonBrowser.disabled
		= form.default_accept_language.value === input;
	buttonSubmit.disabled
		= form.alt_tong_default_accept_language.value === input
			&& form.alt_default_title.value == form.alt_title.value.trim();
}

function refresh() {
	var promiseOptions = AltTong.getOptions().then(options => {
		let optList = options && options[AltTong.OPT_STORAGE_OPTION_LIST];
		const isConfigured = optList && optList.length > 0;
		const value = isConfigured ? optList[0].value : "";

		form.alt_tong_accept_language.value = value;
		form.alt_tong_default_accept_language.value = value;

		const title = isConfigured ? (optList[0].title || "") : "";
		form.alt_title.value = title;
		form.alt_default_title.value = title;
	});

	var promiseBrowser = AltTong.getAcceptLanguages().then(
		value => form.default_accept_language.value = value
	);
	Promise.all([promiseOptions, promiseBrowser]).then(() => updateEnabled());
}

function submit(e) {
	e.preventDefault();
	const value = form.alt_tong_accept_language.value.trim();
	const title = form.alt_title.value.trim();
	AltTong.configure({
		[AltTong.OPT_STORAGE_OPTION_LIST]: value ? [title ? {value, title} : {value}] : []
	}).then(() => refresh());
}

document.addEventListener('DOMContentLoaded', refresh);
form.alt_tong_accept_language.addEventListener("input", () => updateEnabled());
form.alt_title.addEventListener("input", () => updateEnabled());
form.addEventListener("submit", submit);
buttonBrowser.addEventListener("click", function(e) {
	form.alt_tong_accept_language.value = form.default_accept_language.value.trim();
	submit(e);
});
