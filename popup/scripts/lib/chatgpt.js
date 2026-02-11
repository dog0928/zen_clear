import { DEFAULT_CHATGPT_MATCH_PATTERNS } from './constants.js';

export const queryChatGptTab = (matchPatterns) => new Promise((resolve) => {
	if (!chrome?.tabs?.query) {
		resolve(null);
		return;
	}

	const patterns = Array.isArray(matchPatterns) && matchPatterns.length
		? matchPatterns
		: DEFAULT_CHATGPT_MATCH_PATTERNS;

	chrome.tabs.query({ url: patterns }, (tabs) => {
		if (chrome.runtime.lastError) {
			console.error('Failed to query chatgpt tabs', chrome.runtime.lastError);
			resolve(null);
			return;
		}

		resolve(tabs?.[0] ?? null);
	});
});

export const requestChatGptStatus = async (tabId) => new Promise((resolve) => {
	if (!tabId) {
		resolve({ ok: false, hasCodeBlock: false });
		return;
	}

	chrome.tabs.sendMessage(tabId, { type: 'ZEN_CHATGPT_STATUS' }, (response) => {
		if (chrome.runtime.lastError) {
			console.warn('ChatGPT status message error', chrome.runtime.lastError);
			resolve({ ok: false, hasCodeBlock: false });
			return;
		}
		resolve(response ?? { ok: false, hasCodeBlock: false });
	});
});

export const requestChatGptConvert = async (tabId) => new Promise((resolve) => {
	if (!tabId) {
		resolve({ ok: false });
		return;
	}

	chrome.tabs.sendMessage(tabId, { type: 'ZEN_CHATGPT_CONVERT' }, (response) => {
		if (chrome.runtime.lastError) {
			console.warn('ChatGPT convert message error', chrome.runtime.lastError);
			resolve({ ok: false });
			return;
		}
		resolve(response ?? { ok: false });
	});
});
